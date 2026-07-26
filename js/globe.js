/* Stylized wireframe globe — plain 2D canvas, no external 3D library.
   Renders a graticule sphere with 4 pins (Athlone, Jerusalem, Dublin, Cantabria)
   projected via a simple rotation + orthographic projection each frame. */
(function () {
  "use strict";

  var PINS = [
    {
      id: "athlone", lat: 53.42, lon: -7.94, kind: "home",
      en: { eyebrow: "Where Cian Is From", title: "Athlone, Ireland", copy: "A small town on the River Shannon, right in the heart of Ireland — the beginning of this story." },
      ar: { eyebrow: "من أين سيان", title: "أثلون، أيرلندا", copy: "بلدة صغيرة على ضفاف نهر شانون، في قلب أيرلندا — حيث بدأت هذه القصة." }
    },
    {
      id: "jerusalem", lat: 31.78, lon: 35.22, kind: "home",
      en: { eyebrow: "Where Rand Is From", title: "Jerusalem, Palestine", copy: "A city of ancient stone and layered history, where Rand's story began." },
      ar: { eyebrow: "من أين رند", title: "القدس، فلسطين", copy: "مدينة من الحجر العتيق والتاريخ العميق، حيث بدأت قصة رند." }
    },
    {
      id: "dublin", lat: 53.35, lon: -6.26, kind: "home",
      en: { eyebrow: "Where We Live Now", title: "Dublin, Ireland", copy: "The city that brought two very different roads together — and where we call home today." },
      ar: { eyebrow: "حيث نعيش الآن", title: "دبلن، أيرلندا", copy: "المدينة التي جمعت طريقين مختلفين تمامًا — وموطننا اليوم." }
    },
    {
      id: "cantabria", lat: 43.39, lon: -4.09, kind: "destination",
      en: { eyebrow: "Where We Say ‘I Do’", title: "Cantabria, Spain", copy: "A quiet corner of northern Spain, chosen for its green hills and warm light — home to Palacio de Caranceja, where our journey continues." },
      ar: { eyebrow: "حيث نقول “نعم”", title: "كانتابريا، إسبانيا", copy: "ركن هادئ في شمال إسبانيا، اخترناه لتلاله الخضراء وضوئه الدافئ — موطن قصر كارانسيخا، حيث تستمر رحلتنا." }
    }
  ];

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function toRad(d) { return (d * Math.PI) / 180; }

  // Solve for the exact yaw/pitch that puts (lat, lon) dead-center in view (x2=0, y2=0):
  // yaw so the point's longitude faces the camera, then pitch by its latitude. Shared by
  // the initial view (centered on Cantabria) and focusPin (centering whichever pin is clicked).
  function centerRotationFor(lat, lon) {
    var phi = toRad(lat), lambda = toRad(lon);
    var x0 = Math.cos(phi) * Math.sin(lambda);
    var z0 = Math.cos(phi) * Math.cos(lambda);
    return { y: Math.atan2(-x0, z0), x: phi };
  }

  var ZOOM_LEVEL = 2.6;

  function Globe(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    // Start centered on the destination pin (Cantabria) rather than an arbitrary
    // hardcoded angle, using the same exact-centering math as clicking a pin.
    var initialPin = null;
    for (var pi = 0; pi < PINS.length; pi++) if (PINS[pi].id === "cantabria") initialPin = PINS[pi];
    var initialRot = centerRotationFor(initialPin.lat, initialPin.lon);
    this.rotY = initialRot.y;
    this.rotX = initialRot.x;
    this.targetRotY = this.rotY;
    this.targetRotX = this.rotX;
    this.zoom = 1;
    this.autoRotate = !reduceMotion;
    this.dragging = false;
    this.activeId = "cantabria";
    this.lastPointer = null;
    this.idleTimer = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.texture = null;
    this.textureReady = false;
    this._loadTexture();
    this._resize();
    this._bindEvents();
    this._updateHint();
    this._raf = this._raf.bind(this);
    requestAnimationFrame(this._raf);
  }

  Globe.prototype._loadTexture = function () {
    var self = this;
    var img = new Image();
    img.onload = function () {
      // Cache raw pixel data once so per-pixel sampling below is a plain array
      // read, not a draw call. (Site is served over http(s), so this canvas
      // read is same-origin and untainted.)
      var off = document.createElement("canvas");
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      var octx = off.getContext("2d");
      octx.drawImage(img, 0, 0);
      self.texData = octx.getImageData(0, 0, off.width, off.height);
      self.textureReady = true;
    };
    img.src = "assets/images/earth-texture.png";
    this.texture = img;
  };

  Globe.prototype._resize = function () {
    var wrap = this.canvas.parentElement;
    var size = Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth);
    this.size = size;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    this.canvas.style.width = size + "px";
    this.canvas.style.height = size + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = size / 2;
    this.cy = size / 2;
    this.R = size / 2 - 14;
  };

  Globe.prototype._bindEvents = function () {
    var self = this;
    window.addEventListener("resize", function () { self._resize(); });

    function pointerDown(x, y) {
      self.dragging = true;
      self.autoRotate = false;
      self.lastPointer = { x: x, y: y };
      self.canvas.parentElement.classList.add("is-dragging");
    }
    function pointerMove(x, y) {
      if (!self.dragging || !self.lastPointer) return;
      var dx = x - self.lastPointer.x;
      var dy = y - self.lastPointer.y;
      self.targetRotY += dx * 0.008;
      self.targetRotX += dy * 0.008;
      self.targetRotX = Math.max(-1.1, Math.min(1.1, self.targetRotX));
      self.rotY = self.targetRotY;
      self.rotX = self.targetRotX;
      self.lastPointer = { x: x, y: y };
    }
    function pointerUp() {
      self.dragging = false;
      self._scheduleIdleResume();
    }

    this.canvas.addEventListener("mousedown", function (e) { pointerDown(e.clientX, e.clientY); });
    window.addEventListener("mousemove", function (e) { pointerMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", pointerUp);

    this.canvas.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; pointerDown(t.clientX, t.clientY);
    }, { passive: true });
    this.canvas.addEventListener("touchmove", function (e) {
      var t = e.touches[0]; pointerMove(t.clientX, t.clientY);
    }, { passive: true });
    this.canvas.addEventListener("touchend", pointerUp);

    this.canvas.addEventListener("click", function (e) {
      var rect = self.canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var hit = self._hitTest(x, y);
      if (hit) self.focusPin(hit.id);
    });

    var hint = this.canvas.parentElement.querySelector(".journey__hint");
    if (hint) {
      hint.addEventListener("click", function () {
        if (self.zoom > 1.05) self.zoomOut();
      });
      hint.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && self.zoom > 1.05) {
          e.preventDefault();
          self.zoomOut();
        }
      });
    }
  };

  Globe.prototype._scheduleIdleResume = function () {
    var self = this;
    if (reduceMotion) return;
    clearTimeout(this.idleTimer);
    // Don't resume auto-rotate while still zoomed into a chosen pin — the whole point of
    // the zoom is to hold still on that spot, so spinning away from it after a few seconds
    // (e.g. while the visitor is still reading the card) undoes the thing they just chose.
    this.idleTimer = setTimeout(function () { if (self.zoom <= 1.05) self.autoRotate = true; }, 6000);
  };

  Globe.prototype._project = function (lat, lon) {
    var phi = toRad(lat);
    var lambda = toRad(lon);
    var x0 = Math.cos(phi) * Math.sin(lambda);
    var y0 = Math.sin(phi);
    var z0 = Math.cos(phi) * Math.cos(lambda);

    // rotate around Y (yaw)
    var cosY = Math.cos(this.rotY), sinY = Math.sin(this.rotY);
    var x1 = x0 * cosY + z0 * sinY;
    var z1 = -x0 * sinY + z0 * cosY;
    var y1 = y0;

    // rotate around X (pitch)
    var cosX = Math.cos(this.rotX), sinX = Math.sin(this.rotX);
    var y2 = y1 * cosX - z1 * sinX;
    var z2 = y1 * sinX + z1 * cosX;
    var x2 = x1;

    var r = this.R * this.zoom;
    return {
      x: this.cx + x2 * r,
      y: this.cy - y2 * r,
      z: z2,
      front: z2 > 0.02
    };
  };

  Globe.prototype._hitTest = function (x, y) {
    var best = null, bestDist = 26;
    for (var i = 0; i < PINS.length; i++) {
      var p = this._project(PINS[i].lat, PINS[i].lon);
      if (!p.front) continue;
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) { bestDist = d; best = PINS[i]; }
    }
    return best;
  };

  Globe.prototype._tweenZoom = function (endZoom, dur) {
    var self = this;
    var startZoom = this.zoom;
    if (reduceMotion) { this.zoom = endZoom; this._updateHint(); return; }
    var t0 = performance.now();
    (function tick(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      self.zoom = startZoom + (endZoom - startZoom) * e;
      if (t < 1) requestAnimationFrame(tick);
      else self._updateHint();
    })(t0);
  };

  Globe.prototype.zoomOut = function () {
    this._tweenZoom(1, 600);
    this._scheduleIdleResume();
  };

  Globe.prototype._updateHint = function () {
    var hint = this.canvas.parentElement.querySelector(".journey__hint");
    if (!hint) return;
    if (this.zoom > 1.05) {
      hint.classList.add("is-active-link");
      hint.setAttribute("role", "button");
      hint.setAttribute("tabindex", "0");
    } else {
      hint.classList.remove("is-active-link");
      hint.removeAttribute("role");
      hint.removeAttribute("tabindex");
    }
    var span = hint.querySelector("span[data-i18n]");
    if (span && window.I18N) {
      var lang = document.documentElement.lang === "ar" ? "ar" : "en";
      var key = this.zoom > 1.05 ? "journey.hintZoomOut" : "journey.hint";
      span.setAttribute("data-i18n", key);
      if (window.I18N[lang] && window.I18N[lang][key]) span.textContent = window.I18N[lang][key];
    }
  };

  Globe.prototype.focusPin = function (id) {
    var pin = null;
    for (var i = 0; i < PINS.length; i++) if (PINS[i].id === id) pin = PINS[i];
    if (!pin) return;

    // Clicking the already-focused, already-zoomed pin again backs out to the full globe.
    if (id === this.activeId && this.zoom > 1.05) {
      this.zoomOut();
      return;
    }

    this.activeId = id;
    this.autoRotate = false;
    this._scheduleIdleResume();

    var target = centerRotationFor(pin.lat, pin.lon);
    var targetY = target.y, targetX = target.x;

    var current = this.rotY;
    var diff = ((targetY - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    var startY = this.rotY, endY = this.rotY + diff;
    var startX = this.rotX, endX = targetX;
    var self = this;

    this._tweenZoom(ZOOM_LEVEL, 800);

    if (reduceMotion) {
      this.rotY = endY; this.rotX = endX; this.targetRotY = endY; this.targetRotX = endX;
    } else {
      var t0 = performance.now(), dur = 750;
      (function tick(now) {
        var t = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - t, 3);
        self.rotY = startY + (endY - startY) * e;
        self.rotX = startX + (endX - startX) * e;
        self.targetRotY = self.rotY;
        self.targetRotX = self.rotX;
        if (t < 1) requestAnimationFrame(tick);
      })(t0);
    }

    document.dispatchEvent(new CustomEvent("globe:pinchange", { detail: pin }));
  };

  Globe.prototype._drawLimb = function () {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(244,241,228,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    var grad = ctx.createRadialGradient(this.cx - this.R * 0.35, this.cy - this.R * 0.35, this.R * 0.1, this.cx, this.cy, this.R);
    grad.addColorStop(0, "rgba(244,241,228,0.10)");
    grad.addColorStop(1, "rgba(244,241,228,0.015)");
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  };

  Globe.prototype._ensureBuffer = function (size) {
    if (!this.buf || this.buf.width !== size) {
      this.buf = document.createElement("canvas");
      this.buf.width = size;
      this.buf.height = size;
      this.bctx = this.buf.getContext("2d");
      this.bufImgData = this.bctx.createImageData(size, size);
    }
  };

  // Exact per-pixel texture mapping: for every pixel of a small offscreen buffer,
  // invert the sphere's rotation to find which (lat, lon) that screen pixel shows,
  // then sample the source texture directly. This replaces an earlier flat-quad
  // approximation (project a lat/lon grid, warp each cell with an affine transform)
  // that left visible seams/gaps between cells — worse the more the view was zoomed,
  // since a handful of large quads then covered most of the visible circle and any
  // single mis-drawn one read as a big black wedge. Per-pixel sampling has no cells
  // to seam between, so it can't produce that artifact by construction.
  Globe.prototype._drawTexture = function () {
    if (!this.textureReady) return;

    var bufSize = Math.round(Math.min(480, Math.max(220, this.R * 1.7 * Math.min(this.zoom, 3))));
    this._ensureBuffer(bufSize);

    var tex = this.texData.data, texW = this.texData.width, texH = this.texData.height;
    var out = this.bufImgData.data;
    var half = bufSize / 2;

    var cosY = Math.cos(this.rotY), sinY = Math.sin(this.rotY);
    var cosX = Math.cos(this.rotX), sinX = Math.sin(this.rotX);

    // Screen position -> sphere position also needs to be divided by zoom: _project
    // (used for the pins and graticule) places a sphere point at screen-offset
    // (x2,y2) * R * zoom, so a buffer pixel at normalized offset (nx,ny) from center
    // corresponds to sphere coordinates (nx/zoom, ny/zoom), not (nx,ny) directly.
    // Skipping that division (the original version of this code did) reconstructs
    // the same full-hemisphere framing at every zoom level — sized sharper by a
    // bigger buffer, but never actually cropped in — while the pins/graticule,
    // driven by the correct formula, zoomed in as expected. That mismatch is what
    // made the grid (and the globe generally) look like it wasn't zooming to match.
    var invZoom = 1 / this.zoom;

    for (var by = 0; by < bufSize; by++) {
      var ny = ((half - by) / half) * invZoom;
      var rowOff = by * bufSize * 4;
      for (var bx = 0; bx < bufSize; bx++) {
        var idx = rowOff + bx * 4;
        var nx = ((bx - half) / half) * invZoom;
        var d2 = nx * nx + ny * ny;
        if (d2 > 1) { out[idx + 3] = 0; continue; }
        var nz = Math.sqrt(1 - d2);

        // Undo pitch (rotX), then undo yaw (rotY) — inverse of _project's forward path.
        var y1 = ny * cosX + nz * sinX;
        var z1 = -ny * sinX + nz * cosX;
        var x1 = nx;
        var x0 = x1 * cosY - z1 * sinY;
        var z0 = x1 * sinY + z1 * cosY;
        var y0 = y1;

        var lat = Math.asin(Math.max(-1, Math.min(1, y0)));
        var lon = Math.atan2(x0, z0);

        var u = ((lon + Math.PI) / (2 * Math.PI)) * texW | 0;
        var v = ((Math.PI / 2 - lat) / Math.PI) * texH | 0;
        if (u < 0) u = 0; else if (u >= texW) u = texW - 1;
        if (v < 0) v = 0; else if (v >= texH) v = texH - 1;

        var tIdx = (v * texW + u) * 4;
        out[idx] = tex[tIdx];
        out[idx + 1] = tex[tIdx + 1];
        out[idx + 2] = tex[tIdx + 2];
        out[idx + 3] = tex[tIdx + 3];
      }
    }

    this.bctx.putImageData(this.bufImgData, 0, 0);

    var ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.buf, this.cx - this.R, this.cy - this.R, this.R * 2, this.R * 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  Globe.prototype._drawGraticule = function () {
    var ctx = this.ctx;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(244,241,228,0.22)";

    // The grid points already scale with zoom (_project multiplies by this.R *
    // this.zoom, same as the texture and pins), but without a clip the lines
    // simply extend past the frame at high zoom instead of reading as "zoomed
    // in" — clip to the same fixed-size circle the texture is cropped to, so
    // the grid stays visually contained and clearly scales with the globe.
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.clip();

    // meridians
    for (var lon = -150; lon <= 180; lon += 30) {
      this._strokePath(function (t) { return { lat: -90 + t * 180, lon: lon }; });
    }
    // parallels
    for (var lat = -60; lat <= 60; lat += 30) {
      this._strokePath(function (t) { return { lat: lat, lon: -180 + t * 360 }; });
    }

    ctx.restore();
  };

  Globe.prototype._strokePath = function (fn) {
    var ctx = this.ctx;
    var segments = 72;
    var open = false;
    ctx.beginPath();
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var pt = fn(t);
      var p = this._project(pt.lat, pt.lon);
      if (p.front) {
        if (!open) { ctx.moveTo(p.x, p.y); open = true; }
        else ctx.lineTo(p.x, p.y);
      } else {
        open = false;
      }
    }
    ctx.stroke();
  };

  Globe.prototype._drawPins = function () {
    var ctx = this.ctx;
    for (var i = 0; i < PINS.length; i++) {
      var pin = PINS[i];
      var p = this._project(pin.lat, pin.lon);
      if (!p.front) continue;
      var isActive = pin.id === this.activeId;
      var isDest = pin.kind === "destination";
      var r = isActive ? 8 : 6;

      if (isActive) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(177,90,52,0.28)";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isDest ? "#B15A34" : "#F4F1E4";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isActive ? "#B15A34" : "rgba(20,20,14,0.35)";
      ctx.stroke();
    }
  };

  Globe.prototype._raf = function () {
    if (this.autoRotate && !this.dragging) {
      this.rotY += 0.0022;
      this.targetRotY = this.rotY;
    }
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    this._drawLimb();
    this._drawTexture();
    this._drawGraticule();
    this._drawPins();
    requestAnimationFrame(this._raf);
  };

  function init() {
    var canvas = document.getElementById("globeCanvas");
    if (!canvas) return;
    var globe = new Globe(canvas);
    window.WeddingGlobe = {
      focusPin: function (id) { globe.focusPin(id); },
      pins: PINS
    };
    // Announce initial pin so the card populates on load.
    var initial = null;
    for (var i = 0; i < PINS.length; i++) if (PINS[i].id === globe.activeId) initial = PINS[i];
    if (initial) document.dispatchEvent(new CustomEvent("globe:pinchange", { detail: initial }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
