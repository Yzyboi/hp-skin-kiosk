(function () {
  "use strict";

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.data = data;
      throw err;
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---------- Login page ----------
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("loginError");
      errorEl.hidden = true;
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;
      try {
        await api("/admin/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        window.location.href = "/admin/dashboard";
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  // ---------- Dashboard page ----------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await api("/admin/api/logout", { method: "POST" });
      window.location.href = "/admin";
    });
  }

  // Wires up a "download template -> upload -> merge -> summary -> reload
  // table" flow shared by Stores and SKUs.
  function setupUpload({ formId, fileInputId, uploadUrl, errorId, summaryId, addedId, updatedId, skippedId, skippedTableId, skippedBodyId, onDone }) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById(errorId);
      const summaryEl = document.getElementById(summaryId);
      errorEl.hidden = true;
      summaryEl.hidden = true;

      const fileInput = document.getElementById(fileInputId);
      if (!fileInput.files || fileInput.files.length === 0) return;

      const formData = new FormData();
      formData.append("file", fileInput.files[0]);

      try {
        const result = await api(uploadUrl, { method: "POST", body: formData });
        document.getElementById(addedId).textContent = result.added;
        document.getElementById(updatedId).textContent = result.updated;
        document.getElementById(skippedId).textContent = result.skippedCount;

        const skippedTable = document.getElementById(skippedTableId);
        const skippedBody = document.getElementById(skippedBodyId);
        skippedBody.innerHTML = "";
        if (result.skipped && result.skipped.length > 0) {
          result.skipped.forEach((s) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${s.row}</td><td>${escapeHtml(s.reason)}</td>`;
            skippedBody.appendChild(tr);
          });
          skippedTable.hidden = false;
        } else {
          skippedTable.hidden = true;
        }

        summaryEl.hidden = false;
        fileInput.value = "";
        if (onDone) await onDone();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  // Shared confirm -> DELETE -> reload flow for Stores and SKUs.
  async function deleteRecord(url, confirmMessage, onDone) {
    if (!window.confirm(confirmMessage)) return;
    try {
      await api(url, { method: "DELETE" });
      if (onDone) await onDone();
    } catch (err) {
      window.alert("Delete failed: " + err.message);
    }
  }

  // ---------- Stores ----------
  const storesBody = document.getElementById("storesBody");
  async function loadStores() {
    if (!storesBody) return;
    try {
      const stores = await api("/admin/api/stores");
      storesBody.innerHTML = "";
      if (stores.length === 0) {
        storesBody.innerHTML = '<tr><td colspan="7" class="muted">No stores yet.</td></tr>';
        return;
      }
      stores.forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(s.storeId)}</td>
          <td>${escapeHtml(s.storeName)}</td>
          <td>${escapeHtml(s.region || "")}</td>
          <td>${escapeHtml(s.printProviderName)}</td>
          <td>${escapeHtml((s.printProviderEmails || []).join(", "))}</td>
          <td>${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}</td>
          <td><button type="button" class="btn-delete" data-id="${escapeHtml(s.storeId)}">Delete</button></td>
        `;
        storesBody.appendChild(tr);
      });
    } catch (err) {
      storesBody.innerHTML = `<tr><td colspan="7" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  if (storesBody) {
    storesBody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-delete");
      if (!btn) return;
      const storeId = btn.dataset.id;
      deleteRecord(
        `/admin/api/stores/${encodeURIComponent(storeId)}`,
        `Delete store "${storeId}"? This cannot be undone.`,
        loadStores
      );
    });
  }

  setupUpload({
    formId: "storeUploadForm",
    fileInputId: "storeFileInput",
    uploadUrl: "/admin/api/stores/upload",
    errorId: "storeUploadError",
    summaryId: "storeUploadSummary",
    addedId: "storeStatAdded",
    updatedId: "storeStatUpdated",
    skippedId: "storeStatSkipped",
    skippedTableId: "storeSkippedTable",
    skippedBodyId: "storeSkippedBody",
    onDone: loadStores
  });

  // ---------- SKUs ----------
  const skusBody = document.getElementById("skusBody");
  async function loadSkus() {
    if (!skusBody) return;
    try {
      const skus = await api("/admin/api/skus");
      skusBody.innerHTML = "";
      if (skus.length === 0) {
        skusBody.innerHTML = '<tr><td colspan="13" class="muted">No SKUs yet.</td></tr>';
        return;
      }
      skus.forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(s.skuId)}</td>
          <td>${escapeHtml(s.modelName || "")}</td>
          <td>${escapeHtml(s.familyName || "")}</td>
          <td>${escapeHtml(s.formFactor || "")}</td>
          <td>${escapeHtml(s.widthMm)}</td>
          <td>${escapeHtml(s.heightMm)}</td>
          <td>${s.thicknessMm !== undefined && s.thicknessMm !== null ? escapeHtml(s.thicknessMm) : ""}</td>
          <td>${yesNoLabel(s.hingesAtBack)}</td>
          <td>${yesNoLabel(s.premiumLogoAtBack)}</td>
          <td>${s.weightKg !== undefined && s.weightKg !== null ? escapeHtml(s.weightKg) : ""}</td>
          <td>${escapeHtml(s.verificationSource || "")}</td>
          <td>${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}</td>
          <td><button type="button" class="btn-delete" data-id="${escapeHtml(s.skuId)}">Delete</button></td>
        `;
        skusBody.appendChild(tr);
      });
    } catch (err) {
      skusBody.innerHTML = `<tr><td colspan="13" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function yesNoLabel(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    return "";
  }

  if (skusBody) {
    skusBody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-delete");
      if (!btn) return;
      const skuId = btn.dataset.id;
      deleteRecord(
        `/admin/api/skus/${encodeURIComponent(skuId)}`,
        `Delete SKU "${skuId}"? This cannot be undone.`,
        loadSkus
      );
    });
  }

  setupUpload({
    formId: "skuUploadForm",
    fileInputId: "skuFileInput",
    uploadUrl: "/admin/api/skus/upload",
    errorId: "skuUploadError",
    summaryId: "skuUploadSummary",
    addedId: "skuStatAdded",
    updatedId: "skuStatUpdated",
    skippedId: "skuStatSkipped",
    skippedTableId: "skuSkippedTable",
    skippedBodyId: "skuSkippedBody",
    onDone: loadSkus
  });

  // ---------- Designs ----------
  const designsBody = document.getElementById("designsBody");
  const designForm = document.getElementById("designForm");

  function zoneSummary(z) {
    return `${z.xPct}, ${z.yPct}, ${z.widthPct}x${z.heightPct} (${z.align}, ${z.color})`;
  }

  function fieldSummary(z) {
    const label = z.fieldLabel || "";
    const cap = z.maxLength > 0 ? `max ${z.maxLength}` : "no limit";
    return `${label} (${cap})`;
  }

  async function loadDesigns() {
    if (!designsBody) return;
    try {
      const designs = await api("/admin/api/designs");
      designsBody.innerHTML = "";
      if (designs.length === 0) {
        designsBody.innerHTML = '<tr><td colspan="8" class="muted">No designs yet.</td></tr>';
        return;
      }
      designs.forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><img class="design-thumb" src="${escapeHtml(d.assetPath)}" alt="${escapeHtml(d.name)}" /></td>
          <td>${escapeHtml(d.id)}</td>
          <td>${escapeHtml(d.name)}</td>
          <td>${escapeHtml(zoneSummary(d.zone))}</td>
          <td>${escapeHtml(fieldSummary(d.zone))}</td>
          <td>${escapeHtml(d.zone.fontFamily || "")}</td>
          <td>${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ""}</td>
          <td>
            <button type="button" class="link-btn btn-edit-design" data-id="${escapeHtml(d.id)}">Edit</button>
            &nbsp;
            <button type="button" class="btn-delete" data-id="${escapeHtml(d.id)}">Delete</button>
          </td>
        `;
        designsBody.appendChild(tr);
      });
    } catch (err) {
      designsBody.innerHTML = `<tr><td colspan="8" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function resetDesignForm() {
    designForm.reset();
    document.getElementById("designEditId").value = "";
    document.getElementById("zoneColor").value = "#0B4FD1";
    document.getElementById("designFormTitle").textContent = "Add a design";
    document.getElementById("designSubmitBtn").textContent = "Add Design";
    document.getElementById("designCancelEditBtn").hidden = true;
    document.getElementById("designFile").required = true;
    document.getElementById("designFileHint").textContent = "";
  }

  if (designsBody) {
    designsBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".btn-edit-design");
      if (editBtn) {
        loadDesignIntoForm(editBtn.dataset.id);
        return;
      }
      const delBtn = e.target.closest(".btn-delete");
      if (delBtn) {
        const designId = delBtn.dataset.id;
        deleteRecord(
          `/admin/api/designs/${encodeURIComponent(designId)}`,
          `Delete design "${designId}"? This cannot be undone.`,
          loadDesigns
        );
      }
    });
  }

  async function loadDesignIntoForm(designId) {
    try {
      const designs = await api("/admin/api/designs");
      const d = designs.find((x) => x.id === designId);
      if (!d) return;
      document.getElementById("designEditId").value = d.id;
      document.getElementById("designName").value = d.name;
      document.getElementById("designFile").required = false;
      document.getElementById("designFileHint").textContent = "Leave blank to keep the current artwork.";
      document.getElementById("zoneXPct").value = d.zone.xPct;
      document.getElementById("zoneYPct").value = d.zone.yPct;
      document.getElementById("zoneWidthPct").value = d.zone.widthPct;
      document.getElementById("zoneHeightPct").value = d.zone.heightPct;
      document.getElementById("zoneAlign").value = d.zone.align;
      document.getElementById("zoneColor").value = d.zone.color || "#0B4FD1";
      document.getElementById("zoneFontFamily").value = d.zone.fontFamily || "";
      document.getElementById("zoneFieldLabel").value = d.zone.fieldLabel || "";
      document.getElementById("zoneMaxLength").value = d.zone.maxLength || "";
      document.getElementById("designFormTitle").textContent = `Edit "${d.name}"`;
      document.getElementById("designSubmitBtn").textContent = "Update Design";
      document.getElementById("designCancelEditBtn").hidden = false;
      designForm.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      window.alert("Could not load design: " + err.message);
    }
  }

  const designCancelEditBtn = document.getElementById("designCancelEditBtn");
  if (designCancelEditBtn) {
    designCancelEditBtn.addEventListener("click", resetDesignForm);
  }

  if (designForm) {
    designForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("designFormError");
      errorEl.hidden = true;

      const editId = document.getElementById("designEditId").value;
      const formData = new FormData();
      formData.append("name", document.getElementById("designName").value);
      formData.append("zoneXPct", document.getElementById("zoneXPct").value);
      formData.append("zoneYPct", document.getElementById("zoneYPct").value);
      formData.append("zoneWidthPct", document.getElementById("zoneWidthPct").value);
      formData.append("zoneHeightPct", document.getElementById("zoneHeightPct").value);
      formData.append("zoneAlign", document.getElementById("zoneAlign").value);
      formData.append("zoneColor", document.getElementById("zoneColor").value);
      formData.append("zoneFontFamily", document.getElementById("zoneFontFamily").value);
      formData.append("zoneFieldLabel", document.getElementById("zoneFieldLabel").value);
      formData.append("zoneMaxLength", document.getElementById("zoneMaxLength").value);
      const fileInput = document.getElementById("designFile");
      if (fileInput.files && fileInput.files.length > 0) {
        formData.append("file", fileInput.files[0]);
      }

      try {
        if (editId) {
          await api(`/admin/api/designs/${encodeURIComponent(editId)}`, { method: "PUT", body: formData });
        } else {
          await api("/admin/api/designs", { method: "POST", body: formData });
        }
        resetDesignForm();
        await loadDesigns();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  // ---------- Orders ----------
  const ordersBody = document.getElementById("ordersBody");
  async function loadOrders() {
    if (!ordersBody) return;
    try {
      const orders = await api("/admin/api/orders");
      ordersBody.innerHTML = "";
      if (orders.length === 0) {
        ordersBody.innerHTML = '<tr><td colspan="15" class="muted">No orders yet.</td></tr>';
        return;
      }
      orders.forEach((o) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(o.referenceId)}</td>
          <td>${o.timestamp ? new Date(o.timestamp).toLocaleString() : ""}</td>
          <td>${escapeHtml(o.storeName || "")}</td>
          <td>${escapeHtml(o.skuFamily || "")}</td>
          <td>${escapeHtml(o.designName || "")}</td>
          <td>${escapeHtml(o.initials || "")}</td>
          <td>${escapeHtml(o.customerName || "")}</td>
          <td>${escapeHtml(o.customerNumber || "")}</td>
          <td>${escapeHtml(o.customerEmail || "")}</td>
          <td>${escapeHtml(o.customerAddress || "")}</td>
          <td>${escapeHtml(o.customerCity || "")}</td>
          <td>${escapeHtml(o.customerState || "")}</td>
          <td>${escapeHtml(o.customerPincode || "")}</td>
          <td>${o.consentGiven ? "Yes" : "No"}</td>
          <td>${escapeHtml(o.emailStatus || "")}</td>
        `;
        ordersBody.appendChild(tr);
      });
    } catch (err) {
      ordersBody.innerHTML = `<tr><td colspan="15" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  const exportOrdersBtn = document.getElementById("exportOrdersBtn");
  if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener("click", () => {
      const errorEl = document.getElementById("ordersExportError");
      errorEl.hidden = true;
      const from = document.getElementById("ordersFrom").value;
      const to = document.getElementById("ordersTo").value;
      if (!from || !to) {
        errorEl.textContent = "Pick both a 'from' and 'to' date.";
        errorEl.hidden = false;
        return;
      }
      if (from > to) {
        errorEl.textContent = "'From' date must be on or before 'to' date.";
        errorEl.hidden = false;
        return;
      }
      window.location.href = `/admin/api/orders/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    });
  }

  loadStores();
  loadSkus();
  loadDesigns();
  loadOrders();
})();
