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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  const uploadForm = document.getElementById("uploadForm");
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("uploadError");
      const summaryEl = document.getElementById("uploadSummary");
      errorEl.hidden = true;
      summaryEl.hidden = true;

      const fileInput = document.getElementById("fileInput");
      if (!fileInput.files || fileInput.files.length === 0) return;

      const formData = new FormData();
      formData.append("file", fileInput.files[0]);

      try {
        const result = await api("/admin/api/upload", { method: "POST", body: formData });
        document.getElementById("statAdded").textContent = result.added;
        document.getElementById("statUpdated").textContent = result.updated;
        document.getElementById("statSkipped").textContent = result.skippedCount;

        const skippedTable = document.getElementById("skippedTable");
        const skippedBody = document.getElementById("skippedBody");
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
        await loadStores();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    });
  }

  loadStores();
})();
