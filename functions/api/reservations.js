/**
 * POST   /api/reservations — Que Sera Sera reservation intake.
 * PATCH  /api/reservations — self-service cancellation (reference + phone).
 *
 * Cloudflare Pages Function backed by a D1 binding (`env.DB`, see schema.sql).
 * Requests are deduplicated on `idempotency_key`, so a retried submit (flaky
 * mobile network, double tap) returns the original receipt instead of a second
 * booking. When the binding is absent — `wrangler pages dev` without
 * `--d1`, a fresh preview deploy — the endpoint still validates and answers
 * with a receipt, marked `stored: false`, so the front end behaves identically.
 *
 * Hardening in this file:
 *   - Origin allowlist (env.ALLOWED_ORIGINS, site origin, local dev), never `*`.
 *   - Bounded request bodies and content-type checks before parsing.
 *   - Per-IP and per-session rate limits on intake and lookup.
 *   - A honeypot field that silently drops bot submissions.
 *   - Inputs are stripped of control characters and angle brackets, so stored
 *     data is plain text; the client escapes again on render.
 *   - Security headers on every response, because `_headers` never applies to
 *     Pages Functions output.
 *
 * Every exit path is JSON, never an HTML error page.
 */

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PARTY = 20;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS = {
  post: { ip: 10, session: 8 },
  patch: { ip: 6, session: 5 },
};
const PRODUCTION_ORIGINS = ["https://queserasera.in", "https://www.queserasera.in"];
const LOCAL_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
];
const HONEYPOT_FIELDS = ["qss_check", "company", "website", "url"];

/* ------------------------------------------------------------------ */
/* Headers                                                             */
/* ------------------------------------------------------------------ */

function allowedOrigins(env) {
  const configured = typeof env?.ALLOWED_ORIGINS === "string"
    ? env.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter((value) => /^https?:\/\/[^\s/]+$/i.test(value))
    : [];

  const origins = configured.length ? configured.slice() : PRODUCTION_ORIGINS.slice();
  // Preview deployments and `wrangler pages dev` are same-origin, but a local
  // static server proxying the API needs these. Set ENVIRONMENT=production to
  // drop them.
  if (!env || env.ENVIRONMENT !== "production") origins.push(...LOCAL_ORIGINS);
  return origins;
}

/**
 * Resolve CORS for a request. `origin: null` means the caller is a browser on
 * a foreign origin and must be refused. An empty string means no Origin header
 * was sent (same-site fetch, curl, server-to-server), so no CORS headers.
 */
function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return { origin: "", headers: {} };

  let sameSite = false;
  try {
    sameSite = origin === new URL(request.url).origin;
  } catch {
    sameSite = false;
  }

  if (!sameSite && !allowedOrigins(env).includes(origin)) return { origin: null, headers: {} };

  return {
    origin,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": "Retry-After, X-RateLimit-Remaining",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  };
}

function replyFactory(cors) {
  return (body, status = 200, extra = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        Vary: "Origin",
        ...cors.headers,
        ...extra,
      },
    });
}

/* ------------------------------------------------------------------ */
/* Rate limiting (per isolate; back it with Cloudflare WAF rules too)  */
/* ------------------------------------------------------------------ */

const buckets = new Map();

function sweepBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
}

function hit(key, limit) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + RATE_WINDOW_MS };
    buckets.set(key, bucket);
    if (buckets.size > 10_000) sweepBuckets(now);
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)),
  };
}

