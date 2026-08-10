(function () {
  "use strict";

  const PX_PER_MM = 5; // canvas render resolution for the exported PNG
  const SCREEN_ORDER = ["store", "sku", "design", "customize", "customer-info", "confirm"];

  const state = {
    storeId: null,
    storeName: null,
    skus: [],
    designs: [],
    accentColors: [],
    motifs: [],
    sku: null,
    design: null,
    designImage: null,
    accentId: "blue",
    motifId: "none",
    initials: "",
    customerName: "",
    customerNumber: "",
    customerEmail: "",
    customerCity: "",
    customerState: "",
    customerPincode: ""
  };

  const el = {
    startOverHeaderBtn: document.getElementById("startOverHeaderBtn"),
    progressBar: document.getElementById("progressBar"),
    storeSelect: document.getElementById("storeSelect"),
    storeError: document.getElementById("storeError"),
    storeContinueBtn: document.getElementById("storeContinueBtn"),
    skuGrid: document.getElementById("skuGrid"),
    skuContinueBtn: document.getElementById("skuContinueBtn"),
    designGrid: document.getElementById("designGrid"),
    designContinueBtn: document.getElementById("designContinueBtn"),
    customizeDesignName: document.getElementById("customizeDesignName"),
    initialsInput: document.getElementById("initialsInput"),
    accentSwatches: document.getElementById("accentSwatches"),
    motifButtons: document.getElementById("motifButtons"),
    submitError: document.getElementById("submitError"),
    finalizeBtn: document.getElementById("finalizeBtn"),
    customerName: document.getElementById("customerName"),
    customerNumber: document.getElementById("customerNumber"),
    customerEmail: document.getElementById("customerEmail"),
    customerCity: document.getElementById("customerCity"),
    customerState: document.getElementById("customerState"),
    customerPincode: document.getElementById("customerPincode"),
    customerInfoError: document.getElementById("customerInfoError"),
    submitOrderBtn: document.getElementById("submitOrderBtn"),
    previewBox: document.getElementById("previewBox"),
    previewImg: document.getElementById("previewImg"),
    previewMotifZone: document.getElementById("previewMotifZone"),
    previewZone: document.getElementById("previewZone"),
    previewInitials: document.getElementById("previewInitials"),
    previewCaption: document.getElementById("previewCaption"),
    referenceId: document.getElementById("referenceId"),
    submitStatus: document.getElementById("submitStatus"),
    startOverBtn: document.getElementById("startOverBtn"),
    sumDesign: document.getElementById("sumDesign"),
    sumSku: document.getElementById("sumSku"),
    sumInitials: document.getElementById("sumInitials"),
    sumAccent: document.getElementById("sumAccent"),
    sumMotif: document.getElementById("sumMotif"),
    sumStore: document.getElementById("sumStore"),
    sumReferenceId: document.getElementById("sumReferenceId")
  };

  // ---------- Screen navigation ----------
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.toggle("active", s.dataset.screen === name);
    });
    el.startOverHeaderBtn.hidden = name === "store";
    el.progressBar.classList.toggle("hidden", name === "confirm");

    const stepIndex = SCREEN_ORDER.indexOf(name);
    document.querySelectorAll(".progress-seg").forEach((seg) => {
      seg.classList.toggle("done", Number(seg.dataset.step) <= stepIndex);
    });
  }

  // ---------- API helpers ----------
  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- Screen 1: Store ----------
  async function loadStores() {
    el.storeError.hidden = true;
    el.storeSelect.innerHTML = '<option value="">Choose a store&hellip;</option>';
    try {
      const stores = await api("/api/stores");
      stores.forEach((store) => {
        const opt = document.createElement("option");
        opt.value = store.storeId;
        opt.textContent = store.storeName;
        el.storeSelect.appendChild(opt);
      });
    } catch (err) {
      el.storeError.textContent = "Couldn't load stores. " + err.message;
      el.storeError.hidden = false;
    }
  }

  el.storeSelect.addEventListener("change", () => {
    el.storeContinueBtn.disabled = !el.storeSelect.value;
  });

  el.storeContinueBtn.addEventListener("click", async () => {
    const storeId = el.storeSelect.value;
    if (!storeId) return;
    el.storeError.hidden = true;
    try {
      const result = await api("/api/session/store", {
        method: "POST",
        body: JSON.stringify({ storeId })
      });
      state.storeId = result.storeId;
      state.storeName = result.storeName;
      await Promise.all([loadSkus(), loadDesigns(), loadAccentColors(), loadMotifs()]);
      showScreen("sku");
    } catch (err) {
      el.storeError.textContent = err.message;
      el.storeError.hidden = false;
    }
  });

  el.startOverHeaderBtn.addEventListener("click", startOver);

  async function startOver() {
    await api("/api/session/reset-store", { method: "POST" }).catch(() => {});
    state.storeId = null;
    state.storeName = null;
    state.sku = null;
    state.design = null;
    state.designImage = null;
    state.accentId = "blue";
    state.motifId = "none";
    state.initials = "";
    state.customerName = "";
    state.customerNumber = "";
    state.customerEmail = "";
    state.customerCity = "";
    state.customerState = "";
    state.customerPincode = "";
    el.initialsInput.value = "";
    el.storeSelect.value = "";
    el.storeContinueBtn.disabled = true;
    document.querySelectorAll(".pick-card").forEach((c) => c.classList.remove("selected"));
    el.skuContinueBtn.disabled = true;
    el.designContinueBtn.disabled = true;
    [el.customerName, el.customerNumber, el.customerEmail, el.customerCity, el.customerState, el.customerPincode].forEach(
      (input) => (input.value = "")
    );
    el.customerInfoError.hidden = true;
    el.submitOrderBtn.disabled = true;
    await loadStores();
    showScreen("store");
  }

  // ---------- Screen 2: SKU ----------
  async function loadSkus() {
    state.skus = await api("/api/skus");
    el.skuGrid.innerHTML = "";
    state.skus.forEach((sku) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pick-card";
      card.innerHTML = `
        <div class="pick-card-thumb" style="aspect-ratio:${sku.widthMm}/${sku.heightMm}"></div>
        <span class="pick-card-title">${sku.familyName}</span>
        <span class="pick-card-sub">${sku.widthMm} mm &times; ${sku.heightMm} mm</span>
      `;
      card.addEventListener("click", () => {
        state.sku = sku;
        document.querySelectorAll("#skuGrid .pick-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        el.skuContinueBtn.disabled = false;
      });
      el.skuGrid.appendChild(card);
    });
  }

  document.querySelector('[data-action="back-to-store"]').addEventListener("click", () => showScreen("store"));
  el.skuContinueBtn.addEventListener("click", () => {
    renderDesignGrid();
    showScreen("design");
  });

  // ---------- Screen 3: Design ----------
  async function loadDesigns() {
    state.designs = await api("/api/designs");
    renderDesignGrid();
  }

  function renderDesignGrid() {
    el.designGrid.innerHTML = "";
    const selectedId = state.design ? state.design.id : null;
    state.designs.forEach((design) => {
      const sku = state.sku || { widthMm: 4, heightMm: 3 };
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pick-card" + (design.id === selectedId ? " selected" : "");
      card.innerHTML = `
        <div class="pick-card-thumb" style="aspect-ratio:${sku.widthMm}/${sku.heightMm}">
          <img src="${design.assetPath}" alt="${design.name}" />
          <div class="zone-outline" style="top:${design.zone.yPct}%;left:${design.zone.xPct}%;width:${design.zone.widthPct}%;height:${design.zone.heightPct}%;"></div>
        </div>
        <span class="pick-card-title">${design.name}</span>
      `;
      card.addEventListener("click", () => {
        state.design = design;
        document.querySelectorAll("#designGrid .pick-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        el.designContinueBtn.disabled = false;
      });
      el.designGrid.appendChild(card);
    });
  }

  document.querySelector('[data-action="back-to-sku"]').addEventListener("click", () => showScreen("sku"));
  el.designContinueBtn.addEventListener("click", () => enterCustomizeScreen());

  // ---------- Screen 4: Customize + live preview ----------
  async function loadAccentColors() {
    state.accentColors = await api("/api/accent-colors");
  }

  async function loadMotifs() {
    state.motifs = await api("/api/motifs");
  }

  function currentAccent() {
    return state.accentColors.find((a) => a.id === state.accentId) || state.accentColors[0];
  }

  function currentMotif() {
    return state.motifs.find((m) => m.id === state.motifId) || state.motifs[0];
  }

  function renderAccentSwatches() {
    el.accentSwatches.innerHTML = "";
    state.accentColors.forEach((accent) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch" + (accent.id === state.accentId ? " selected" : "");
      if (accent.hex.toLowerCase() === "#ffffff") btn.classList.add("white");
      btn.style.background = accent.hex;
      btn.setAttribute("aria-label", accent.name);
      btn.addEventListener("click", () => {
        state.accentId = accent.id;
        renderAccentSwatches();
        drawLivePreview();
      });
      el.accentSwatches.appendChild(btn);
    });
  }

  const MOTIF_ICON_HTML = {
    none: '<span class="motif-icon-none">&mdash;</span>',
    stripe: '<div class="motif-icon-stripe"></div>',
    dots: '<div class="motif-icon-dot"></div><div class="motif-icon-dot"></div><div class="motif-icon-dot"></div>',
    circle: '<div class="motif-icon-circle"></div>',
    slash: '<div class="motif-icon-slash"></div>'
  };

  function renderMotifButtons() {
    el.motifButtons.innerHTML = "";
    state.motifs.forEach((motif) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "motif-btn" + (motif.id === state.motifId ? " selected" : "");
      btn.innerHTML = `
        <div class="motif-icon-wrap">${MOTIF_ICON_HTML[motif.id] || ""}</div>
        <span class="motif-label">${motif.name}</span>
      `;
      btn.addEventListener("click", () => {
        state.motifId = motif.id;
        renderMotifButtons();
        drawLivePreview();
      });
      el.motifButtons.appendChild(btn);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function enterCustomizeScreen() {
    el.submitError.hidden = true;
    el.initialsInput.value = state.initials || "";
    el.customizeDesignName.textContent = state.design.name;
    renderAccentSwatches();
    renderMotifButtons();
    showScreen("customize");
    try {
      state.designImage = await loadImage(state.design.assetPath);
    } catch (err) {
      state.designImage = null;
    }
    drawLivePreview();
  }

  function zoneStyleString(zone) {
    const justify = zone.align === "left" ? "flex-start" : zone.align === "right" ? "flex-end" : "center";
    return `top:${zone.yPct}%;left:${zone.xPct}%;width:${zone.widthPct}%;height:${zone.heightPct}%;justify-content:${justify};`;
  }

  function drawLivePreview() {
    const sku = state.sku;
    const design = state.design;
    if (!sku || !design) return;

    const accent = currentAccent();
    const motif = currentMotif();

    el.previewBox.style.aspectRatio = `${sku.widthMm} / ${sku.heightMm}`;
    el.previewImg.src = design.assetPath;

    el.previewZone.setAttribute("style", zoneStyleString(design.zone));
    const zoneColor = design.zone.followsAccent ? accent.hex : design.zone.fixedColor;
    const fontSize = state.initials.length <= 1 ? "9cqw" : state.initials.length === 2 ? "7cqw" : "5.5cqw";
    el.previewInitials.style.color = zoneColor;
    el.previewInitials.style.fontSize = fontSize;
    el.previewInitials.textContent = state.initials;

    const mz = design.motifZone;
    el.previewMotifZone.setAttribute(
      "style",
      `top:${mz.yPct}%;left:${mz.xPct}%;width:${mz.widthPct}%;height:${mz.heightPct}%;`
    );
    el.previewMotifZone.innerHTML = motifPreviewHtml(motif.id, accent.hex);

    el.previewCaption.textContent = `${sku.familyName} — ${sku.widthMm} mm × ${sku.heightMm} mm`;
  }

  function motifPreviewHtml(motifId, hex) {
    switch (motifId) {
      case "stripe":
        return `<div style="width:60%;height:38%;background:${hex};transform:skewX(-20deg);"></div>`;
      case "dots":
        return `<div style="width:14%;height:14%;border-radius:50%;background:${hex};"></div>`.repeat(3);
      case "circle":
        return `<div style="width:55%;aspect-ratio:1/1;border-radius:50%;border:8% solid ${hex};"></div>`;
      case "slash":
        return `<div style="width:10%;height:85%;background:${hex};transform:rotate(20deg);"></div>`;
      default:
        return "";
    }
  }

  function sanitizeInitials(raw) {
    return raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
  }

  el.initialsInput.addEventListener("input", () => {
    const clean = sanitizeInitials(el.initialsInput.value);
    el.initialsInput.value = clean;
    state.initials = clean;
    el.finalizeBtn.disabled = !clean;
    drawLivePreview();
  });

  document.querySelector('[data-action="back-to-design"]').addEventListener("click", () => showScreen("design"));

  // ---------- Canvas rasterization (for the emailed PNG) ----------
  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;
    let sw, sh, sx, sy;
    if (imgRatio > boxRatio) {
      sh = img.height;
      sw = sh * boxRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / boxRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function drawMotif(ctx, motifId, hex, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = hex;
    ctx.strokeStyle = hex;
    const cx = x + w / 2;
    const cy = y + h / 2;
    switch (motifId) {
      case "stripe": {
        const sw = w * 0.6;
        const sh = h * 0.38;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.transform(1, 0, -Math.tan((20 * Math.PI) / 180), 1, 0, 0);
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        ctx.restore();
        break;
      }
      case "dots": {
        const r = Math.min(w, h) * 0.07;
        const gap = r * 3;
        [-gap, 0, gap].forEach((dx) => {
          ctx.beginPath();
          ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case "circle": {
        const r = Math.min(w, h) * 0.275;
        ctx.lineWidth = r * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "slash": {
        const sw = w * 0.1;
        const sh = h * 0.85;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((20 * Math.PI) / 180);
        ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
        ctx.restore();
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  function renderFinalCanvas() {
    const sku = state.sku;
    const design = state.design;
    const accent = currentAccent();
    const motif = currentMotif();

    const canvas = document.createElement("canvas");
    const w = Math.round(sku.widthMm * PX_PER_MM);
    const h = Math.round(sku.heightMm * PX_PER_MM);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, 10);
    ctx.clip();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (state.designImage) {
      drawImageCover(ctx, state.designImage, 0, 0, w, h);
    }

    const mz = design.motifZone;
    drawMotif(ctx, motif.id, accent.hex, (mz.xPct / 100) * w, (mz.yPct / 100) * h, (mz.widthPct / 100) * w, (mz.heightPct / 100) * h);

    const zone = design.zone;
    const zx = (zone.xPct / 100) * w;
    const zy = (zone.yPct / 100) * h;
    const zw = (zone.widthPct / 100) * w;
    const zh = (zone.heightPct / 100) * h;
    const zoneColor = zone.followsAccent ? accent.hex : zone.fixedColor;

    ctx.fillStyle = zoneColor;
    const fontSize = Math.max(state.initials.length <= 1 ? zh * 0.85 : state.initials.length === 2 ? zh * 0.68 : zh * 0.52, 10);
    ctx.font = `700 ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.textBaseline = "middle";
    let textX = zx + zw / 2;
    ctx.textAlign = "center";
    if (zone.align === "left") {
      textX = zx;
      ctx.textAlign = "left";
    } else if (zone.align === "right") {
      textX = zx + zw;
      ctx.textAlign = "right";
    }
    ctx.fillText(state.initials, textX, zy + zh / 2);

    ctx.restore();
    return canvas.toDataURL("image/png");
  }

  // ---------- Finalize (design is locked in, move to customer info) ----------
  el.finalizeBtn.addEventListener("click", () => {
    el.submitError.hidden = true;

    if (!/^[A-Z]{1,3}$/.test(state.initials)) {
      el.submitError.textContent = "Enter 1-3 letters for your initials.";
      el.submitError.hidden = false;
      return;
    }

    showScreen("customer-info");
  });

  document.querySelector('[data-action="back-to-customize"]').addEventListener("click", () => showScreen("customize"));

  // ---------- Screen 5: Customer info ----------
  function isValidEmailClient(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  function isValidPhoneClient(v) {
    const digits = String(v || "").replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }

  function isValidPincodeClient(v) {
    return /^[A-Za-z0-9 -]{3,10}$/.test(String(v || "").trim());
  }

  function showCustomerError(message) {
    el.customerInfoError.textContent = message;
    el.customerInfoError.hidden = false;
  }

  function updateSubmitOrderState() {
    const filled = [
      el.customerName,
      el.customerNumber,
      el.customerEmail,
      el.customerCity,
      el.customerState,
      el.customerPincode
    ].every((input) => input.value.trim() !== "");
    el.submitOrderBtn.disabled = !filled;
  }

  [el.customerName, el.customerNumber, el.customerEmail, el.customerCity, el.customerState, el.customerPincode].forEach(
    (input) => input.addEventListener("input", updateSubmitOrderState)
  );

  el.submitOrderBtn.addEventListener("click", async () => {
    el.customerInfoError.hidden = true;

    const name = el.customerName.value.trim();
    const number = el.customerNumber.value.trim();
    const email = el.customerEmail.value.trim();
    const city = el.customerCity.value.trim();
    const stateVal = el.customerState.value.trim();
    const pincode = el.customerPincode.value.trim();

    if (!name) return showCustomerError("Enter your full name.");
    if (!isValidPhoneClient(number)) return showCustomerError("Enter a valid phone number.");
    if (!isValidEmailClient(email)) return showCustomerError("Enter a valid email address.");
    if (!city) return showCustomerError("Enter your city.");
    if (!stateVal) return showCustomerError("Enter your state.");
    if (!isValidPincodeClient(pincode)) return showCustomerError("Enter a valid pincode.");

    state.customerName = name;
    state.customerNumber = number;
    state.customerEmail = email;
    state.customerCity = city;
    state.customerState = stateVal;
    state.customerPincode = pincode;

    el.submitOrderBtn.disabled = true;
    el.submitOrderBtn.textContent = "Submitting...";

    try {
      const previewPng = renderFinalCanvas();
      const result = await api("/api/submit", {
        method: "POST",
        body: JSON.stringify({
          skuId: state.sku.id,
          designId: state.design.id,
          accentId: state.accentId,
          motifId: state.motifId,
          initials: state.initials,
          previewPng,
          customerName: name,
          customerNumber: number,
          customerEmail: email,
          customerCity: city,
          customerState: stateVal,
          customerPincode: pincode
        })
      });
      showConfirmScreen(result.referenceId, true, "Your order has been sent to the print provider.");
    } catch (err) {
      if (err.data && err.data.referenceId) {
        showConfirmScreen(
          err.data.referenceId,
          false,
          err.data.error || "We couldn't send your order to the print provider."
        );
      } else {
        showCustomerError((err.data && err.data.error) || "Something went wrong submitting your order. Please try again.");
      }
    } finally {
      el.submitOrderBtn.disabled = false;
      el.submitOrderBtn.textContent = "Submit Order";
    }
  });

  function showConfirmScreen(referenceId, success, statusMessage) {
    const accent = currentAccent();
    const motif = currentMotif();
    el.referenceId.textContent = referenceId;
    el.sumDesign.textContent = state.design.name;
    el.sumSku.textContent = `${state.sku.familyName} (${state.sku.widthMm} mm × ${state.sku.heightMm} mm)`;
    el.sumInitials.textContent = state.initials;
    el.sumAccent.textContent = accent.name;
    el.sumMotif.textContent = motif.name;
    el.sumStore.textContent = state.storeName || "—";
    el.sumReferenceId.textContent = referenceId;
    el.submitStatus.textContent = statusMessage;
    el.submitStatus.classList.toggle("error", !success);
    showScreen("confirm");
  }

  // ---------- Screen 6: Confirmation ----------
  el.startOverBtn.addEventListener("click", startOver);

  // ---------- Boot ----------
  (async function init() {
    try {
      const session = await api("/api/session");
      if (session.storeId) {
        state.storeId = session.storeId;
        state.storeName = session.storeName;
        await Promise.all([loadSkus(), loadDesigns(), loadAccentColors(), loadMotifs()]);
        showScreen("sku");
        return;
      }
    } catch (err) {
      // fall through to store screen
    }
    await loadStores();
    showScreen("store");
  })();
})();
