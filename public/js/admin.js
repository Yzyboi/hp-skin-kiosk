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

  // ---------- Stores ----------
  const storesBody = document.getElementById("storesBody");
  async function loadStores() {
    if (!storesBody) return;
    try {
      const stores = await api("/admin/api/stores");
      storesBody.innerHTML = "";
      if (stores.length === 0) {
        storesBody.innerHTML = '<tr><td colspan="6" class="muted">No stores yet.</td></tr>';
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
        `;
        storesBody.appendChild(tr);
      });
    } catch (err) {
      storesBody.innerHTML = `<tr><td colspan="6" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
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
        skusBody.innerHTML = '<tr><td colspan="6" class="muted">No SKUs yet.</td></tr>';
        return;
      }
      skus.forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(s.skuId)}</td>
          <td>${escapeHtml(s.familyName)}</td>
          <td>${escapeHtml(s.widthMm)}</td>
          <td>${escapeHtml(s.heightMm)}</td>
          <td>${s.cornerRadiusMm !== undefined && s.cornerRadiusMm !== null ? escapeHtml(s.cornerRadiusMm) : ""}</td>
          <td>${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}</td>
        `;
        skusBody.appendChild(tr);
      });
    } catch (err) {
      skusBody.innerHTML = `<tr><td colspan="6" class="error-text">${escapeHtml(err.message)}</td></tr>`;
    }
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

  // ---------- Orders ----------
  const ordersBody = document.getElementById("ordersBody");
  async function loadOrders() {
    if (!ordersBody) return;
    try {
      const orders = await api("/admin/api/orders");
      ordersBody.innerHTML = "";
      if (orders.length === 0) {
        ordersBody.innerHTML = '<tr><td colspan="14" class="muted">No orders yet.</td></tr>';
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
          <td>${escapeHtml(o.emailStatus || "")}</td>
        `;
        ordersBody.appendChild(tr);
      });
    } catch (err) {
      ordersBody.innerHTML = `<tr><td colspan="14" class="error-text">${escapeHtml(err.message)}</td></tr>`;
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
  loadOrders();
})();
