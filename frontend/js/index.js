import { fetchTabs, createTab, updateTab, deleteTab, API_URL, getTabFields, getBoxes, getItemsByBox, createTag } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  renderTabs();

  // обработчики кнопок и форм
  document.getElementById("addFieldBtn").addEventListener("click", () => addFieldRow(document.getElementById("fieldsContainer")));
  document.getElementById("editAddFieldBtn").addEventListener("click", () => addFieldRow(document.getElementById("editFieldsContainer")));
  document.getElementById("createTabForm").addEventListener("submit", handleCreateTab);
  document.getElementById("editTabForm").addEventListener("submit", handleEditTab);

  // create tag form (index)
  const createTagForm = document.getElementById("createTagForm");
  if (createTagForm) createTagForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("tagName").value.trim();
    const color = document.getElementById("tagColor").value || null;
    if (!name) return alert("Введите имя тега");

    await createTag({ name, color });
    bootstrap.Modal.getInstance(document.getElementById("createTagModal")).hide();
    document.getElementById("tagName").value = "";
    document.getElementById("tagColor").value = "#0d6efd";
    renderTabs();
  });

  // dropdown quick actions in navbar
  const ddNew = document.getElementById('dropdown-new-tab');
  if (ddNew) ddNew.addEventListener('click', (e) => { e.preventDefault(); new bootstrap.Modal(document.getElementById('createTabModal')).show(); });
  const ddTag = document.getElementById('dropdown-create-tag');
  if (ddTag) ddTag.addEventListener('click', (e) => { e.preventDefault(); new bootstrap.Modal(document.getElementById('createTagModal')).show(); });
});


// ---------- Отображение вкладок ----------
async function renderTabs() {
  const tabs = await fetchTabs();
  // render as a bootstrap table
  let tbody = document.getElementById('tabsTableBody');
  const container = document.getElementById('tabsTableContainer') || document.getElementById('tabs-table');
  if (!tbody && container) {
    container.innerHTML = `
      <table id="tabsTable" class="table table-hover table-striped">
        <thead class="table-dark">
          <tr>
            <th style="width:80px">ID</th>
            <th>Name</th>
            <th style="width:120px" class="text-center">Boxes</th>
            <th style="width:200px" class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody id="tabsTableBody"></tbody>
      </table>
    `;
    tbody = document.getElementById('tabsTableBody');
  }

  if (!tbody) return;
  tbody.innerHTML = '';

  if (!tabs || tabs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Вкладок нет</td></tr>`;
    return;
  }

  const esc = s => (s === null || s === undefined) ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  for (const tab of tabs) {
    // <button class="btn btn-sm btn-outline-secondary edit-tab-btn">Edit</button>
    const tr = document.createElement('tr');
    tr.dataset.tabId = tab.id;
    tr.innerHTML = `
      <td>${esc(tab.id)}</td>
      <td>${esc(tab.name)}</td>
      <td class="text-center">${esc(tab.box_count ?? 0)}</td>
      <td class="text-center">
        <div class="btn-group" role="group">
          
          <button class="btn btn-sm btn-outline-primary open-tab-btn">Open</button>
          <button class="btn btn-sm btn-outline-danger delete-tab-btn">🗑</button>
        </div>
      </td>
    `;

    // handlers
    // tr.querySelector('.edit-tab-btn').addEventListener('click', async (e) => {
    //   e.stopPropagation();
    //   openEditTabModal(tab);
    // });

    tr.querySelector('.open-tab-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `/static/tab.html?tab_id=${tab.id}`;
    });

    tr.querySelector('.delete-tab-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Удалить вкладку "${tab.name}"?`)) {
        await deleteTab(tab.id);
        renderTabs();
      }
    });

    // clicking row opens tab page
    tr.addEventListener('click', () => {
      window.location.href = `/static/tab.html?tab_id=${tab.id}`;
    });

    tbody.appendChild(tr);
  }
}


