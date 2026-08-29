const state = { products: [], filtered: [], page: 1, pageSize: 25 };
const elements = {
  form: document.querySelector("#importForm"), file: document.querySelector("#spreadsheet"), fileName: document.querySelector("#fileName"), importButton: document.querySelector("#importButton"), result: document.querySelector("#importResult"), rows: document.querySelector("#productRows"), summary: document.querySelector("#catalogSummary"), visible: document.querySelector("#visibleCount"), pagination: document.querySelector("#pagination"), search: document.querySelector("#searchInput"), refresh: document.querySelector("#refreshButton"), empty: document.querySelector("#emptyState"),
};

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value ?? ""; return div.innerHTML; }
function money(value) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "—"; }

async function loadProducts() {
  elements.refresh.disabled = true; elements.refresh.textContent = "Loading…";
  try {
    const products = []; let page = 1; let response;
    do {
      const result = await fetch(`/api/products?page=${page}&limit=500`);
      const data = await result.json();
      if (!result.ok) throw new Error(data.message || "Could not load products.");
      products.push(...data.products); response = data.pagination; page += 1;
    } while (response?.hasNextPage);
    state.products = products; filterProducts();
  } catch (error) {
    elements.summary.textContent = error.message;
  } finally { elements.refresh.disabled = false; elements.refresh.textContent = "Refresh products"; }
}

function filterProducts() {
  const query = elements.search.value.trim().toLowerCase();
  state.filtered = state.products.filter((product) => [product.productName, product.sku, product.designCode, product.groupId, ...(product.models || []).map(({ model }) => model)].join(" ").toLowerCase().includes(query));
  state.page = 1; render();
}

function render() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); state.page = Math.min(state.page, totalPages);
  const products = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  elements.summary.textContent = `${state.products.length.toLocaleString("en-IN")} saved products`;
  elements.visible.textContent = state.filtered.length ? `Showing ${((state.page - 1) * state.pageSize) + 1}–${Math.min(state.page * state.pageSize, state.filtered.length)} of ${state.filtered.length}` : "No matching products";
  if (!products.length) { elements.rows.replaceChildren(elements.empty.content.cloneNode(true)); } else {
    elements.rows.innerHTML = products.map((p) => { const stockClass = p.inventory <= 0 ? "out" : p.inventory <= 20 ? "low" : ""; const model = (p.models || []).map(({ model }) => model).join(", ") || "—"; return `<tr><td>${p.image ? `<img class="thumb" src="${escapeHtml(p.image)}" alt="" onerror="this.remove()">` : "—"}</td><td><span class="product-title">${escapeHtml(p.productName)}</span><span class="muted">${escapeHtml(p.designName || p.category || "")}</span></td><td class="sku">${escapeHtml(p.sku)}</td><td>${escapeHtml(model)}</td><td>${money(p.price)}</td><td>${money(p.mrp)}</td><td class="stock ${stockClass}">${Number(p.inventory || 0).toLocaleString("en-IN")}</td><td>${escapeHtml(p.groupId || "—")}</td><td>${formatDate(p.createdAt)}</td></tr>`; }).join("");
  }
  const buttons = []; for (let i = 1; i <= totalPages; i += 1) { if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) buttons.push(i); }
  elements.pagination.innerHTML = buttons.map((number, index) => `${index && number - buttons[index - 1] > 1 ? "<span>…</span>" : ""}<button type="button" class="${number === state.page ? "active" : ""}" data-page="${number}">${number}</button>`).join("");
}

elements.file.addEventListener("change", () => { elements.fileName.textContent = elements.file.files[0]?.name || "Choose Excel or CSV file"; });
elements.search.addEventListener("input", filterProducts); elements.refresh.addEventListener("click", loadProducts);
elements.pagination.addEventListener("click", (event) => { const page = Number(event.target.dataset.page); if (page) { state.page = page; render(); } });
elements.form.addEventListener("submit", async (event) => { event.preventDefault(); if (!elements.file.files[0]) return; elements.importButton.disabled = true; elements.importButton.textContent = "Importing…"; elements.result.innerHTML = ""; try { const response = await fetch("/api/products/import", { method: "POST", body: new FormData(elements.form) }); const data = await response.json(); const errors = (data.errors || []).slice(0, 5).map((error) => `<li>${escapeHtml(`${error.sheet}, row ${error.row}: ${error.message}`)}</li>`).join(""); elements.result.innerHTML = `<div class="${response.ok || response.status === 207 ? "result-success" : "result-error"}"><strong>${escapeHtml(data.message || "Import finished.")}</strong> ${data.imported ?? 0} created, ${data.updated ?? 0} updated, ${data.unchanged ?? 0} unchanged, ${data.failed ?? 0} failed. ${data.parentProducts ?? 0} parents and ${data.variants ?? 0} variants processed.${errors ? `<ul class="result-errors">${errors}</ul>` : ""}</div>`; if (response.ok || response.status === 207) { elements.form.reset(); elements.fileName.textContent = "Choose Excel or CSV file"; await loadProducts(); } } catch (error) { elements.result.innerHTML = `<p class="result-error">${escapeHtml(error.message || "Import failed.")}</p>`; } finally { elements.importButton.disabled = false; elements.importButton.textContent = "Import file"; } });
loadProducts();
