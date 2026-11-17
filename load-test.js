#!/usr/bin/env node
/**
 * Que Sera Sera — zero-dependency load test.
 *
 * Fires a fixed number of concurrent requests for a fixed number of seconds
 * and prints throughput, average / p95 latency and the error rate. Only
 * Node's built-in modules are used, so there is nothing to install.
 *
 *   node load-test.js
 *   node load-test.js http://localhost:3000 --concurrency 100 --duration 10
 *   node load-test.js https://queserasera.in --path / --concurrency 25
 *   node load-test.js --path /api/reservations        (expects a 405, counts as error)
 *
 * Flags: --concurrency <n> (default 100), --duration <seconds> (default 10),
 *        --path </route> (default /), --timeout <ms> (default 5000).
 */
"use strict";

const http = require("node:http");
const https = require("node:https");
const { performance } = require("node:perf_hooks");

const DEFAULTS = {
  url: "http://localhost:3000",
  path: "/",
  concurrency: 100,
  duration: 10,
  timeout: 5000,
};

const MAX_CONCURRENCY = 1000;

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    const key = rawKey.trim();
    const value = inlineValue !== undefined ? inlineValue : argv[++i];
    if (key === "concurrency") options.concurrency = Number.parseInt(value, 10);
    else if (key === "duration") options.duration = Number.parseFloat(value);
    else if (key === "timeout") options.timeout = Number.parseInt(value, 10);
    else if (key === "path") options.path = value || DEFAULTS.path;
    else throw new Error(`Unknown flag: --${key}`);
  }

  if (positional.length) options.url = positional[0];
  return options;
}

function usage() {
  return [
    "Usage: node load-test.js [url] [options]",
    "",
    "  --concurrency <n>   simultaneous workers (default 100)",
    "  --duration <sec>    test length in seconds (default 10)",
    "  --path <route>      path to request (default /)",
    "  --timeout <ms>      per-request timeout (default 5000)",
    "",
    "Example: node load-test.js http://localhost:3000 --concurrency 100 --duration 10",
  ].join("\n");
}

function validate(options) {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > MAX_CONCURRENCY) {
    throw new Error(`--concurrency must be an integer between 1 and ${MAX_CONCURRENCY}.`);
  }
  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new Error("--duration must be a positive number of seconds.");
  }
  if (!Number.isInteger(options.timeout) || options.timeout < 100) {
    throw new Error("--timeout must be at least 100 milliseconds.");
  }
  let target;
  try {
    target = new URL(options.url);
  } catch {
    throw new Error(`Not a valid URL: ${options.url}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http:// and https:// targets are supported.");
  }
  if (!options.path.startsWith("/")) options.path = "/" + options.path;
  if (options.path === DEFAULTS.path && target.pathname !== "/") {
    options.path = target.pathname + target.search;
  }
  return target;
}

/** One GET request, resolved with its latency and status — never rejects. */
function requestOnce(transport, target, agent, timeoutMs) {
  return new Promise((resolve) => {
    const started = performance.now();
    const finish = (result) => resolve({ latency: performance.now() - started, ...result });

    let req;
    try {
      req = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: target.pathname + target.search,
          method: "GET",
          agent,
          headers: {
            Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
            "User-Agent": "que-sera-sera-load-test/1.0",
            "Cache-Control": "no-cache",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => {
            finish({
              ok: res.statusCode >= 200 && res.statusCode < 400,
              status: res.statusCode,
            });
          });
          res.on("error", (error) => finish({ ok: false, status: 0, error: error.code || error.message }));
        }
      );
    } catch (error) {
      finish({ ok: false, status: 0, error: error.code || error.message });
      return;
    }

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => finish({ ok: false, status: 0, error: error.code || error.message }));
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function formatMs(value) {
  return value.toFixed(1) + " ms";
}

async function main() {
  let options;
  let target;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return 0;
    }
    target = validate(options);
  } catch (error) {
    console.error("load-test: " + error.message + "\n");
    console.error(usage());
    return 2;
  }

  const transport = target.protocol === "https:" ? https : http;
  const agent = new transport.Agent({
    keepAlive: true,
    maxSockets: options.concurrency,
    maxFreeSockets: options.concurrency,
  });

  const requestUrl = new URL(options.path, target.origin);
  const address = requestUrl.href;

  const state = {
    total: 0,
    ok: 0,
    errors: 0,
    latencies: [],
    statuses: new Map(),
    errorCodes: new Map(),
    aborted: "",
  };

  console.log("Que Sera Sera load test");
  console.log("  target       " + address);
  console.log("  concurrency  " + options.concurrency + " concurrent requests");
  console.log("  duration     " + options.duration + "s");
  console.log("");

  const startedAt = performance.now();
  const deadline = startedAt + options.duration * 1000;

  function record(result) {
    state.total += 1;
    state.latencies.push(result.latency);
    if (result.ok) {
      state.ok += 1;
    } else {
      state.errors += 1;
      const code = result.status
        ? "HTTP " + result.status
        : String(result.error || "network error");
      state.errorCodes.set(code, (state.errorCodes.get(code) || 0) + 1);
    }
    if (result.status) {
      state.statuses.set(result.status, (state.statuses.get(result.status) || 0) + 1);
    }
  }

  async function worker() {
    while (performance.now() < deadline && !state.aborted) {
      const result = await requestOnce(transport, requestUrl, agent, options.timeout);
      record(result);
      // Fail fast when nothing is listening instead of hammering a dead port.
      if (state.total >= options.concurrency * 2 && state.ok === 0) {
        state.aborted = "every request failed — is the server running at " + address + "?";
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, worker));

  const elapsed = Math.max(0.001, (performance.now() - startedAt) / 1000);
  const sorted = state.latencies.slice().sort((a, b) => a - b);
  const average = sorted.length
    ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
    : 0;
  const errorRate = state.total ? (state.errors / state.total) * 100 : 0;

  const statuses = Array.from(state.statuses.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => status + " ×" + count)
    .join(" · ");

  console.log("  requests     " + state.total.toLocaleString("en-US"));
  console.log("  throughput   " + (state.total / elapsed).toFixed(1) + " req/sec");
  console.log("  latency      avg " + formatMs(average) +
    " · p95 " + formatMs(percentile(sorted, 0.95)) +
    " · max " + formatMs(sorted.length ? sorted[sorted.length - 1] : 0));
  console.log("  errors       " + state.errors.toLocaleString("en-US") +
    " (" + errorRate.toFixed(2) + "%)");
  if (statuses) console.log("  statuses     " + statuses);
  if (state.errorCodes.size) {
    console.log("  reasons      " +
      Array.from(state.errorCodes.entries()).map(([code, count]) => code + " ×" + count).join(" · "));
  }
  console.log("");
  console.log("  finished in " + elapsed.toFixed(1) + "s");
  if (state.aborted) console.log("  aborted: " + state.aborted);

  agent.destroy();

  if (!state.total) {
    console.error("load-test: no requests completed.");
    return 1;
  }
  return errorRate > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("load-test: " + (error && error.stack ? error.stack : error));
    process.exitCode = 1;
  });
