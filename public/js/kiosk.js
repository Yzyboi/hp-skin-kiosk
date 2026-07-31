(function () {
  "use strict";

  const PX_PER_MM = 5; // canvas render resolution for the exported PNG

  const state = {
    storeId: null,
    storeName: null,
    skus: [],
    designs: [],
    sku: null,
    design: null,
    designImage: null,
    initials: ""
  };

  const el = {
    storeLabel: document.getElementById("storeLabel"),
    changeStoreBtn: document.getElementById("changeStoreBtn"),
    progressBar: document.getElementById("progressBar"),
    storeList: document.getElementById("storeList"),
    storeError: document.getElementById("storeError"),
    skuGrid: document.getElementById("skuGrid"),
    designGrid: document.getElementById("designGrid"),
    previewCanvas: document.getElementById("previewCanvas"),
    initialsInput: document.getElementById("initialsInput"),
    submitError: document.getElementById("submitError"),
    finalizeBtn: document.getElementById("finalizeBtn"),
    referenceId: document.getElementById("referenceId"),
    startOverBtn: document.getElementById("startOverBtn")
  };

  // ---------- Screen navigation ----------
  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => {
      s.classList.toggle("active", s.dataset.screen === name);
    });
    const showChrome = name !== "store";
    el.progressBar.hidden = name === "store" || name === "confirm";
    el.changeStoreBtn.hidden = !showChrome;
    el.storeLabel.hidden = !showChrome;

    const stepMap = { sku: 1, design: 2, customize: 3 };
    document.querySelectorAll(".progress-step").forEach((stepEl) => {
      const step = Number(stepEl.dataset.step);
      const current = stepMap[name];
      stepEl.classList.toggle("done", current && step < current);
      stepEl.classList.toggle("current", current === step);
    });
  }

  function setStoreHeader() {
    el.storeLabel.textContent = state.storeName || "";
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
    el.storeList.innerHTML = "";
    try {
      const stores = await api("/api/stores");
      if (stores.length === 0) {
        el.storeError.textContent = "No stores are configured yet. Ask an admin to upload the store list.";
        el.storeError.hidden = false;
        return;
      }
      stores.forEach((store) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "store-option";
        btn.textContent = store.storeName;
        btn.addEventListener("click", () => selectStore(store.storeId));
        el.storeList.appendChild(btn);
      });
    } catch (err) {
      el.storeError.textContent = "Couldn't load stores. " + err.message;
      el.storeError.hidden = false;
    }
  }

  async function selectStore(storeId) {
    try {
      const result = await api("/api/session/store", {
        method: "POST",
        body: JSON.stringify({ storeId })
      });
      state.storeId = result.storeId;
      state.storeName = result.storeName;
      setStoreHeader();
      await Promise.all([loadSkus(), loadDesigns()]);
      showScreen("sku");
    } catch (err) {
      el.storeError.textContent = err.message;
      el.storeError.hidden = false;
    }
  }

  el.changeStoreBtn.addEventListener("click", async () => {
    await api("/api/session/reset-store", { method: "POST" });
    state.storeId = null;
    state.storeName = null;
    setStoreHeader();
    await loadStores();
    showScreen("store");
  });

  // ---------- Screen 2: SKU ----------
  async function loadSkus() {
    state.skus = await api("/api/skus");
    el.skuGrid.innerHTML = "";
    state.skus.forEach((sku) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pick-card";
      card.innerHTML = `
        <div class="pick-card-thumb" style="aspect-ratio:${sku.widthMm}/${sku.heightMm}">
          <div style="width:70%;height:70%;border-radius:8px;background:linear-gradient(135deg,#e4e7ec,#f3f5f8);"></div>
        </div>
        <div class="pick-card-title">${sku.familyName}</div>
        <div class="pick-card-sub">${sku.widthMm}mm &times; ${sku.heightMm}mm</div>
      `;
      card.addEventListener("click", () => {
        state.sku = sku;
        document.querySelectorAll("#skuGrid .pick-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        showScreen("design");
      });
      el.skuGrid.appendChild(card);
    });
  }

  document.querySelector('[data-action="back-to-store"]').addEventListener("click", () => showScreen("store"));

  // ---------- Screen 3: Design ----------
  async function loadDesigns() {
    state.designs = await api("/api/designs");
    el.designGrid.innerHTML = "";
    state.designs.forEach((design) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pick-card";
      card.innerHTML = `
        <div class="pick-card-thumb"><img src="${design.assetPath}" alt="${design.name}" /></div>
        <div class="pick-card-title">${design.name}</div>
      `;
      card.addEventListener("click", () => {
        state.design = design;
        document.querySelectorAll("#designGrid .pick-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        enterCustomizeScreen();
      });
      el.designGrid.appendChild(card);
    });
  }

  document.querySelector('[data-action="back-to-sku"]').addEventListener("click", () => showScreen("sku"));
  document.querySelector('[data-action="back-to-design"]').addEventListener("click", () => showScreen("design"));

  // ---------- Screen 4: Customize + live preview ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function enterCustomizeScreen() {
    el.submitError.hidden = true;
    el.initialsInput.value = state.initials || "";
    showScreen("customize");
    try {
      state.designImage = await loadImage(state.design.assetPath);
    } catch (err) {
      state.designImage = null;
    }
    drawPreview();
  }

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

  function drawPreview() {
    const sku = state.sku;
    const design = state.design;
    if (!sku || !design) return;

    const canvas = el.previewCanvas;
    const w = Math.round(sku.widthMm * PX_PER_MM);
    const h = Math.round(sku.heightMm * PX_PER_MM);
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    const radius = (sku.cornerRadiusMm || 0) * PX_PER_MM;
    ctx.save();
    roundRectPath(ctx, 0, 0, w, h, radius);
    ctx.clip();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (state.designImage) {
      drawImageCover(ctx, state.designImage, 0, 0, w, h);
    }

    drawInitials(ctx, w, h, design.zone, state.initials);

    ctx.restore();
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

  function drawInitials(ctx, canvasW, canvasH, zone, initials) {
    if (!initials) return;
    const zx = (zone.xPct / 100) * canvasW;
    const zy = (zone.yPct / 100) * canvasH;
    const zw = (zone.widthPct / 100) * canvasW;
    const zh = (zone.heightPct / 100) * canvasH;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = zh * 0.15;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRectPath(ctx, zx, zy, zw, zh, Math.min(zw, zh) * 0.18);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    const fontSize = Math.max(zh * 0.55, 10);
    ctx.font = `800 ${fontSize}px "Inter", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = "#024AD8";
    ctx.textBaseline = "middle";

    let textX = zx + zw / 2;
    ctx.textAlign = "center";
    if (zone.align === "left") {
      textX = zx + zw * 0.08;
      ctx.textAlign = "left";
    } else if (zone.align === "right") {
      textX = zx + zw * 0.92;
      ctx.textAlign = "right";
    }

    ctx.fillText(initials, textX, zy + zh / 2);
    ctx.restore();
  }

  function sanitizeInitials(raw) {
    return raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3);
  }

  el.initialsInput.addEventListener("input", () => {
    const clean = sanitizeInitials(el.initialsInput.value);
    el.initialsInput.value = clean;
    state.initials = clean;
    drawPreview();
  });

  el.finalizeBtn.addEventListener("click", async () => {
    el.submitError.hidden = true;

    if (!/^[A-Z]{1,3}$/.test(state.initials)) {
      el.submitError.textContent = "Enter 1-3 letters for your initials.";
      el.submitError.hidden = false;
      return;
    }

    el.finalizeBtn.disabled = true;
    el.finalizeBtn.textContent = "Sending...";

    try {
      drawPreview();
      const previewPng = el.previewCanvas.toDataURL("image/png");
      const result = await api("/api/submit", {
        method: "POST",
        body: JSON.stringify({
          skuId: state.sku.id,
          designId: state.design.id,
          initials: state.initials,
          previewPng
        })
      });
      el.referenceId.textContent = result.referenceId;
      showScreen("confirm");
    } catch (err) {
      el.submitError.textContent =
        (err.data && err.data.error) || "Something went wrong sending your order. Please try again.";
      el.submitError.hidden = false;
    } finally {
      el.finalizeBtn.disabled = false;
      el.finalizeBtn.textContent = "Complete my skin";
    }
  });

  // ---------- Screen 5: Confirmation ----------
  el.startOverBtn.addEventListener("click", () => {
    state.sku = null;
    state.design = null;
    state.designImage = null;
    state.initials = "";
    el.initialsInput.value = "";
    document.querySelectorAll(".pick-card").forEach((c) => c.classList.remove("selected"));
    showScreen("sku");
  });

  // ---------- Boot ----------
  (async function init() {
    try {
      const session = await api("/api/session");
      if (session.storeId) {
        state.storeId = session.storeId;
        state.storeName = session.storeName;
        setStoreHeader();
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
