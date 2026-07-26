(function () {
  "use strict";

  var state = {
    theme: localStorage.getItem("rc-theme") || "light",
    lang: localStorage.getItem("rc-lang") || "en"
  };

  /* ---------------- Preloader ---------------- */
  // A short branded flash, not an asset-loading gate — don't wait on window "load"
  // (slow/offline font fetches would otherwise leave it stuck on screen).
  (function () {
    var pre = document.getElementById("preloader");
    if (!pre) return;
    setTimeout(function () {
      pre.setAttribute("hidden", "");
      setTimeout(function () { pre.style.display = "none"; }, 700);
    }, 900);
  })();

  /* ---------------- Header scroll state ---------------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    if (!header) return;
    if (window.scrollY > 24) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------- Mobile menu ---------------- */
  var burger = document.getElementById("burger");
  var mobileMenu = document.getElementById("mobileMenu");
  if (burger && mobileMenu) {
    burger.addEventListener("click", function () {
      var isOpen = mobileMenu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    mobileMenu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileMenu.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- Dark mode ---------------- */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rc-theme", theme);
  }
  var themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    applyTheme(state.theme);
    themeToggle.addEventListener("click", function () {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  /* ---------------- Language / RTL ---------------- */
  function applyLang(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("rc-lang", lang);

    var dict = window.I18N && window.I18N[lang];
    if (dict) {
      document.querySelectorAll("[data-i18n]").forEach(function (el) {
        var key = el.getAttribute("data-i18n");
        if (dict[key] != null) el.innerHTML = dict[key];
      });
    }

    var langToggle = document.getElementById("langToggle");
    if (langToggle) langToggle.textContent = lang === "ar" ? "EN" : "عربي";

    // Refresh the currently active globe card copy in the new language.
    if (window.WeddingGlobe) {
      var activePin = document.querySelector(".journey__pin-btn.is-active");
      var id = activePin ? activePin.getAttribute("data-pin") : (window.WeddingGlobe.pins[0] && window.WeddingGlobe.pins[0].id);
      var pin = window.WeddingGlobe.pins.filter(function (p) { return p.id === id; })[0];
      if (pin) updateJourneyCard(pin);
    }
  }
  var langToggleBtn = document.getElementById("langToggle");
  if (langToggleBtn) {
    langToggleBtn.addEventListener("click", function () {
      applyLang(state.lang === "ar" ? "en" : "ar");
    });
  }
  applyLang(state.lang);

  /* ---------------- Countdown ---------------- */
  var WEDDING_DATE = new Date("2027-07-17T16:30:00+02:00").getTime();
  function pad(n) { return String(Math.max(0, n)).padStart(2, "0"); }
  function tickCountdown() {
    var now = Date.now();
    var diff = WEDDING_DATE - now;
    if (diff < 0) diff = 0;
    var totalSeconds = Math.floor(diff / 1000);
    var months = Math.floor(totalSeconds / (30 * 24 * 3600));
    var rem = totalSeconds - months * 30 * 24 * 3600;
    var days = Math.floor(rem / (24 * 3600));
    rem -= days * 24 * 3600;
    var hours = Math.floor(rem / 3600);
    rem -= hours * 3600;
    var mins = Math.floor(rem / 60);
    var secs = rem - mins * 60;

    setText("cd-months", pad(months));
    setText("cd-days", pad(days));
    setText("cd-hours", pad(hours));
    setText("cd-mins", pad(mins));
    setText("cd-secs", pad(secs));
  }
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* ---------------- Journey / globe card wiring ---------------- */
  var pinButtons = document.querySelectorAll(".journey__pin-btn");
  function setActiveButton(id) {
    pinButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-pin") === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }
  function updateJourneyCard(pin) {
    var data = pin[state.lang] || pin.en;
    setText("cardEyebrow", data.eyebrow);
    setText("cardTitle", data.title);
    setText("cardCopy", data.copy);
    setActiveButton(pin.id);
  }
  pinButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-pin");
      if (window.WeddingGlobe) window.WeddingGlobe.focusPin(id);
    });
  });
  document.addEventListener("globe:pinchange", function (e) {
    updateJourneyCard(e.detail);
  });

  /* ---------------- RSVP form ---------------- */
  var rsvpForm = document.getElementById("rsvpForm");
  if (rsvpForm) {
    var guestsRow = document.getElementById("rsvpGuestsRow");
    var dietaryRow = document.getElementById("rsvpDietaryRow");
    var statusEl = document.getElementById("rsvpStatus");
    var submitBtn = document.getElementById("rsvpSubmit");

    function toggleConditionalRows() {
      var declined = rsvpForm.querySelector('input[name="attending"][value="Regretfully declines"]');
      var isDeclining = declined && declined.checked;
      [guestsRow, dietaryRow].forEach(function (row) {
        if (!row) return;
        row.hidden = isDeclining;
        row.querySelectorAll("input, textarea").forEach(function (field) {
          field.disabled = isDeclining;
        });
      });
    }
    rsvpForm.querySelectorAll('input[name="attending"]').forEach(function (radio) {
      radio.addEventListener("change", toggleConditionalRows);
    });
    toggleConditionalRows();

    rsvpForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var lang = document.documentElement.lang || "en";
      var dict = (window.I18N && window.I18N[lang]) || {};
      submitBtn.disabled = true;
      statusEl.setAttribute("data-state", "pending");
      statusEl.textContent = dict["rsvp.form.submitting"] || "Sending…";

      fetch(rsvpForm.action, {
        method: "POST",
        body: new FormData(rsvpForm),
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          if (response.ok) {
            statusEl.setAttribute("data-state", "success");
            statusEl.textContent = dict["rsvp.form.success"] || "Thank you! Your RSVP has been received.";
            rsvpForm.reset();
            toggleConditionalRows();
          } else {
            throw new Error("Form submission failed");
          }
        })
        .catch(function () {
          statusEl.setAttribute("data-state", "error");
          statusEl.textContent = dict["rsvp.form.error"] || "Something went wrong. Please try again or email us directly.";
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }

})();
