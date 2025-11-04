const API_URL = "http://127.0.0.1:8000";

// Получить поля вкладки
async function getTabFields(tabId) {
  const res = await fetch(`${API_URL}/tab_fields/${tabId}`);
  return await res.json();
}

// Добавить айтем
async function addItem(tabId, boxId, name, metadata_json) {
  await fetch(`${API_URL}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      tab_id: tabId,
      box_id: boxId,
      slot_id: null,
      metadata_json,
    }),
  });
}

async function getBoxes(tabId) {
  const res = await fetch(`${API_URL}/boxes/${tabId}`);
  if (!res.ok) {
    console.error("Failed to load boxes:", res.status, await res.text());
    return [];
  return await res.json();
}

async function createBox(tabId, name) {
  await fetch(`${API_URL}/boxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tab_id: tabId, name, capacity: 20 }),
  });
}

async function addItem(tabId, boxId, name) {
  await fetch(`${API_URL}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      tab_id: tabId,
      box_id: boxId,
      metadata_json: {},
    }),
  });
}

async function searchItems(tabId, query) {
  const res = await fetch(`${API_URL}/items/search?tab_id=${tabId}&q=${encodeURIComponent(query)}`);
  return await res.json();
}

async function fetchTabs() {
  const res = await fetch(`${API_URL}/tabs`);
  return await res.json();
}

async function deleteTab(id) {
  if (!confirm("Are you sure you want to delete this tab?")) return;
  await fetch(`${API_URL}/tabs/${id}`, { method: "DELETE" });
  renderTabs();
}

async function renderTabs() {
  const tabs = await fetchTabs();

  new Tabulator("#tabs-table", {
  data: tabs,
  layout: "fitColumns",
  responsiveLayout: "collapse",
  columns: [
        { title: "ID", field: "id", width: 60 },
        { title: "Name", field: "name" },
        { title: "Boxes", field: "box_count", hozAlign: "center" },
        {
          title: "Open",
          formatter: () => `<button class="btn btn-sm btn-outline-primary">Open</button>`,
          width: 100,
          hozAlign: "center",
          cellClick: (e, cell) => {
            const tab = cell.getRow().getData();
            window.location.href = `/static/tab.html?tab_id=${tab.id}`;
          },
        }
      ]
    });
}

// -----------------------------
// Create Tab
// -----------------------------
const fieldsContainer = document.getElementById("fieldsContainer");
document.getElementById("addFieldBtn").addEventListener("click", () => addFieldRow(fieldsContainer));

document.getElementById("createTabForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("tabName").value.trim();
  if (!name) return;

  const fields = collectFields(fieldsContainer);
  const body = { name, fields };

  await fetch(`${API_URL}/tabs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  document.getElementById("tabName").value = "";
  fieldsContainer.innerHTML = "";
  bootstrap.Modal.getInstance(document.getElementById("createTabModal")).hide();

  renderTabs();
});

// -----------------------------
// Edit Tab
// -----------------------------
function openEditModal(tab) {
  document.getElementById("editTabId").value = tab.id;
  document.getElementById("editTabName").value = tab.name;

  const container = document.getElementById("editFieldsContainer");
  container.innerHTML = "";
  (tab.fields || []).forEach(f => addFieldRow(container, f));

  bootstrap.Modal.getOrCreateInstance(document.getElementById("editTabModal")).show();
}

document.getElementById("editAddFieldBtn").addEventListener("click", () => {
  addFieldRow(document.getElementById("editFieldsContainer"));
});

document.getElementById("editTabForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("editTabId").value;
  const name = document.getElementById("editTabName").value.trim();
  const fields = collectFields(document.getElementById("editFieldsContainer"));

  await fetch(`${API_URL}/tabs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, fields }),
  });

  bootstrap.Modal.getInstance(document.getElementById("editTabModal")).hide();
  renderTabs();
});

// -----------------------------
// Field helpers
// -----------------------------
function addFieldRow(container, field = {}) {
  const div = document.createElement("div");
  div.classList.add("field-entry");
  div.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-3">
        <input class="form-control field-name" placeholder="Name" value="${field.name || ""}">
      </div>
      <div class="col-md-2">
        <select class="form-select field-type">
          ${["string","int","float","bool"].map(t => `<option ${t===field.field_type?"selected":""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="col-md-2">
        <div class="form-check">
          <input class="form-check-input field-required" type="checkbox" ${field.required ? "checked" : ""}>
          <label class="form-check-label">Required</label>
        </div>
      </div>
      <div class="col-md-3">
        <input class="form-control field-allowed" placeholder="Allowed values (key:value,...)" 
          value="${field.allowed_values ? Object.entries(field.allowed_values).map(([k,v])=>`${k}:${v}`).join(", ") : ""}">
      </div>
      <div class="col-md-2 text-end">
        <button type="button" class="btn btn-sm btn-outline-danger remove-field">✕</button>
      </div>
    </div>
  `;
  div.querySelector(".remove-field").addEventListener("click", () => div.remove());
  container.appendChild(div);
}

function collectFields(container) {
  return Array.from(container.children).map(div => {
    const name = div.querySelector(".field-name").value.trim();
    const field_type = div.querySelector(".field-type").value;
    const required = div.querySelector(".field-required").checked;
    const allowedText = div.querySelector(".field-allowed").value.trim();

    let allowed_values = {};
    if (allowedText) {
      allowedText.split(",").forEach(pair => {
        const [k, v] = pair.split(":").map(s => s.trim());
        if (k && v) allowed_values[k] = v;
      });
    }
    return { name, field_type, required, allowed_values };
  });
}

renderTabs();}