// ---------- Создание вкладки ----------
async function handleCreateTab(e) {
  e.preventDefault();
  const name = document.getElementById("tabName").value.trim();
  if (!name) return alert("Введите имя вкладки");

  console.log("Создание вкладки:", name);

  // 1. Создаём вкладку
  const tab = await createTab({
    name,
    description: "",
    tag_id: null
  });

  console.log("Вкладка создана:", tab);

  // 2. Получаем её ID
  const tabId = tab.id;

  // 3. Создаём поля
  const fields = collectFields(document.getElementById("fieldsContainer"));

  // validation: ensure allowed_values parse correctly (comma separated tokens)
  for (const f of fields) {
    if (!f.name) return alert("Каждое поле должно иметь имя");
    // allowed_values is array already; ensure tokens are non-empty
    if (f.allowed_values_raw && f.allowed_values.length === 0) return alert("Некорректный формат списка значений: используйте 'val1, val2'");
  }

  for (const field of fields) {
    await fetch(`${API_URL}/tab_fields/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: field.name,
        allowed_values: field.allowed_values, // массив строк
        tab_id: tabId,
        strong: !!field.strong,
      }),
    });
  }

  // 4. Очистка и перерисовка
  document.getElementById("tabName").value = "";
  document.getElementById("fieldsContainer").innerHTML = "";
  bootstrap.Modal.getInstance(document.getElementById("createTabModal")).hide();
  renderTabs();
}


// ---------- Редактирование вкладки ----------
async function handleEditTab(e) {
  e.preventDefault();
  const id = document.getElementById("editTabId").value;
  const name = document.getElementById("editTabName").value.trim();
  const fields = collectFields(document.getElementById("editFieldsContainer"));

  // Validate fields: if any field input is marked locked (disabled), keep original values
  const finalFields = fields.map(f => ({ name: f.name, allowed_values: f.allowed_values, strong: !!f.strong }));

  await updateTab(id, { name, fields: finalFields });
  bootstrap.Modal.getInstance(document.getElementById("editTabModal")).hide();
  renderTabs();
}


// ---------- Добавление поля ----------
function addFieldRow(container, field = {}) {
  const div = document.createElement("div");
  div.classList.add("field-entry");
  div.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-5">
        <input class="form-control field-name" placeholder="Field name" value="${field.name || ""}">
      </div>
      <div class="col-md-5">
        <input class="form-control field-allowed" placeholder="Allowed values (через запятую)" 
          value="${field.allowed_values ? field.allowed_values.join(", ") : ""}">
      </div>
      <div class="col-md-2 text-end">
        <div class="d-flex align-items-center justify-content-end gap-2">
          <label class="mb-0 small text-muted"><input type="checkbox" class="form-check-input field-strong" ${field.strong ? 'checked' : ''}> strong</label>
          <button type="button" class="btn btn-sm btn-outline-danger remove-field">✕</button>
        </div>
      </div>
    </div>
  `;
  div.querySelector(".remove-field").addEventListener("click", () => div.remove());
  container.appendChild(div);
}


// ---------- Сбор данных полей ----------
function collectFields(container) {
  return Array.from(container.children).map(div => {
    const name = div.querySelector(".field-name").value.trim();
    const allowedText = div.querySelector(".field-allowed").value.trim();
    const strong = !!div.querySelector(".field-strong").checked;

    const allowed_values = allowedText
      ? allowedText.split(",").map(v => v.trim()).filter(v => v.length > 0)
      : [];

    return { name, allowed_values, allowed_values_raw: allowedText, strong };
  });
}


// ---------- Edit modal helpers ----------
async function openEditTabModal(tab) {
  document.getElementById("editTabId").value = tab.id;
  document.getElementById("editTabName").value = tab.name;
  const container = document.getElementById("editFieldsContainer");
  container.innerHTML = "Загрузка...";

  const fields = await getTabFields(tab.id);

  // determine which fields already have values in any item (lock them)
  const usedMap = await fieldsUsedMap(tab.id, fields.map(f => f.name));

  container.innerHTML = "";
  fields.forEach(f => {
    addFieldRow(container, { name: f.name, allowed_values: f.allowed_values || [], strong: f.strong });
    // if used, mark last added row as locked
    const last = container.lastElementChild;
    if (usedMap[f.name]) {
      last.querySelectorAll('input').forEach(inp => { inp.disabled = true; });
      const badge = document.createElement('div');
      badge.className = 'small text-danger';
      badge.textContent = '⚠️ Есть значения — изменения ограничены';
      last.appendChild(badge);
    }
  });

  new bootstrap.Modal(document.getElementById("editTabModal")).show();
}

async function fieldsUsedMap(tabId, fieldNames) {
  const map = {};
  fieldNames.forEach(n => map[n] = false);

  const boxes = await getBoxes(tabId);
  // if no boxes, nothing is used
  if (!boxes || !Array.isArray(boxes) || boxes.length === 0) return map;

  for (const box of boxes) {
    const items = await getItemsByBox(box.id) || [];
    for (const it of items) {
      const meta = it.metadata_json || {};
      for (const n of fieldNames) {
        if (!map[n] && meta && meta[n]) map[n] = true;
      }
    }
  }

  return map;
}