function clientIp(request) {
  const connecting = request.headers.get("CF-Connecting-IP");
  if (connecting) return connecting.trim();
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function sessionId(request) {
  const value = String(request.headers.get("X-Session-Id") || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : "";
}

function checkRate(request, kind) {
  const limits = RATE_LIMITS[kind];
  const ip = hit("ip:" + kind + ":" + clientIp(request), limits.ip);
  const session = sessionId(request);
  const perSession = session ? hit("session:" + kind + ":" + session, limits.session) : null;

  const blocked = !ip.ok || (perSession !== null && !perSession.ok);
  const remaining = Math.min(ip.remaining, perSession ? perSession.remaining : Number.MAX_SAFE_INTEGER);
  const retryAfter = Math.max(
    ip.ok ? 0 : ip.retryAfter,
    perSession && !perSession.ok ? perSession.retryAfter : 0
  );

  return {
    blocked,
    headers: {
      "X-RateLimit-Remaining": String(remaining),
      ...(blocked ? { "Retry-After": String(retryAfter || ip.retryAfter) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Input handling                                                      */
/* ------------------------------------------------------------------ */

/** Plain text only: drop control characters and angle brackets, cap length. */
function clean(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Match Indian numbers written with or without the 91 country code. */
function phoneKey(value) {
  const d = digits(value);
  return d.length > 10 ? d.slice(-10) : d;
}

function referenceFor(idempotencyKey) {
  let hash = 0x811c9dc5;
  const key = String(idempotencyKey || "");
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const suffix = (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
  return "QSS-" + suffix;
}

function normalizeReference(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 20);
}

/** Bots fill fields a guest never sees. */
function honeypotTripped(body) {
  return HONEYPOT_FIELDS.some(
    (field) => typeof body[field] === "string" && body[field].trim() !== ""
  );
}

async function readJson(request) {
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    return { error: "content_type" };
  }

  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return { error: "too_large" };

  let text;
  try {
    text = await request.text();
  } catch {
    return { error: "unreadable" };
  }
  if (text.length > MAX_BODY_BYTES) return { error: "too_large" };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "unreadable" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "unreadable" };
  }
  return { body: parsed };
}

function bodyErrorReply(reply, error) {
  if (error === "too_large") {
    return reply({ ok: false, error: "That request was too large. Please try again." }, 413);
  }
  if (error === "content_type") {
    return reply({ ok: false, error: "Please send this request as JSON." }, 415);
  }
  return reply({ ok: false, error: "We could not read that request. Please try again." }, 400);
}

function validate(body) {
  const fields = {};
  const guestName = clean(body.guest_name, 80);
  const phoneRaw = clean(body.phone, 24);
  const phone = digits(phoneRaw);
  const date = clean(body.reservation_date, 10);
  const timeSlot = clean(body.time_slot, 20);
  const partySize = Number.parseInt(body.party_size, 10);
  const requests = clean(body.special_requests, 500);
  const consent = body.consent === true;

  if (guestName.length < 2) fields.guest_name = "Please tell us who the table is for.";
  if (phone.length < 10 || phone.length > 15) {
    fields.phone = "Enter a phone number we can reach you on (at least 10 digits).";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
    fields.reservation_date = "Choose the date you would like to come.";
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) fields.reservation_date = "That date has already passed — pick a future evening.";
  }
  if (!/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(timeSlot)) fields.time_slot = "Pick a time for your booking.";
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > MAX_PARTY) {
    fields.party_size = "We can hold tables of 1 to " + MAX_PARTY + " online — call us for a larger party.";
  }
  if (!consent) {
    fields.consent = "Please agree to the privacy notice so we can store your booking.";
  }

  const idempotencyKey = clean(body.idempotency_key, 100) || crypto.randomUUID();

  return {
    fields,
    hasErrors: Object.keys(fields).length > 0,
    row: {
      reference: referenceFor(idempotencyKey),
      guest_name: guestName,
      phone,
      reservation_date: date,
      time_slot: timeSlot,
      party_size: partySize,
      special_requests: requests || null,
      utm_source: clean(body.utm_source, 120) || null,
      utm_medium: clean(body.utm_medium, 120) || null,
      utm_campaign: clean(body.utm_campaign, 120) || null,
      idempotency_key: idempotencyKey,
      consent_at: consent ? new Date().toISOString() : null,
    },
  };
}

function receipt(row, stored, duplicate) {
  const reference = row.reference || referenceFor(row.idempotency_key);
  return {
    ok: true,
    stored,
    duplicate: Boolean(duplicate),
    reference,
    reservation: {
      confirmation_code: reference,
      reference,
      guest_name: row.guest_name,
      reservation_date: row.reservation_date,
      time_slot: row.time_slot,
      party_size: row.party_size,
      status: row.status || "pending",
      created_at: row.created_at || new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export function onRequestGet({ request, env }) {
  const reply = replyFactory(corsFor(request, env));
  return reply(
    { ok: false, error: "Use POST to request a table, or PATCH to cancel a booking." },
    405,
    { Allow: "POST, PATCH, OPTIONS" }
  );
}

export function onRequestOptions({ request, env }) {
  const cors = corsFor(request, env);
  if (cors.origin === null) {
    return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handlePost({ request, env }) {
  const cors = corsFor(request, env);
  const reply = replyFactory(cors);
  if (cors.origin === null) {
    return reply({ ok: false, error: "This origin is not allowed to submit reservations." }, 403);
  }

  const rate = checkRate(request, "post");
  if (rate.blocked) {
    return reply(
      {
        ok: false,
        error: "Too many requests from this connection. Please wait a moment, or call us on +91 77000 04311.",
      },
      429,
      rate.headers
    );
  }

  const parsed = await readJson(request);
  if (parsed.error) return bodyErrorReply(reply, parsed.error);

  const body = parsed.body;
  const rateHeaders = rate.headers;

  // Bot filled the off-screen field: answer like a normal success, store nothing.
  if (honeypotTripped(body)) {
    const idempotencyKey = clean(body.idempotency_key, 100) || crypto.randomUUID();
    return reply(
      receipt(
        {
          reference: referenceFor(idempotencyKey),
          guest_name: clean(body.guest_name, 80) || "Guest",
          reservation_date: clean(body.reservation_date, 10),
          time_slot: clean(body.time_slot, 20),
          party_size: Number.parseInt(body.party_size, 10) || 2,
          status: "pending",
          idempotency_key: idempotencyKey,
        },
        false,
        false
      ),
      200,
      rateHeaders
    );
  }

  const { fields, hasErrors, row } = validate(body);
  if (hasErrors) {
    return reply(
      { ok: false, error: "Please check the highlighted fields and try again.", fields },
      422,
      rateHeaders
    );
  }

  // Local / unbound D1: answer exactly like a stored booking so the UI can be
  // developed and demoed without Cloudflare credentials.
  if (!env || !env.DB) {
    return reply(receipt(row, false, false), 200, rateHeaders);
  }

  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO reservations
        (reference, guest_name, phone, reservation_date, time_slot, party_size,
         special_requests, utm_source, utm_medium, utm_campaign,
         idempotency_key, status, consent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`
    )
      .bind(
        row.reference,
        row.guest_name,
        row.phone,
        row.reservation_date,
        row.time_slot,
        row.party_size,
        row.special_requests,
        row.utm_source,
        row.utm_medium,
        row.utm_campaign,
        row.idempotency_key,
        row.consent_at,
        new Date().toISOString()
      )
      .run();

    if (inserted?.meta?.changes === 0) {
      // Same idempotency key seen before — hand back the original receipt.
      const existing = await env.DB.prepare(
        `SELECT reference, guest_name, reservation_date, time_slot, party_size,
                status, created_at, idempotency_key
           FROM reservations WHERE idempotency_key = ?`
      )
        .bind(row.idempotency_key)
        .first();
      if (existing) return reply(receipt(existing, true, true), 200, rateHeaders);
    }

    return reply(receipt(row, true, false), 200, rateHeaders);
  } catch (error) {
    console.error("reservations: D1 insert failed", error);
    return reply(
      {
        ok: false,
        error: "The reservation book is briefly unavailable. Please call us on +91 77000 04311 and we will hold your table.",
      },
      503
    );
  }
}

/** Self-service cancellation, authorised by reference + phone. */
async function handlePatch({ request, env }) {
  const cors = corsFor(request, env);
  const reply = replyFactory(cors);
  if (cors.origin === null) {
    return reply({ ok: false, error: "This origin is not allowed to manage reservations." }, 403);
  }

  const rate = checkRate(request, "patch");
  if (rate.blocked) {
    return reply(
      {
        ok: false,
        error: "Too many cancellation attempts. Please wait a moment, or call us on +91 77000 04311.",
      },
      429,
      rate.headers
    );
  }

  const parsed = await readJson(request);
  if (parsed.error) return bodyErrorReply(reply, parsed.error);

  const body = parsed.body;
  if (honeypotTripped(body)) {
    return reply({ ok: false, error: "We could not find a booking with those details." }, 404);
  }

  const reference = normalizeReference(body.reference);
  const phone = phoneKey(body.phone);
  const fields = {};

  if (!/^QSS-[A-Z0-9]{6}$/.test(reference)) {
    fields.reference = "Enter the booking reference shown on your receipt, like QSS-4K9P2M.";
  }
  if (phone.length < 10) {
    fields.phone = "Enter the same phone number you booked with.";
  }
  if (Object.keys(fields).length) {
    return reply(
      { ok: false, error: "Please check the highlighted fields and try again.", fields },
      422,
      rate.headers
    );
  }

  const cancelledReservation = (row, stored) => ({
    ok: true,
    stored,
    cancelled: true,
    alreadyCancelled: row.status === "cancelled",
    reference: row.reference || reference,
    reservation: {
      confirmation_code: row.reference || reference,
      reference: row.reference || reference,
      guest_name: row.guest_name,
      reservation_date: row.reservation_date,
      time_slot: row.time_slot,
      party_size: row.party_size,
      status: "cancelled",
      created_at: row.created_at || null,
    },
  });

  if (!env || !env.DB) {
    return reply(
      {
        ok: true,
        stored: false,
        cancelled: true,
        reference,
        reservation: { reference, status: "cancelled" },
      },
      200,
      rate.headers
    );
  }

  try {
    const row = await env.DB.prepare(
      `SELECT reference, guest_name, phone, reservation_date, time_slot,
              party_size, status, created_at
         FROM reservations WHERE reference = ?`
    )
      .bind(reference)
      .first();

    if (!row) {
      return reply(
        {
          ok: false,
          error: "We could not find a booking with that reference. Check the code on your receipt, or call us on +91 77000 04311.",
        },
        404,
        rate.headers
      );
    }
    if (phoneKey(row.phone) !== phone) {
      return reply(
        {
          ok: false,
          error: "That phone number does not match this booking. Use the number you booked with, or call us on +91 77000 04311.",
        },
        403,
        rate.headers
      );
    }
    if (row.status === "cancelled") {
      return reply(cancelledReservation(row, true), 200, rate.headers);
    }

    await env.DB.prepare("UPDATE reservations SET status = 'cancelled' WHERE reference = ?")
      .bind(reference)
      .run();

    return reply(cancelledReservation({ ...row, status: "cancelled" }, true), 200, rate.headers);
  } catch (error) {
    console.error("reservations: D1 cancellation failed", error);
    return reply(
      {
        ok: false,
        error: "The reservation book is briefly unavailable. Please call us on +91 77000 04311 to cancel.",
      },
      503
    );
  }
}

export async function onRequestPost(context) {
  try {
    return await handlePost(context);
  } catch (error) {
    console.error("reservations: unhandled POST error", sanitizeError(error));
    const reply = replyFactory(corsFor(context.request, context.env));
    return reply(
      { ok: false, error: "Something went wrong saving your table request. Please call us on +91 77000 04311." },
      500
    );
  }
}

export async function onRequestPatch(context) {
  try {
    return await handlePatch(context);
  } catch (error) {
    console.error("reservations: unhandled PATCH error", sanitizeError(error));
    const reply = replyFactory(corsFor(context.request, context.env));
    return reply(
      { ok: false, error: "Something went wrong cancelling that booking. Please call us on +91 77000 04311." },
      500
    );
  }
}

/**
 * Never log a raw exception: D1/JSON parse messages can quote request data.
 * Keep the stack for debugging, drop anything that looks like guest details.
 */
function sanitizeError(error) {
  if (!error) return "unknown error";
  const name = error.name || "Error";
  const message = String(error.message || "")
    .replace(/\b\d{6,}\b/g, "[number]")
    .slice(0, 200);
  return name + ": " + message;
}
