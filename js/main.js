/* Que Sera Sera — interaction layer
   Theme + accessibility, menu filters, search drawer, reservations, copy, FAQ. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PHONE = "+91 77000 04311";
  var WHATSAPP = "917700004311";
  var store = {
    get: function (key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* private mode */ }
    }
  };
  var session = {
    get: function (key) {
      try { return window.sessionStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.sessionStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
    remove: function (key) {
      try { window.sessionStorage.removeItem(key); } catch (e) { /* private mode */ }
    }
  };

  /* One polite live region for messages that are not already a status element:
     errors, receipts, cancellations and copy confirmations. */
  var srAnnouncer = document.getElementById("sr-announcer");
  function announce(message) {
    if (!srAnnouncer || !message) return;
    srAnnouncer.textContent = "";
    window.requestAnimationFrame(function () { srAnnouncer.textContent = message; });
  }

  /* A random per-tab id lets the API rate-limit a session that changes IP,
     without storing anything identifying. */
  var SESSION_ID_KEY = "qss-session-id";
  function apiSessionId() {
    var stored = session.get(SESSION_ID_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored;
    var id = "";
    if (window.crypto && typeof window.crypto.randomUUID === "function") id = window.crypto.randomUUID();
    if (!id) {
      var bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      id = [].slice.call(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    session.set(SESSION_ID_KEY, id);
    return id;
  }

  function apiHeaders() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Session-Id": apiSessionId()
    };
  }

  /* ---------- Theme ---------- */
  var themeBtn = document.querySelector("[data-toggle-theme]");
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#F6F2E9" : "#0B0B0D");
    if (themeBtn) {
      themeBtn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      themeBtn.setAttribute("aria-label", theme === "light" ? "Switch to night mode" : "Switch to daylight mode");
    }
  }
  applyTheme(store.get("qss-theme") === "light" ? "light" : "dark");

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      store.set("qss-theme", next);
    });
  }

  /* ---------- Accessibility panel ---------- */
  var a11yBtn = document.querySelector("[data-toggle-a11y]");
  var a11yPanel = document.getElementById("a11yPanel");
  var contrastBtn = document.querySelector("[data-toggle-contrast]");
  var scaleBtns = [].slice.call(document.querySelectorAll("[data-scale-set]"));

  function applyContrast(on) {
    root.setAttribute("data-contrast", on ? "high" : "normal");
    if (contrastBtn) contrastBtn.setAttribute("aria-checked", on ? "true" : "false");
  }
  function applyScale(value) {
    root.setAttribute("data-scale", value);
    scaleBtns.forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-scale-set") === value ? "true" : "false");
    });
  }

  applyContrast(store.get("qss-contrast") === "high");
  applyScale(store.get("qss-scale") || "1");

  if (a11yBtn && a11yPanel) {
    a11yBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleA11y(a11yPanel.hidden);
    });
  }
  function toggleA11y(open) {
    if (!a11yPanel || !a11yBtn) return;
    a11yPanel.hidden = !open;
    a11yBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var first = a11yPanel.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    }
  }
  document.addEventListener("click", function (event) {
    if (!a11yPanel || a11yPanel.hidden) return;
    if (a11yPanel.contains(event.target) || (a11yBtn && a11yBtn.contains(event.target))) return;
    toggleA11y(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && a11yPanel && !a11yPanel.hidden) {
      toggleA11y(false);
      if (a11yBtn) a11yBtn.focus();
    }
  });
  if (contrastBtn) {
    contrastBtn.addEventListener("click", function () {
      var next = contrastBtn.getAttribute("aria-checked") !== "true";
      applyContrast(next);
      store.set("qss-contrast", next ? "high" : "normal");
    });
  }
  scaleBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var value = btn.getAttribute("data-scale-set");
      applyScale(value);
      store.set("qss-scale", value);
    });
  });

  /* ---------- Header state ---------- */
  var header = document.getElementById("siteHeader");
  var lastY = -1;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (y === lastY) return;
    lastY = y;
    if (header) header.classList.toggle("is-stuck", y > 24);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile nav ---------- */
  var navToggle = document.querySelector("[data-toggle-nav]");
  var mobileNav = document.getElementById("mobileNav");
  function setMobileNav(open) {
    if (!mobileNav || !navToggle) return;
    mobileNav.hidden = !open;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    document.body.classList.toggle("no-scroll", open);
  }
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setMobileNav(mobileNav.hidden);
    });
  }
  if (mobileNav) {
    mobileNav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMobileNav(false);
    });
  }
  window.addEventListener("resize", function () {
    if (window.innerWidth > 1080 && mobileNav && !mobileNav.hidden) setMobileNav(false);
  });

  /* ---------- Quick contact ---------- */
  var quickBtn = document.querySelector("[data-toggle-quick]");
  var quickPanel = document.getElementById("quickPanel");
  function setQuick(open) {
    if (!quickPanel || !quickBtn) return;
    quickPanel.hidden = !open;
    quickBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (quickBtn) {
    quickBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      setQuick(quickPanel.hidden);
    });
  }
  document.addEventListener("click", function (event) {
    if (!quickPanel || quickPanel.hidden) return;
    if (quickPanel.contains(event.target) || quickBtn.contains(event.target)) return;
    setQuick(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && quickPanel && !quickPanel.hidden) {
      setQuick(false);
      quickBtn.focus();
    }
  });

  /* ---------- Toast ---------- */
  var toastEl = document.querySelector("[data-toast]");
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  /* ---------- Menu filters ---------- */
  var kitchenStatus = document.querySelector("[data-kitchen-status]");

  function filterGroup(buttons, items, attr) {
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute(attr);
        buttons.forEach(function (other) {
          other.setAttribute("aria-pressed", other === btn ? "true" : "false");
        });
        var shown = 0;
        var itemAttr = attr === "data-filter" ? "data-cat" : "data-bar";
        items.forEach(function (item) {
          var match = key === "all" || item.getAttribute(itemAttr) === key;
          item.classList.toggle("is-hidden", !match);
          if (match) shown++;
        });
        if (kitchenStatus && attr === "data-filter") {
          if (key === "setlunch") {
            kitchenStatus.textContent = "Set Lunch · ₹899++ per guest · minimum 5 guests";
          } else if (key === "all") {
            kitchenStatus.textContent = "Showing " + Math.max(0, shown - 1) + " dishes + weekday set lunch";
          } else {
            kitchenStatus.textContent = "Showing " + shown + " " + btn.textContent.toLowerCase();
          }
        }
      });
    });
  }

  var kitchenBtns = [].slice.call(document.querySelectorAll("[data-filter]"));
  var kitchenItems = [].slice.call(document.querySelectorAll('[data-menu="kitchen"] .dish'));
  filterGroup(kitchenBtns, kitchenItems, "data-filter");

  var barBtns = [].slice.call(document.querySelectorAll("[data-filter-bar]"));
  var barItems = [].slice.call(document.querySelectorAll('[data-menu="bar"] .cocktail'));
  filterGroup(barBtns, barItems, "data-filter-bar");

  /* ---------- FAQ accordion ---------- */
  var faqButtons = [].slice.call(document.querySelectorAll(".faq-question"));
  faqButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      if (panel) panel.hidden = open;
    });
  });

  /* ---------- Copy buttons ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.className = "copy-area";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(area);
      }
    });
  }

  [].slice.call(document.querySelectorAll("[data-copy], [data-copy-text]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetId = btn.getAttribute("data-copy");
      var text = btn.getAttribute("data-copy-text");
      if (!text && targetId) {
        var target = document.getElementById(targetId);
        text = target ? (target.textContent || "").trim() : "";
      }
      if (!text) return;
      copyText(text).then(function () {
        var label = btn.querySelector("span");
        var original = label ? label.textContent : "";
        btn.classList.add("is-copied");
        if (label) label.textContent = "Copied";
        toast("Copied to clipboard");
        announce("Copied to clipboard.");
        window.setTimeout(function () {
          btn.classList.remove("is-copied");
          if (label) label.textContent = original;
        }, 2200);
      }).catch(function () {
        toast("Copy unavailable — " + text);
      });
    });
  });

  /* ---------- Dialogs (age, cancellation, privacy, cookie, accessibility) ---------- */
  var openDialogs = [];

  function dialogSupportsModal(dialogEl) {
    return typeof dialogEl.showModal === "function";
  }

  function syncScrollLock() {
    var searchOpen = drawer && !drawer.hidden;
    var navOpen = mobileNav && !mobileNav.hidden;
    document.body.classList.toggle("no-scroll", openDialogs.length > 0 || Boolean(searchOpen) || Boolean(navOpen));
  }

  function openDialog(dialogEl, opener) {
    if (!dialogEl || openDialogs.indexOf(dialogEl) !== -1) return;
    dialogEl._opener = opener || document.activeElement;
    dialogEl._manualFocus = !dialogSupportsModal(dialogEl);
    if (dialogEl._manualFocus) {
      dialogEl.setAttribute("open", "");
      dialogEl.setAttribute("aria-modal", "true");
    } else {
      dialogEl.showModal();
    }
    openDialogs.push(dialogEl);
    syncScrollLock();
    var target = dialogEl.querySelector("[data-autofocus]") ||
      dialogEl.querySelector("button, a[href], input, select, textarea");
    if (target) {
      window.setTimeout(function () {
        try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      }, 40);
    }
  }

  function closeDialog(dialogEl) {
    if (!dialogEl) return;
    var index = openDialogs.indexOf(dialogEl);
    if (index !== -1) openDialogs.splice(index, 1);
    if (dialogSupportsModal(dialogEl) && dialogEl.open) dialogEl.close();
    else dialogEl.removeAttribute("open");
    syncScrollLock();
    if (dialogEl._opener && dialogEl._opener.focus) {
      try { dialogEl._opener.focus({ preventScroll: true }); } catch (e) { dialogEl._opener.focus(); }
    }
  }

  [].slice.call(document.querySelectorAll("dialog.modal")).forEach(function (dialogEl) {
    dialogEl.addEventListener("close", function () {
      var index = openDialogs.indexOf(dialogEl);
      if (index !== -1) openDialogs.splice(index, 1);
      syncScrollLock();
    });
    dialogEl.addEventListener("click", function (event) {
      if (event.target === dialogEl) closeDialog(dialogEl);
    });
  });

  document.addEventListener("keydown", function (event) {
    var dialogEl = openDialogs[openDialogs.length - 1];
    if (!dialogEl) return;
    if (event.key === "Escape" && dialogEl._manualFocus) {
      event.preventDefault();
      closeDialog(dialogEl);
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = [].slice.call(dialogEl.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("click", function (event) {
    var closer = event.target.closest("[data-close-dialog]");
    if (closer) {
      var parentDialog = closer.closest("dialog");
      if (parentDialog) closeDialog(parentDialog);
    }

    var rebook = event.target.closest("[data-rebook]");
    if (rebook) {
      var barOrForm = document.getElementById("reservations");
      if (barOrForm) barOrForm.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      window.setTimeout(function () {
        var nameInput = document.getElementById("rName");
        if (nameInput) nameInput.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 420);
    }

    var openerEl = event.target.closest("[data-open-dialog]");
    if (!openerEl) return;
    event.preventDefault();
    var dialogEl = document.getElementById(openerEl.getAttribute("data-open-dialog"));
    if (!dialogEl) return;
    if (openerEl.hasAttribute("data-cancel-reset") || openerEl.hasAttribute("data-cancel-ref")) resetCancel();
    openDialog(dialogEl, openerEl);
    if (openerEl.hasAttribute("data-cancel-ref")) {
      startCancelWith(openerEl.getAttribute("data-cancel-ref"), openerEl.getAttribute("data-cancel-phone") || "");
    }
  });

  /* ---------- Maharashtra age gate ---------- */
  var AGE_KEY = "qss-age-band";
  var ageDialog = document.getElementById("ageDialog");
  var barMenu = document.querySelector("[data-bar-menu]");
  var ageLock = document.querySelector("[data-age-lock]");
  var ageNote = document.querySelector("[data-age-note]");
  var pendingBarJump = false;

  function currentAgeBand() {
    var band = session.get(AGE_KEY);
    return band === "25+" || band === "21-24" || band === "under21" ? band : "";
  }

  function applyAgeBand(band) {
    root.setAttribute("data-age", band || "unverified");
    var verified = band === "25+" || band === "21-24";
    if (barMenu) barMenu.hidden = !verified;
    if (ageLock) {
      ageLock.hidden = verified;
      var lockTitle = ageLock.querySelector(".age-lock-title");
      var lockBtn = ageLock.querySelector("[data-open-age]");
      if (lockTitle) {
        lockTitle.textContent = band === "under21"
          ? "Alcohol is not served to guests under 21."
          : "The bar list is for guests 21 and over.";
      }
      if (lockBtn) lockBtn.textContent = band === "under21" ? "I entered the wrong age" : "Verify my age";
    }
    if (ageNote) ageNote.hidden = band !== "21-24";

    var spirits = [].slice.call(document.querySelectorAll('.cocktail[data-bar="signature"], .cocktail[data-bar="timeless"]'));
    var spiritFilters = [].slice.call(document.querySelectorAll('[data-filter-bar="signature"], [data-filter-bar="timeless"]'));
    spirits.forEach(function (el) { el.hidden = band === "21-24"; });
    spiritFilters.forEach(function (el) { el.hidden = band === "21-24"; });
    if (band === "21-24") {
      var zeroBtn = document.querySelector('[data-filter-bar="zero"]');
      if (zeroBtn && zeroBtn.getAttribute("aria-pressed") !== "true") zeroBtn.click();
    } else {
      var allBtn = document.querySelector('[data-filter-bar="all"]');
      if (allBtn) allBtn.click();
    }
  }

  applyAgeBand(currentAgeBand());

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-open-age], a[href='#bar']");
    if (!trigger) return;
    if (event.target.closest("[data-open-dialog]")) return;
    var band = currentAgeBand();
    // Under-21 guests keep the bar locked, but the policy panel must let them
    // correct a mistaken answer without clearing storage manually.
    var correcting = band === "under21" && trigger.hasAttribute("data-open-age");
    if (band && !correcting) return;
    if (correcting) {
      session.remove(AGE_KEY);
      applyAgeBand("");
    }
    event.preventDefault();
    pendingBarJump = true;
    if (mobileNav && !mobileNav.hidden) setMobileNav(false);
    openDialog(ageDialog, trigger);
  });

  [].slice.call(document.querySelectorAll("[data-age-band]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var band = btn.getAttribute("data-age-band");
      session.set(AGE_KEY, band);
      applyAgeBand(band);
      closeDialog(ageDialog);
      if (band === "under21") {
        announce("Age recorded. Alcohol is not served to guests under 21; the dining room is open to all ages.");
      } else if (band === "21-24") {
        announce("Age verified: 21 to 24. Zero-proof drinks and beer or wine are available; spirits and cocktails are not.");
      } else {
        announce("Age verified. The bar menu is now available.");
      }
      if (pendingBarJump) {
        pendingBarJump = false;
        var barSection = document.getElementById("bar");
        if (barSection) barSection.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  });

  var ageChange = document.querySelector("[data-age-change]");
  if (ageChange) {
    ageChange.addEventListener("click", function () {
      session.remove(AGE_KEY);
      pendingBarJump = false;
      applyAgeBand("");
    });
  }

  if (ageDialog && !currentAgeBand() && "IntersectionObserver" in window) {
    var barSectionForGate = document.getElementById("bar");
    var ageObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !currentAgeBand() && openDialogs.indexOf(ageDialog) === -1) {
          pendingBarJump = false;
          openDialog(ageDialog, document.querySelector("[data-open-age]") || null);
          ageObserver.disconnect();
        }
      });
    }, { threshold: 0.3 });
    if (barSectionForGate) ageObserver.observe(barSectionForGate);
  }

  /* ---------- Self-service cancellation ---------- */
  var cancelDialog = document.getElementById("cancelDialog");
  var cancelForm = document.getElementById("cancelForm");
  var cancelState = { reference: "", phone: "", record: null };

  function normalizeReference(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function phoneKey(value) {
    var digits = String(value || "").replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function showCancelStep(name) {
    if (!cancelDialog) return;
    [].slice.call(cancelDialog.querySelectorAll("[data-cancel-step]")).forEach(function (step) {
      step.hidden = step.getAttribute("data-cancel-step") !== name;
    });
  }

  function setCancelError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
    if (message) announce(message);
  }

  function clearCancelMessages() {
    if (!cancelDialog) return;
    [].slice.call(cancelDialog.querySelectorAll("[data-cancel-error], [data-cancel-confirm-error]")).forEach(function (el) {
      el.hidden = true;
      el.textContent = "";
    });
  }

  function resetCancel() {
    cancelState = { reference: "", phone: "", record: null };
    if (cancelForm) cancelForm.reset();
    if (cancelDialog) {
      [].slice.call(cancelDialog.querySelectorAll('input')).forEach(function (input) { fieldError(input, ""); });
      var receipt = cancelDialog.querySelector("[data-cancel-receipt]");
      if (receipt) receipt.innerHTML = "";
      var yesBtn = cancelDialog.querySelector("[data-cancel-yes]");
      if (yesBtn) {
        yesBtn.disabled = false;
        yesBtn.textContent = "Yes, cancel this booking";
      }
    }
    clearCancelMessages();
    showCancelStep("find");
  }

  function findLocalBooking(reference, phone) {
    var match = null;
    localReservations().forEach(function (item) {
      if (!item) return;
      if (normalizeReference(item.reference) === reference && phoneKey(item.phone) === phoneKey(phone)) match = item;
    });
    return match;
  }

  function guestLabel(count) {
    var party = Number(count) || 0;
    return party > 10 ? "More than 10 guests" : party + (party === 1 ? " guest" : " guests");
  }

  function detailRow(label, value) {
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
  }

  function showCancelConfirm(record, reference, phone) {
    if (!cancelDialog) return;
    cancelState = { reference: reference, phone: phone, record: record || null };
    var question = cancelDialog.querySelector("[data-cancel-question]");
    if (question) question.textContent = "Are you sure you want to cancel booking #" + reference + "?";

    var details = cancelDialog.querySelector("[data-cancel-details]");
    if (details) {
      if (record) {
        details.innerHTML =
          detailRow("Name", record.guest_name || "Guest") +
          detailRow("Date", prettyDate(record.reservation_date) || "—") +
          detailRow("Time", record.time_slot || "—") +
          detailRow("Guests", guestLabel(record.party_size)) +
          detailRow("Reference", reference);
      } else {
        details.innerHTML = detailRow("Reference", reference) +
          detailRow("Phone", "••••••" + String(phoneKey(phone)).slice(-4)) +
          "<div><dt>Note</dt><dd>We will check the host's booking book when you confirm.</dd></div>";
      }
    }

    clearCancelMessages();
    showCancelStep("confirm");
    var yesBtn = cancelDialog.querySelector("[data-cancel-yes]");
    if (yesBtn) yesBtn.focus({ preventScroll: true });
    announce("Are you sure you want to cancel booking " + reference + "?");
  }

  function beginCancelLookup() {
    if (!cancelForm) return;
    var referenceInput = document.getElementById("cancelReference");
    var phoneInput = document.getElementById("cancelPhone");
    var reference = normalizeReference(referenceInput && referenceInput.value);
    var phone = phoneInput ? phoneInput.value : "";
    var ok = true;

    if (!/^QSS-[A-Z0-9]{6}$/.test(reference)) {
      fieldError(referenceInput, "Enter your booking reference, like QSS-4K9P2M.");
      ok = false;
    } else fieldError(referenceInput, "");

    if (phoneKey(phone).length < 10) {
      fieldError(phoneInput, "Enter the same phone number you booked with.");
      ok = false;
    } else fieldError(phoneInput, "");

    if (!ok) {
      setCancelError(cancelForm.querySelector("[data-cancel-error]"), "Please check the highlighted booking details.");
      var firstBad = cancelForm.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    showCancelConfirm(findLocalBooking(reference, phone), reference, phone);
  }

  function startCancelWith(reference, phone) {
    if (!cancelDialog) return;
    var referenceInput = document.getElementById("cancelReference");
    var phoneInput = document.getElementById("cancelPhone");
    if (referenceInput) referenceInput.value = reference || "";
    if (phoneInput) phoneInput.value = phone || "";
    beginCancelLookup();
  }

  function markLocalCancelled(reference, phone) {
    var list = localReservations();
    var updated = null;
    list = list.map(function (item) {
      if (!item) return item;
      if (normalizeReference(item.reference) === reference && phoneKey(item.phone) === phoneKey(phone)) {
        updated = {};
        for (var key in item) if (Object.prototype.hasOwnProperty.call(item, key)) updated[key] = item[key];
        updated.status = "cancelled";
        updated.cancelled_at = new Date().toISOString();
        return updated;
      }
      return item;
    });
    if (updated) store.set(RESERVATIONS_KEY, JSON.stringify(list.slice(0, 200)));
    return updated;
  }

  function cancellationHtml(record, reference, options) {
    var seen = options || {};
    var rows =
      detailRow("Reference", reference) +
      detailRow("Status", "Cancelled") +
      (record && record.guest_name ? detailRow("Name", record.guest_name) : "") +
      (record && record.reservation_date ? detailRow("Date", prettyDate(record.reservation_date)) : "") +
      (record && record.time_slot ? detailRow("Time", record.time_slot) : "") +
      (record && record.party_size ? detailRow("Guests", guestLabel(record.party_size)) : "");

    var note = seen.alreadyCancelled
      ? "This booking was already cancelled — nothing further is needed."
      : seen.local
        ? "Cancelled on this device. The host's booking book could not be reached, so call +91 77000 04311 if you want it confirmed by phone."
        : "The host will see this cancellation. Keep the reference for your records.";

    return '<p class="confirm-title">Reservation Cancelled — Ref #<strong>' + escapeHtml(reference) + "</strong></p>" +
      '<dl class="confirm-details">' + rows + "</dl>" +
      '<p class="confirm-lines confirm-note">' + escapeHtml(note) + "</p>" +
      '<div class="confirm-actions">' +
        '<button class="btn btn-gold" type="button" data-close-dialog data-rebook>Book another evening</button>' +
        '<a class="btn btn-outline" href="tel:+917700004311">Call ' + PHONE + "</a>" +
      "</div>";
  }

  function renderCancellation(record, reference, options) {
    if (!cancelDialog) return;
    var receipt = cancelDialog.querySelector("[data-cancel-receipt]");
    if (receipt) {
      receipt.innerHTML = cancellationHtml(record, reference, options);
      showCancelStep("done");
      try { receipt.focus({ preventScroll: true }); } catch (e) { receipt.focus(); }
    }
    var message = "Booking " + reference + " has been cancelled.";
    if (options && options.local) message += " This was saved on this device.";
    announce(message);
  }

  async function performCancel() {
    if (!cancelDialog) return;
    var yesBtn = cancelDialog.querySelector("[data-cancel-yes]");
    var confirmError = cancelDialog.querySelector("[data-cancel-confirm-error]");
    var reference = cancelState.reference;
    var phone = cancelState.phone;
    var localRecord = cancelState.record;

    clearCancelMessages();
    if (yesBtn) {
      yesBtn.disabled = true;
      yesBtn.textContent = "Cancelling…";
    }

    try {
      var response = await fetch(API, {
        method: "PATCH",
        headers: apiHeaders(),
        body: JSON.stringify({ reference: reference, phone: phone, qss_check: "" })
      });
      var result = null;
      try { result = await response.json(); } catch (e) { result = null; }

      if (result && typeof result === "object") {
        if (response.ok && result.ok === true) {
          markLocalCancelled(reference, phone);
          renderCancellation(result.reservation || localRecord, reference, {
            alreadyCancelled: Boolean(result.alreadyCancelled)
          });
          return;
        }
        if (response.status === 404 && localRecord) {
          markLocalCancelled(reference, phone);
          renderCancellation(localRecord, reference, { local: true });
          return;
        }
        setCancelError(confirmError, toMessage(result.error,
          "We could not cancel that booking. Please call the host on " + PHONE + "."));
        return;
      }

      // Non-JSON: static hosting with no /api/reservations.
      if (localRecord) {
        markLocalCancelled(reference, phone);
        renderCancellation(localRecord, reference, { local: true });
      } else {
        setCancelError(confirmError,
          "This device has no copy of that booking and the booking service is offline. Please call the host on " + PHONE + ".");
      }
    } catch (error) {
      if (localRecord) {
        markLocalCancelled(reference, phone);
        renderCancellation(localRecord, reference, { local: true });
      } else {
        setCancelError(confirmError,
          "We could not reach the booking service. Please call the host on " + PHONE + " to cancel.");
      }
    } finally {
      if (yesBtn) {
        yesBtn.disabled = false;
        yesBtn.textContent = "Yes, cancel this booking";
      }
    }
  }

  if (cancelForm) {
    cancelForm.addEventListener("submit", function (event) {
      event.preventDefault();
      beginCancelLookup();
    });
  }
  if (cancelDialog) {
    cancelDialog.addEventListener("click", function (event) {
      if (event.target.closest("[data-cancel-no]")) {
        resetCancel();
        closeDialog(cancelDialog);
      }
      if (event.target.closest("[data-cancel-yes]")) performCancel();
    });
  }

  /* ---------- Privacy, export/delete, cookie consent, CCPA ---------- */
  var CONSENT_KEY = "qss_cookie_consent";
  var DNS_KEY = "qss_do_not_sell";
  var LEGAL_CONSENT_KEY = "qss_legal_consent";
  var cookieBanner = document.getElementById("cookieBanner");
  var consentLabel = document.querySelector("[data-consent-label]");
  var dataStatus = document.querySelector("[data-data-status]");
  var deleteBtn = document.querySelector("[data-delete-data]");
  var legalConsentDialog = document.getElementById("legalConsentDialog");
  var deleteArmed = false;
  var deleteTimer = null;

  function storedJson(key, fallback) {
    try {
      var value = JSON.parse(store.get(key) || "null");
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function activateConsentScripts() {
    [].slice.call(document.querySelectorAll('script[type="text/plain"][data-consent]')).forEach(function (script) {
      if (script.getAttribute("data-activated") === "true") return;
      var clone = document.createElement("script");
      [].slice.call(script.attributes).forEach(function (attr) {
        clone.setAttribute(attr.name, attr.value);
      });
      clone.type = "text/javascript";
      clone.removeAttribute("data-consent");
      clone.setAttribute("data-activated", "true");
      clone.text = script.textContent;
      script.parentNode.appendChild(clone);
    });
  }

  function applyConsent(choice, options) {
    var seen = options || {};
    store.set(CONSENT_KEY, choice);
    root.setAttribute("data-cookie-consent", choice);
    if (cookieBanner) cookieBanner.hidden = true;
    if (consentLabel) {
      consentLabel.textContent = choice === "all"
        ? "All cookies and scripts accepted"
        : "Essential only — non-essential scripts blocked";
    }
    if (choice === "all") activateConsentScripts();
    if (!seen.silent) {
      announce(choice === "all"
        ? "All cookie choices accepted. Non-essential scripts may now run."
        : "Non-essential cookies rejected. Essential storage only.");
    }
  }

  [].slice.call(document.querySelectorAll("[data-consent-choice]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyConsent(btn.getAttribute("data-consent-choice"));
    });
  });

  var savedConsent = store.get(CONSENT_KEY);
  if (savedConsent === "all" || savedConsent === "essential") {
    applyConsent(savedConsent, { silent: true });
  } else if (cookieBanner) {
    cookieBanner.hidden = false;
  }

  var dnsToggle = document.querySelector("[data-dns]");
  function applyDns(on, silent) {
    store.set(DNS_KEY, on ? "1" : "0");
    if (dnsToggle) dnsToggle.setAttribute("aria-checked", on ? "true" : "false");
    var note = document.querySelector("[data-dns-note]");
    if (note) {
      note.textContent = on
        ? "Opt-out recorded. Non-essential scripts stay blocked and your personal information is not sold or shared."
        : "We do not sell personal information. You can still record an opt-out preference here.";
    }
    if (on) applyConsent("essential", { silent: true });
    if (!silent) announce(on
      ? "Do Not Sell or Share turned on. Non-essential scripts are blocked."
      : "Do Not Sell or Share turned off.");
  }

  if (dnsToggle) {
    applyDns(store.get(DNS_KEY) === "1", true);
    dnsToggle.addEventListener("click", function () {
      applyDns(dnsToggle.getAttribute("aria-checked") !== "true");
    });
  }

  /* ---------- Privacy Policy & Terms consent popup ---------- */
  function showLegalConsentIfNeeded() {
    if (!legalConsentDialog) return;
    if (store.get(LEGAL_CONSENT_KEY) === "accepted") return;
    openDialog(legalConsentDialog, document.activeElement);
  }

  if (legalConsentDialog) {
    legalConsentDialog.addEventListener("cancel", function (event) {
      if (store.get(LEGAL_CONSENT_KEY) !== "accepted") event.preventDefault();
    });
    var acceptLegalBtn = legalConsentDialog.querySelector("[data-accept-legal]");
    if (acceptLegalBtn) {
      acceptLegalBtn.addEventListener("click", function () {
        store.set(LEGAL_CONSENT_KEY, "accepted");
        root.setAttribute("data-legal-consent", "accepted");
        closeDialog(legalConsentDialog);
        announce("Privacy Policy and Terms and Conditions accepted.");
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showLegalConsentIfNeeded);
    } else {
      window.setTimeout(showLegalConsentIfNeeded, 0);
    }
  }

  function setDataStatus(message) {
    if (dataStatus) dataStatus.textContent = message;
    announce(message);
  }

  function exportMyData() {
    var payload = {
      exported_at: new Date().toISOString(),
      restaurant: {
        name: "Que Sera Sera Restaurant & Bar",
        address: "Shop No. 2–5, Clifton Trishool Housing Society, Vastu Lane, Shastri Nagar, Andheri Lokhandwala, Andheri West, Mumbai 400053",
        phone: "+91 77000 04311",
        grievance_email: "privacy@queserasera.in"
      },
      reservations: localReservations(),
      marketing_attribution: storedJson("qss-utm", {}),
      preferences: {
        theme: store.get("qss-theme") || "dark",
        contrast: store.get("qss-contrast") || "normal",
        text_scale: store.get("qss-scale") || "1",
        cookie_consent: store.get(CONSENT_KEY) || "not chosen",
        do_not_sell: store.get(DNS_KEY) === "1"
      }
    };

    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "que-sera-sera-my-data.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      setDataStatus("Exported " + payload.reservations.length + " booking(s) and your preferences as JSON.");
    } catch (e) {
      setDataStatus("Export is unavailable in this browser. Please email privacy@queserasera.in and we will send your data.");
    }
  }

  function resetDeleteBtn() {
    deleteArmed = false;
    window.clearTimeout(deleteTimer);
    if (deleteBtn) {
      deleteBtn.textContent = "Delete my data on this device";
      deleteBtn.classList.remove("is-armed");
    }
  }

  function deleteMyData() {
    if (!deleteArmed) {
      deleteArmed = true;
      if (deleteBtn) {
        deleteBtn.textContent = "Click again to delete permanently";
        deleteBtn.classList.add("is-armed");
      }
      setDataStatus("This will delete your bookings and campaign tags from this device. Click again to confirm.");
      deleteTimer = window.setTimeout(resetDeleteBtn, 8000);
      return;
    }
    store.remove(RESERVATIONS_KEY);
    store.remove("qss-utm");
    resetDeleteBtn();
    setDataStatus("Your booking data and campaign tags have been deleted from this device. Accessibility and consent choices were kept.");
  }

  var exportBtn = document.querySelector("[data-export-data]");
  if (exportBtn) exportBtn.addEventListener("click", exportMyData);
  if (deleteBtn) deleteBtn.addEventListener("click", deleteMyData);
  if (cancelDialog) cancelDialog.addEventListener("close", resetCancel);

  /* ---------- Reserve form ---------- */
  var form = document.getElementById("reserveForm");
  var confirmBox = form ? form.querySelector("[data-confirm]") : null;
  var formErrorEl = form ? form.querySelector("[data-form-error]") : null;
  var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  var dateField = document.getElementById("rDate");
  var submitLabel = submitBtn ? submitBtn.textContent : "Request this table";
  var API = "/api/reservations";
  var RESERVATIONS_KEY = "qss_reservations";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"];
  var SERVER_FIELD_IDS = {
    guest_name: "rName",
    phone: "rPhone",
    reservation_date: "rDate",
    time_slot: "rTime",
    party_size: "rGuests",
    consent: "rConsent"
  };

  if (dateField) {
    var now = new Date();
    var pad = function (n) { return String(n).padStart(2, "0"); };
    dateField.min = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  /* Campaign attribution: current query params win, otherwise the last values
     seen this session are reused, so a booking made after browsing still
     credits the ad that brought the guest in. */
  var utm = (function () {
    var saved = {};
    try { saved = JSON.parse(store.get("qss-utm") || "{}") || {}; } catch (e) { saved = {}; }
    var params = new URLSearchParams(window.location.search);
    UTM_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) saved[key] = value.trim().slice(0, 120);
    });
    try { store.set("qss-utm", JSON.stringify(saved)); } catch (e) { /* private mode */ }
    return saved;
  })();

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [].slice.call(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" + hex.slice(20);
  }

  /* Any value that might reach the banner: never render "[object Object]". */
  function toMessage(value, fallback) {
    if (typeof value === "string") {
      var text = value.trim();
      if (text && text !== "[object Object]") return text;
    }
    if (value && typeof value === "object") {
      var nested = value.message || value.error || value.detail || value.reason;
      if (nested && nested !== value) {
        var resolved = toMessage(nested, "");
        if (resolved) return resolved;
      }
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  }

  function localReference() {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    var code = "";
    for (var j = 0; j < bytes.length; j++) code += alphabet.charAt(bytes[j] % alphabet.length);
    return "QSS-" + code;
  }

  /* Guest bookings confirmed without the API are kept here so the DPDP data
     export/delete portal can read and remove them locally. */
  function localReservations() {
    var list = [];
    try { list = JSON.parse(store.get(RESERVATIONS_KEY) || "[]"); } catch (e) { list = []; }
    return Array.isArray(list) ? list : [];
  }

  function saveLocalReservation(entry) {
    var list = localReservations();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (item && item.idempotency_key && item.idempotency_key === entry.idempotency_key) {
        return { entry: item, duplicate: true };
      }
    }
    list.unshift(entry);
    store.set(RESERVATIONS_KEY, JSON.stringify(list.slice(0, 200)));
    return { entry: entry, duplicate: false };
  }

  function fieldError(input, message) {
    if (!input) return;
    var scope = input.form || (input.closest && input.closest("form")) || form;
    var field = input.closest(".field");
    var error = (scope || document).querySelector('[data-error-for="' + input.id + '"]');
    if (field) field.classList.toggle("has-error", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (error) {
      error.hidden = !message;
      if (message) error.textContent = message;
    }
  }

  function readForm() {
    var el = function (name) {
      return (form && form.elements.namedItem(name)) || null;
    };
    var value = function (name) {
      var input = el(name);
      return input && typeof input.value === "string" ? input.value : "";
    };
    var consentInput = el("consent");
    return {
      name: value("name").trim(),
      phone: value("phone").trim(),
      date: value("date"),
      time: value("time"),
      guests: value("guests"),
      seating: value("seating"),
      notes: value("notes").trim(),
      check: value("qss_check").trim(),
      consent: Boolean(consentInput && consentInput.checked)
    };
  }

  function prettyDate(value) {
    if (!value) return "";
    var parts = value.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" });
  }

  var pending = { signature: "", key: "" };
  var submitting = false;

  function setLoading(on) {
    submitting = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
    submitBtn.textContent = on ? "Holding your table…" : submitLabel;
  }

  function showFormError(message) {
    if (formErrorEl) {
      formErrorEl.textContent = message || "";
      formErrorEl.hidden = !message;
    }
    if (message) announce(message);
  }

  function statusLabel(status) {
    return ({
      pending: "Pending host confirmation",
      confirmed: "Confirmed",
      seated: "Seated",
      cancelled: "Cancelled",
      no_show: "No show"
    })[status] || "Pending host confirmation";
  }

  function receiptHtml(booking, data, options) {
    var seen = options || {};
    var reference = String(booking.reference || booking.confirmation_code || localReference());
    var name = String(booking.guest_name || (data && data.name) || "Guest");
    var dateValue = booking.reservation_date || (data && data.date) || "";
    var timeValue = booking.time_slot || (data && data.time) || "";
    var party = Number(booking.party_size || (data && data.guests) || 0);
    var seating = booking.seating || (data && data.seating) || "No preference";
    var guests = party > 10
      ? "More than 10 guests"
      : party + (party === 1 ? " guest" : " guests");
    var when = prettyDate(dateValue) + (timeValue ? " at " + timeValue : "");
    var summary = "Table request for Que Sera Sera\n" +
      "Reference: " + reference + "\n" +
      "Name: " + name + "\n" +
      "Date: " + when + "\n" +
      "Guests: " + guests + "\n" +
      "Seating: " + seating;
    var waLink = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(summary);
    var row = function (label, value) {
      return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
    };

    return '<p class="confirm-title">' +
        (seen.duplicate ? "Already on the list" : "Table Request Confirmed") +
        " — Ref #<strong>" + escapeHtml(reference) + "</strong></p>" +
      '<dl class="confirm-details">' +
        row("Name", name) +
        row("Date", prettyDate(dateValue)) +
        row("Time", timeValue) +
        row("Guests", guests) +
        row("Seating", seating) +
        row("Reference", reference) +
      "</dl>" +
      '<p class="confirm-lines">Status: ' + escapeHtml(statusLabel(booking.status)) +
        ". The host will call you to confirm.</p>" +
      (seen.duplicate
        ? '<p class="confirm-lines confirm-note">We already had this request on file, so it has not been booked twice.</p>'
        : "") +
      (seen.local
        ? '<p class="confirm-lines confirm-note">Saved on this device — the host has not seen it yet. ' +
          "Send it on WhatsApp or call to lock it in.</p>"
        : seen.stored === false
          ? '<p class="confirm-lines confirm-note">Local preview — this request was validated but not stored in the booking book.</p>'
          : "") +
      '<div class="confirm-actions">' +
        '<a class="btn btn-gold" href="' + waLink + '" target="_blank" rel="noopener">Send details on WhatsApp</a>' +
        '<a class="btn btn-outline" href="tel:+917700004311">Call ' + PHONE + "</a>" +
        '<button class="btn btn-outline" type="button" data-open-dialog="cancelDialog" data-cancel-ref="' +
          escapeHtml(reference) + '" data-cancel-phone="' +
          escapeHtml(String(booking.phone || (data && data.phone) || "")) +
        '">Cancel this booking</button>' +
      "</div>";
  }

  function renderReceipt(booking, data, options) {
    if (!confirmBox) return;
    var seen = options || {};
    confirmBox.innerHTML = receiptHtml(booking, data, seen);
    confirmBox.hidden = false;
    try { confirmBox.focus({ preventScroll: false }); } catch (e) { confirmBox.focus(); }
    if (confirmBox.scrollIntoView) {
      confirmBox.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    }
    var reference = String(booking.reference || booking.confirmation_code || "");
    announce(seen.duplicate
      ? "Booking reference " + reference + " is already on file. It has not been booked twice."
      : "Table request confirmed. Reference " + reference + ".");
  }

  /* Static hosting (npx serve, a plain preview) has no /api/reservations:
     confirm on the device instead of dead-ending the guest, and keep the
     booking where the DPDP export/delete tooling can find it. */
  function confirmLocally(data, payload) {
    var saved = saveLocalReservation({
      idempotency_key: payload.idempotency_key,
      reference: localReference(),
      guest_name: payload.guest_name,
      phone: String(payload.phone || "").replace(/\D/g, ""),
      reservation_date: payload.reservation_date,
      time_slot: payload.time_slot,
      party_size: payload.party_size,
      seating: data.seating || "No preference",
      notes: data.notes || "",
      special_requests: payload.special_requests,
      utm_source: payload.utm_source,
      utm_medium: payload.utm_medium,
      utm_campaign: payload.utm_campaign,
      status: "pending",
      source: "local",
      consent_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });
    renderReceipt(saved.entry, data, { local: true, duplicate: saved.duplicate });
    toast(saved.duplicate ? "Already saved on this device" : "Table request confirmed on this device");
    return saved.entry;
  }

  if (form) {
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (submitting) return;

      var data = readForm();
      var nameInput = form.elements.namedItem("name");
      var phoneInput = form.elements.namedItem("phone");
      var dateInput = form.elements.namedItem("date");
      var timeInput = form.elements.namedItem("time");
      var guestsInput = form.elements.namedItem("guests");
      var consentInput = form.elements.namedItem("consent");
      var ok = true;

      showFormError("");

      if (data.name.length < 2) { fieldError(nameInput, "Please tell us who the table is for."); ok = false; }
      else fieldError(nameInput, "");

      if (data.phone.replace(/\D/g, "").length < 10) { fieldError(phoneInput, "We need a number to confirm the table."); ok = false; }
      else fieldError(phoneInput, "");

      if (!data.date) { fieldError(dateInput, "Choose the date you would like to come."); ok = false; }
      else if (dateField && dateField.min && data.date < dateField.min) {
        fieldError(dateInput, "That date has already passed — pick a future evening.");
        ok = false;
      } else fieldError(dateInput, "");

      if (!data.time) { fieldError(timeInput, "Pick a time for your booking."); ok = false; }
      else fieldError(timeInput, "");

      if (!data.guests) { fieldError(guestsInput, "How many seats should we hold?"); ok = false; }
      else fieldError(guestsInput, "");

      if (!data.consent) {
        fieldError(consentInput, "Please agree to the privacy notice so we can store your booking.");
        ok = false;
      } else fieldError(consentInput, "");

      if (!ok) {
        showFormError("Please check the highlighted fields and try again.");
        var firstBad = form.querySelector('[aria-invalid="true"]');
        if (firstBad) firstBad.focus();
        return;
      }

      var party = Number.parseInt(data.guests, 10) || 11;
      var notes = [];
      if (data.seating && data.seating !== "No preference") notes.push("Seating: " + data.seating);
      if (data.notes) notes.push(data.notes);

      var payload = {
        guest_name: data.name,
        phone: data.phone,
        reservation_date: data.date,
        time_slot: data.time,
        party_size: party,
        special_requests: notes.join(" — ").slice(0, 500),
        utm_source: utm.utm_source || "",
        utm_medium: utm.utm_medium || "",
        utm_campaign: utm.utm_campaign || "",
        qss_check: data.check,
        consent: data.consent
      };

      // One key per distinct submission. Retrying the same booking after a
      // network failure reuses it, so the guest cannot book the table twice.
      var signature = JSON.stringify(payload);
      if (pending.signature !== signature || !pending.key) {
        pending = { signature: signature, key: uuid() };
      }
      payload.idempotency_key = pending.key;

      setLoading(true);
      if (confirmBox) confirmBox.hidden = true;
      showFormError("");
      var settled = false;

      try {
        var response = await fetch(API, {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify(payload)
        });
        var result = null;
        try { result = await response.json(); } catch (e) { result = null; }

        // A non-JSON answer is what a static server sends for /api/…, so the
        // endpoint is simply not deployed here: confirm on the device.
        if (!result || typeof result !== "object") {
          confirmLocally(data, payload);
          return;
        }

        if (response.ok && result.ok === true) {
          settled = true;
          pending = { signature: "", key: "" };
          renderReceipt(result.reservation || result, data, {
            stored: result.stored !== false,
            duplicate: Boolean(result.duplicate)
          });
          toast(result.stored === false
            ? "Table request confirmed — local preview"
            : "Table request confirmed");
          return;
        }

        var serverFields = result.fields && typeof result.fields === "object" ? result.fields : {};
        Object.keys(serverFields).forEach(function (key) {
          fieldError(document.getElementById(SERVER_FIELD_IDS[key]), toMessage(serverFields[key], ""));
        });

        if (response.status === 404 || response.status === 405) {
          confirmLocally(data, payload);
          return;
        }

        showFormError(toMessage(result.error,
          "We could not save that request. Please call the host on " + PHONE + "."));
        var invalid = form.querySelector('[aria-invalid="true"]');
        if (invalid) invalid.focus();
        else if (formErrorEl) formErrorEl.focus();
      } catch (error) {
        if (settled) {
          showFormError("Your table request was saved, but the receipt could not be shown. Please call the host on " + PHONE + ".");
          return;
        }
        confirmLocally(data, payload);
      } finally {
        setLoading(false);
      }
    });

    [].slice.call(form.querySelectorAll("input, select, textarea")).forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.getAttribute("aria-invalid") === "true") fieldError(input, "");
      });
      input.addEventListener("change", function () {
        if (input.getAttribute("aria-invalid") === "true") fieldError(input, "");
      });
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  /* ---------- Search drawer ---------- */
  var drawer = document.getElementById("searchDrawer");
  var searchInput = document.getElementById("searchInput");
  var searchResults = document.getElementById("searchResults");
  var openSearchBtn = document.querySelector("[data-open-search]");
  var lastFocused = null;
  var index = null;

  function buildIndex() {
    var entries = [];
    [].slice.call(document.querySelectorAll('[data-menu="kitchen"] .dish')).forEach(function (el) {
      var name = el.querySelector(".dish-name");
      var desc = el.querySelector(".dish-desc");
      var tag = el.querySelector(".dish-tag");
      entries.push({
        group: "Kitchen",
        title: name ? name.textContent : "Dish",
        meta: desc ? desc.textContent : "",
        keywords: (el.getAttribute("data-search") || "") + " " + (tag ? tag.textContent : ""),
        el: el
      });
    });
    [].slice.call(document.querySelectorAll('[data-menu="bar"] .cocktail')).forEach(function (el) {
      var name = el.querySelector(".dish-name");
      var desc = el.querySelector(".dish-desc");
      var tag = el.querySelector(".dish-tag");
      entries.push({
        group: "Bar",
        title: name ? name.textContent : "Drink",
        meta: desc ? desc.textContent : "",
        keywords: (el.getAttribute("data-search") || "") + " " + (tag ? tag.textContent : ""),
        el: el
      });
    });
    [].slice.call(document.querySelectorAll(".faq-item")).forEach(function (el) {
      var q = el.querySelector(".faq-question span");
      var a = el.querySelector(".faq-answer p");
      entries.push({
        group: "Questions",
        title: q ? q.textContent : "Question",
        meta: a ? a.textContent : "",
        keywords: el.getAttribute("data-search") || "",
        el: el
      });
    });
    [
      ["The Room", "Arches, candlelight and the noon-to-moon playlist.", "#room", "room interior ambience about"],
      ["Book Your Evening", "Request a table in the dining room, bar or lounge.", "#reservations", "book table reservation booking"],
      ["Find Us", "Vastu Lane, Andheri Lokhandwala — address, phone and hours.", "#visit", "address location map directions hours phone"],
      ["Opening Hours", "Open daily, 9am to 1am.", "#visit", "hours timing open close"]
    ].forEach(function (row) {
      entries.push({ group: "Pages", title: row[0], meta: row[1], keywords: row[3], href: row[2] });
    });
    return entries;
  }

  function renderResults(query) {
    if (!searchResults) return;
    if (!index) index = buildIndex();
    var q = query.trim().toLowerCase();
    searchResults.innerHTML = "";

    if (!q) {
      renderDefault();
      return;
    }

    var terms = q.split(/\s+/).filter(Boolean);
    var matches = index.filter(function (entry) {
      var haystack = (entry.title + " " + entry.meta + " " + entry.keywords).toLowerCase();
      return terms.every(function (term) { return haystack.indexOf(term) !== -1; });
    }).slice(0, 14);

    if (!matches.length) {
      var empty = document.createElement("p");
      empty.className = "search-empty";
      empty.textContent = "Nothing under “" + query.trim() + "”. Try “pasta”, “cocktail”, “parking” or call the host on " + PHONE + ".";
      searchResults.appendChild(empty);
      return;
    }

    var groups = {};
    matches.forEach(function (entry) {
      (groups[entry.group] = groups[entry.group] || []).push(entry);
    });

    Object.keys(groups).forEach(function (group) {
      var wrap = document.createElement("div");
      wrap.className = "search-group";
      var title = document.createElement("p");
      title.className = "search-group-title";
      title.textContent = group;
      wrap.appendChild(title);

      groups[group].forEach(function (entry) {
        wrap.appendChild(resultButton(entry.title, entry.meta, function () { goToResult(entry); }));
      });
      searchResults.appendChild(wrap);
    });
  }

  /* Results are built as nodes and filled with textContent, so a dish name,
     FAQ answer or a crafted query can never become markup. */
  function resultButton(title, meta, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-result";
    var strong = document.createElement("strong");
    strong.textContent = title;
    var span = document.createElement("span");
    span.textContent = meta;
    btn.appendChild(strong);
    btn.appendChild(span);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderDefault() {
    searchResults.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "search-group";
    var heading = document.createElement("p");
    heading.className = "search-group-title";
    heading.textContent = "Start here";
    wrap.appendChild(heading);

    [["Que Sera Sera", "The house cocktail — gin, kaffir lime, orange and vanilla.", index.find(function (e) { return e.title === "Que Sera Sera"; })],
     ["Handmade Basil Tortellini", "Lemon basil ricotta, brown butter, parmesan.", index.find(function (e) { return e.title === "Handmade Basil Tortellini"; })],
     ["Book Your Evening", "Request a table for tonight.", index.find(function (e) { return e.title === "Book Your Evening"; })],
     ["Is there parking?", "Valet parking at the door on Vastu Lane.", index.find(function (e) { return e.title === "Is there parking?"; })]
    ].forEach(function (row) {
      if (!row[2]) return;
      wrap.appendChild(resultButton(row[0], row[1], function () { goToResult(row[2]); }));
    });
    searchResults.appendChild(wrap);
  }

  function goToResult(entry) {
    closeSearch(false);
    if (entry.href) {
      var target = document.querySelector(entry.href);
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }
    if (entry.el.classList.contains("dish")) setFilter(kitchenBtns, "data-filter", "all");
    if (entry.el.classList.contains("cocktail")) setFilter(barBtns, "data-filter-bar", "all");

    if (entry.el.classList.contains("faq-item")) {
      var qBtn = entry.el.querySelector(".faq-question");
      var panel = qBtn ? document.getElementById(qBtn.getAttribute("aria-controls")) : null;
      if (qBtn && qBtn.getAttribute("aria-expanded") !== "true") {
        qBtn.setAttribute("aria-expanded", "true");
        if (panel) panel.hidden = false;
      }
    }

    window.setTimeout(function () {
      entry.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      entry.el.classList.add("is-flash");
      window.setTimeout(function () { entry.el.classList.remove("is-flash"); }, 1800);
    }, 60);
  }

  function setFilter(buttons, attr, key) {
    buttons.forEach(function (btn) {
      if (btn.getAttribute(attr) === key) btn.click();
    });
  }

  function openSearch() {
    if (!drawer) return;
    lastFocused = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add("no-scroll");
    if (!index) index = buildIndex();
    renderResults(searchInput.value || "");
    window.setTimeout(function () { searchInput.focus(); }, 40);
  }

  function closeSearch(restoreFocus) {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.classList.remove("no-scroll");
    if (restoreFocus !== false && lastFocused && lastFocused.focus) lastFocused.focus();
    if (searchInput) searchInput.value = "";
  }

  if (openSearchBtn) openSearchBtn.addEventListener("click", openSearch);
  [].slice.call(document.querySelectorAll("[data-close-search]")).forEach(function (btn) {
    btn.addEventListener("click", function () { closeSearch(true); });
  });
  if (searchInput) {
    searchInput.addEventListener("input", function () { renderResults(searchInput.value); });
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var first = searchResults.querySelector(".search-result");
        if (first) first.click();
      }
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && drawer && !drawer.hidden) {
      event.preventDefault();
      closeSearch(true);
    }
  });
  if (drawer) {
    drawer.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") return;
      var focusable = [].slice.call(drawer.querySelectorAll("button, a[href], input")).filter(function (el) {
        return el.offsetParent !== null;
      });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  /* ---------- Broken photography ---------- */
  /* Inline onerror handlers are blocked by the site's CSP, so the engraved "Q"
     fallback is attached here instead. */
  function markBroken(img) {
    var media = img.closest(".media");
    if (media) media.classList.add("is-broken");
    if (img.parentNode) img.parentNode.removeChild(img);
  }
  [].slice.call(document.querySelectorAll(".media img")).forEach(function (img) {
    img.addEventListener("error", function () { markBroken(img); });
    if (img.complete && img.naturalWidth === 0) markBroken(img);
  });

  /* ---------- Reveal on scroll (content stays visible without JS) ---------- */
  var revealItems = [].slice.call(document.querySelectorAll(".reveal"));
  if (!reduceMotion && "IntersectionObserver" in window && revealItems.length) {
    root.classList.add("motion-ready");
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealItems.forEach(function (item) { observer.observe(item); });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

})();
