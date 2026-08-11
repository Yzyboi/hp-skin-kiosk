(function () {
  "use strict";

  const PX_PER_MM = 5; // canvas render resolution for the exported PNG
  const SCREEN_ORDER = ["store", "sku", "design", "customize", "customer-info", "confirm"];

  const state = {
    storeId: null,
    storeName: null,
    allStores: [],
    allSkus: [],
    designs: [],
    sku: null,
    design: null,
    designImage: null,
    initials: "",
    customerName: "",
    customerNumber: "",
    customerEmail: "",
    customerAddress: "",
    customerCity: "",
    customerState: "",
    customerPincode: ""
  };

  const el = {
    startOverHeaderBtn: document.getElementById("startOverHeaderBtn"),
    progressBar: document.getElementById("progressBar"),
    storeSearchInput: document.getElementById("storeSearchInput"),
    storeList: document.getElementById("storeList"),
    storeError: document.getElementById("storeError"),
    storeContinueBtn: document.getElementById("storeContinueBtn"),
    skuSearchInput: document.getElementById("skuSearchInput"),
    skuList: document.getElementById("skuList"),
    skuContinueBtn: document.getElementById("skuContinueBtn"),
    designGrid: document.getElementById("designGrid"),
    designContinueBtn: document.getElementById("designContinueBtn"),
    customizeDesignName: document.getElementById("customizeDesignName"),
    customizeHeadline: document.getElementById("customizeHeadline"),
    customizeHint: document.getElementById("customizeHint"),
    initialsInput: document.getElementById("initialsInput"),
    submitError: document.getElementById("submitError"),
    finalizeBtn: document.getElementById("finalizeBtn"),
    customerName: document.getElementById("customerName"),
    customerNumber: document.getElementById("customerNumber"),
    customerEmail: document.getElementById("customerEmail"),
    customerAddress: document.getElementById("customerAddress"),
    customerCity: document.getElementById("customerCity"),
    customerState: document.getElementById("customerState"),
    customerPincode: document.getElementById("customerPincode"),
    consentCheckbox: document.getElementById("consentCheckbox"),
    customerInfoError: document.getElementById("customerInfoError"),
    submitOrderBtn: document.getElementById("submitOrderBtn"),
    previewBox: document.getElementById("previewBox"),
    previewImg: document.getElementById("previewImg"),
    previewZone: document.getElementById("previewZone"),
    previewInitials: document.getElementById("previewInitials"),
    previewCaption: document.getElementById("previewCaption"),
    confirmIcon: document.getElementById("confirmIcon"),
    confirmHeadline: document.getElementById("confirmHeadline"),
    referenceId: document.getElementById("referenceId"),
    submitStatus: document.getElementById("submitStatus"),
    startOverBtn: document.getElementById("startOverBtn"),
    sumDesign: document.getElementById("sumDesign"),
    sumSku: document.getElementById("sumSku"),
    sumInitials: document.getElementById("sumInitials"),
    sumInitialsLabel: document.getElementById("sumInitialsLabel"),
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
  let pendingStoreId = null;

  function renderStoreList(filterText) {
    const q = String(filterText || "").trim().toLowerCase();
    const filtered = q ? state.allStores.filter((s) => s.storeName.toLowerCase().includes(q)) : state.allStores;

    el.storeList.innerHTML = "";
    if (filtered.length === 0) {
      el.storeList.innerHTML = '<p class="store-empty">No stores match your search.</p>';
      return;
    }
    filtered.forEach((store) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "store-option" + (store.storeId === pendingStoreId ? " selected" : "");
      btn.textContent = store.storeName;
      btn.addEventListener("click", () => {
        pendingStoreId = store.storeId;
        renderStoreList(el.storeSearchInput.value);
        el.storeContinueBtn.disabled = false;
      });
      el.storeList.appendChild(btn);
    });
  }

  async function loadStores() {
    el.storeError.hidden = true;
    pendingStoreId = null;
    el.storeContinueBtn.disabled = true;
    try {
      state.allStores = await api("/api/stores");
      renderStoreList(el.storeSearchInput.value);
    } catch (err) {
      el.storeError.textContent = "Couldn't load stores. " + err.message;
      el.storeError.hidden = false;
    }
  }

  el.storeSearchInput.addEventListener("input", () => renderStoreList(el.storeSearchInput.value));

  el.storeContinueBtn.addEventListener("click", async () => {
    const storeId = pendingStoreId;
    if (!storeId) return;
    el.storeError.hidden = true;
    try {
      const result = await api("/api/session/store", {
        method: "POST",
        body: JSON.stringify({ storeId })
      });
      state.storeId = result.storeId;
      state.storeName = result.storeName;
      await Promise.all([loadSkus(), loadDesigns()]);
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
    state.initials = "";
    state.customerName = "";
    state.customerNumber = "";
    state.customerEmail = "";
    state.customerAddress = "";
    state.customerCity = "";
    state.customerState = "";
    state.customerPincode = "";
    el.initialsInput.value = "";
    el.storeSearchInput.value = "";
    el.storeContinueBtn.disabled = true;
    el.skuSearchInput.value = "";
    el.skuContinueBtn.disabled = true;
    document.querySelectorAll(".pick-card").forEach((c) => c.classList.remove("selected"));
    el.designContinueBtn.disabled = true;
    [el.customerName, el.customerNumber, el.customerEmail, el.customerAddress, el.customerCity, el.customerState, el.customerPincode].forEach(
      (input) => (input.value = "")
    );
    el.consentCheckbox.checked = false;
    el.customerInfoError.hidden = true;
    el.submitOrderBtn.disabled = true;
    await loadStores();
    showScreen("store");
  }

  // ---------- Screen 2: SKU ----------
  // Customers only ever see Model Name + Family here - the rest of the
  // spec sheet (form factor, hinges, logo, weight, source) is admin-only.
  function renderSkuList(filterText) {
    const q = String(filterText || "").trim().toLowerCase();
    const filtered = q
      ? state.allSkus.filter(
          (s) => s.modelName.toLowerCase().includes(q) || s.familyName.toLowerCase().includes(q)
        )
      : state.allSkus;

    el.skuList.innerHTML = "";
    if (filtered.length === 0) {
      el.skuList.innerHTML = '<p class="store-empty">No laptops match your search.</p>';
      return;
    }
    filtered.forEach((sku) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sku-option" + (state.sku && state.sku.id === sku.id ? " selected" : "");
      btn.innerHTML = `
        <span class="sku-option-name">${sku.modelName}</span>
        <span class="sku-option-family">${sku.familyName}</span>
      `;
      btn.addEventListener("click", () => {
        state.sku = sku;
        renderSkuList(el.skuSearchInput.value);
        el.skuContinueBtn.disabled = false;
      });
      el.skuList.appendChild(btn);
    });
  }

  async function loadSkus() {
    state.allSkus = await api("/api/skus");
    renderSkuList(el.skuSearchInput.value);
  }

  el.skuSearchInput.addEventListener("input", () => renderSkuList(el.skuSearchInput.value));

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
  // Colour and font are fixed per design (no customer-facing picker) -
  // each design's zone.color/zone.fontFamily are used directly. The font
  // is a Google Font the admin locked in for that design, so it has to be
  // fetched at runtime before it can be used for either the live CSS
  // preview or the canvas rasterization below.
  const loadedFontFamilies = new Set();

  function ensureGoogleFontStylesheet(fontFamily) {
    if (loadedFontFamilies.has(fontFamily)) return Promise.resolve();
    loadedFontFamilies.add(fontFamily);
    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, "+")}:wght@700&display=swap`;
      link.onload = () => resolve();
      link.onerror = () => resolve(); // best-effort - falls back to sans-serif rather than blocking the kiosk
      document.head.appendChild(link);
    });
  }

  // Registering the stylesheet isn't enough to guarantee the glyphs are
  // actually downloaded - canvas text drawn before that finishes silently
  // falls back to a default font. document.fonts.load() forces the fetch
  // and resolves once it's ready to use.
  async function loadDesignFont(design) {
    const fontFamily = design && design.zone && design.zone.fontFamily;
    if (!fontFamily) return;
    await ensureGoogleFontStylesheet(fontFamily);
    try {
      await document.fonts.load(`700 48px "${fontFamily}"`);
    } catch (err) {
      // best-effort - proceed with whatever font the browser falls back to
    }
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

  // Each design's customization text can be anything from 1-3 letter
  // initials to an unbounded full name, so the font size can't be a fixed
  // lookup by length anymore - it has to shrink to fit whatever the
  // customer typed inside the zone's actual pixel dimensions. Shared
  // offscreen canvas used purely for text measurement (kept separate from
  // any canvas actually being drawn to).
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");

  // No cap on how much customer text a design can accept means no fixed
  // floor here either - a size floor that's reached before the text
  // actually fits just means the overflow gets clipped by the zone's
  // container instead of shrinking to fit, which reads as the text being
  // cut off. The floor only exists to stop the loop at an unrenderable
  // size, not to protect readability - very long input in a small zone
  // will legitimately end up tiny rather than clipped.
  function fitFontSize(text, maxWidth, maxSize, fontFamily, minSize) {
    const floor = minSize || 3;
    let size = Math.max(maxSize, floor);
    const safeText = text && text.length > 0 ? text : "M";
    measureCtx.font = `700 ${size}px "${fontFamily}", sans-serif`;
    while (size > floor && measureCtx.measureText(safeText).width > maxWidth) {
      size -= 1;
      measureCtx.font = `700 ${size}px "${fontFamily}", sans-serif`;
    }
    return size;
  }

  async function enterCustomizeScreen() {
    el.submitError.hidden = true;
    el.initialsInput.value = state.initials || "";
    el.customizeDesignName.textContent = state.design.name;

    const fieldLabel = state.design.zone.fieldLabel || "text";
    const maxLength = state.design.zone.maxLength || 0;
    el.customizeHeadline.textContent = `Add your ${fieldLabel}.`;
    el.customizeHint.textContent =
      maxLength > 0
        ? `Up to ${maxLength} character${maxLength === 1 ? "" : "s"}, automatically capitalized.`
        : "Automatically capitalized.";
    el.initialsInput.placeholder = `Enter your ${fieldLabel}`;
    if (maxLength > 0) {
      el.initialsInput.setAttribute("maxlength", String(maxLength));
    } else {
      el.initialsInput.removeAttribute("maxlength");
    }

    showScreen("customize");
    try {
      state.designImage = await loadImage(state.design.assetPath);
    } catch (err) {
      state.designImage = null;
    }
    await loadDesignFont(state.design);
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

    el.previewBox.style.aspectRatio = `${sku.widthMm} / ${sku.heightMm}`;
    el.previewImg.src = design.assetPath;

    el.previewZone.setAttribute("style", zoneStyleString(design.zone));
    el.previewInitials.style.color = design.zone.color;
    el.previewInitials.style.fontFamily = `"${design.zone.fontFamily}", sans-serif`;
    el.previewInitials.textContent = state.initials;

    // Measured against the zone's actual rendered pixel size, not a fixed
    // cqw value, so it works the same whether the text is "AK" or a full
    // name. A slightly larger safety margin than the canvas export below
    // to leave room for the preview's CSS letter-spacing, which canvas
    // text measurement doesn't account for.
    const zoneRect = el.previewZone.getBoundingClientRect();
    if (zoneRect.width > 0 && zoneRect.height > 0) {
      const fitSize = fitFontSize(state.initials, zoneRect.width * 0.88, zoneRect.height * 0.85, design.zone.fontFamily);
      el.previewInitials.style.fontSize = `${fitSize}px`;
    }

    el.previewCaption.textContent = `${sku.modelName} — ${sku.widthMm} mm × ${sku.heightMm} mm`;
  }

  function sanitizeCustomizationText(raw, maxLength) {
    const upper = raw.toUpperCase();
    return maxLength > 0 ? upper.slice(0, maxLength) : upper;
  }

  el.initialsInput.addEventListener("input", () => {
    const maxLength = (state.design && state.design.zone.maxLength) || 0;
    const clean = sanitizeCustomizationText(el.initialsInput.value, maxLength);
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

  async function renderFinalCanvas() {
    const sku = state.sku;
    const design = state.design;
    await loadDesignFont(design);

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

    const zone = design.zone;
    const zx = (zone.xPct / 100) * w;
    const zy = (zone.yPct / 100) * h;
    const zw = (zone.widthPct / 100) * w;
    const zh = (zone.heightPct / 100) * h;

    // Clipped to the zone rectangle itself (not just the canvas's rounded
    // corners above) so the exported print file can never show text
    // bleeding into the rest of the artwork, matching the live preview's
    // overflow:hidden zone box.
    ctx.save();
    ctx.beginPath();
    ctx.rect(zx, zy, zw, zh);
    ctx.clip();

    ctx.fillStyle = zone.color;
    const fontSize = fitFontSize(state.initials, zw * 0.94, zh * 0.85, zone.fontFamily);
    ctx.font = `700 ${fontSize}px "${zone.fontFamily}", sans-serif`;
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

    ctx.restore();
    return canvas.toDataURL("image/png");
  }

  // ---------- Finalize (design is locked in, move to customer info) ----------
  el.finalizeBtn.addEventListener("click", () => {
    el.submitError.hidden = true;

    if (!state.initials || state.initials.trim().length < 1) {
      el.submitError.textContent = `Enter your ${state.design.zone.fieldLabel || "text"}.`;
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
      el.customerAddress,
      el.customerCity,
      el.customerState,
      el.customerPincode
    ].every((input) => input.value.trim() !== "");
    el.submitOrderBtn.disabled = !(filled && el.consentCheckbox.checked);
  }

  [el.customerName, el.customerNumber, el.customerEmail, el.customerAddress, el.customerCity, el.customerState, el.customerPincode].forEach(
    (input) => input.addEventListener("input", updateSubmitOrderState)
  );
  el.consentCheckbox.addEventListener("change", updateSubmitOrderState);

  el.submitOrderBtn.addEventListener("click", async () => {
    el.customerInfoError.hidden = true;

    const name = el.customerName.value.trim();
    const number = el.customerNumber.value.trim();
    const email = el.customerEmail.value.trim();
    const address = el.customerAddress.value.trim();
    const city = el.customerCity.value.trim();
    const stateVal = el.customerState.value.trim();
    const pincode = el.customerPincode.value.trim();

    if (!name) return showCustomerError("Enter your full name.");
    if (!isValidPhoneClient(number)) return showCustomerError("Enter a valid phone number.");
    if (!isValidEmailClient(email)) return showCustomerError("Enter a valid email address.");
    if (!address) return showCustomerError("Enter your address.");
    if (!city) return showCustomerError("Enter your city.");
    if (!stateVal) return showCustomerError("Enter your state.");
    if (!isValidPincodeClient(pincode)) return showCustomerError("Enter a valid pincode.");
    if (!el.consentCheckbox.checked) {
      return showCustomerError("Please check the box to consent to HP's collection and use of your information.");
    }

    state.customerName = name;
    state.customerNumber = number;
    state.customerEmail = email;
    state.customerAddress = address;
    state.customerCity = city;
    state.customerState = stateVal;
    state.customerPincode = pincode;

    el.submitOrderBtn.disabled = true;
    el.submitOrderBtn.textContent = "Submitting...";

    try {
      const previewPng = await renderFinalCanvas();
      const result = await api("/api/submit", {
        method: "POST",
        body: JSON.stringify({
          skuId: state.sku.id,
          designId: state.design.id,
          initials: state.initials,
          previewPng,
          customerName: name,
          customerNumber: number,
          customerEmail: email,
          customerAddress: address,
          customerCity: city,
          customerState: stateVal,
          customerPincode: pincode,
          consent: true
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

  function capitalizeFirst(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function showConfirmScreen(referenceId, success, statusMessage) {
    el.confirmIcon.textContent = success ? "✓" : "!";
    el.confirmIcon.classList.toggle("error", !success);
    el.confirmHeadline.textContent = success ? "You're all set." : "Order recorded.";
    el.referenceId.textContent = referenceId;
    el.sumDesign.textContent = state.design.name;
    el.sumSku.textContent = `${state.sku.modelName} (${state.sku.familyName}) — ${state.sku.widthMm} mm × ${state.sku.heightMm} mm`;
    el.sumInitialsLabel.textContent = capitalizeFirst(state.design.zone.fieldLabel || "Text");
    el.sumInitials.textContent = state.initials;
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
        await Promise.all([loadSkus(), loadDesigns()]);
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
