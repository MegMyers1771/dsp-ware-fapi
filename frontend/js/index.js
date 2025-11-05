import { fetchTabs, createTab, updateTab, deleteTab, API_URL } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  renderTabs();

  // обработчики кнопок и форм
  document.getElementById("addFieldBtn").addEventListener("click", () => addFieldRow(document.getElementById("fieldsContainer")));
  document.getElementById("editAddFieldBtn").addEventListener("click", () => addFieldRow(document.getElementById("editFieldsContainer")));
  document.getElementById("createTabForm").addEventListener("submit", handleCreateTab);
  document.getElementById("editTabForm").addEventListener("submit", handleEditTab);
});


// ---------- Отображение вкладок ----------
async function renderTabs() {
  const tabs = await fetchTabs();

  new Tabulator("#tabs-table", {
    data: tabs,
    layout: "fitColumns",
    columns: [
      { title: "ID", field: "id", width: 60 },
      { title: "Name", field: "name" },
      { title: "Boxes", field: "box_count", hozAlign: "center" },
      {
        title: "Open",
        formatter: () => `<button class="btn btn-sm btn-outline-primary">Open</button>`,
        cellClick: (e, cell) => {
          const tab = cell.getRow().getData();
          window.location.href = `/static/tab.html?tab_id=${tab.id}`;
        },
      },
      {
        title: "Delete",
        formatter: () => `<button class="btn btn-sm btn-outline-danger">🗑</button>`,
        cellClick: async (e, cell) => {
          const tab = cell.getRow().getData();
          if (confirm(`Удалить вкладку "${tab.name}"?`)) {
            await deleteTab(tab.id);
            renderTabs();
          }
        },
      },
    ],
  });
}


// ---------- Создание вкладки ----------
async function handleCreateTab(e) {
  e.preventDefault();
  const name = document.getElementById("tabName").value.trim();
  if (!name) return;

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
  
  for (const field of fields) {
    await fetch(`${API_URL}/tab_fields/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: field.name,
        allowed_values: field.allowed_values, // массив строк
        tab_id: tabId
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

  await updateTab(id, { name, fields });
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
        <button type="button" class="btn btn-sm btn-outline-danger remove-field">✕</button>
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

    const allowed_values = allowedText
      ? allowedText.split(",").map(v => v.trim())
      : [];

    return { name, allowed_values };
  });
}
