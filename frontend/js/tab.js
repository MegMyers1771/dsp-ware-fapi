import { getItemsByBox, getBoxes, createBox, getTabFields, addItem, API_URL, searchItems } from "./api.js";

document.addEventListener("DOMContentLoaded", () => {
  const tabId = new URLSearchParams(window.location.search).get("tab_id");
  if (!tabId) return alert("Не указан tab_id");

  document.getElementById("tabTitle").textContent = `📦 Вкладка #${tabId}`;
  renderBoxes(tabId);

  // --- Создание ящика ---
  document.getElementById("addBoxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("boxName").value.trim();
    const capacity = parseInt(document.getElementById("boxCapacity").value);
    if (!name) return;

    await createBox(tabId, name, capacity);
    bootstrap.Modal.getInstance(document.getElementById("addBoxModal")).hide();
    document.getElementById("addBoxForm").reset();
    renderBoxes(tabId);
  });

  // --- Поиск айтемов ---
  document.getElementById("searchBtn").addEventListener("click", async () => {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) return;

    const response = await searchItems(tabId, query);
    const results = response.results || [];
    const container = document.getElementById("searchResults");

    if (!results.length) {
      container.innerHTML = `<div class="text-muted">Совпадений не найдено</div>`;
      return;
    }

    container.innerHTML = results.map(r => {
      const meta = r.metadata
        ? Object.entries(r.metadata)
            .map(([k, v]) => `<div><small><b>${k}</b>: ${v}</small></div>`)
            .join("")
        : "";

      return `
        <div class="border p-2 mb-2 bg-white rounded shadow-sm">
          <div><b>${r.name}</b> → <i>${r.box?.name ?? "—"}</i></div>
          ${meta}
          ${r.box ? `<button class="btn btn-sm btn-outline-primary mt-2" data-box-id="${r.box.id}">Открыть в ящике</button>` : ""}
        </div>
      `;
    }).join("");

    // навешиваем обработчики на кнопки
    container.querySelectorAll("[data-box-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const boxId = btn.dataset.boxId;
        await openBoxModal(boxId);
      });
    });
  });

  // --- Добавление айтема ---
  document.getElementById("addItemForm").addEventListener("submit", handleAddItem);
});

async function openBoxModal(boxId) {
  
  const items = await getItemsByBox(boxId);
  const content = document.getElementById("boxViewContent");

  if (!items.length) {
    content.innerHTML = `<div class="text-muted">Ящик пуст</div>`;
  } else {
    content.innerHTML = items.map(i => {
      const meta = i.metadata_json
        ? Object.entries(i.metadata_json)
            .map(([k, v]) => `<span class="me-2"><small><b>${k}</b>: ${v}</small></span>`)
            .join(" | ") // разделитель между парами
        : "";
      return `
        <div class="border rounded p-2 mb-2 bg-light">
          
          <span class="text-muted">${i.name} | ${meta}</span>
        </div>
      `;
    }).join("");
  }

  new bootstrap.Modal(document.getElementById("boxViewModal")).show();
}

// ---------- Отображение боксов ----------
async function renderBoxes(tabId) {
  const boxes = await getBoxes(tabId);

  const tableContainer = document.getElementById("boxesTable");
  tableContainer.innerHTML = ""; // Очистка перед обновлением

  const table = new Tabulator(tableContainer, {
    data: boxes,
    layout: "fitColumns",
    reactiveData: false,
    columns: [
      { title: "ID", field: "id", width: 60 },
      { title: "Название", field: "name" },
      { title: "Ёмкость", field: "capacity" },
      { title: "Товаров", 
        field: "items_count", 
        hozAlign: "center",
        cellClick: (e, cell) => {
            e.stopPropagation(); // предотвращаем срабатывание rowClick
            const box = cell.getRow().getData();
            openBoxModal(box.id);
          }, },
      {
        title: "Действие",
        hozAlign: "center",
        width: 160,
        formatter: () =>
          `<button class="btn btn-sm btn-outline-success">➕ Add Item</button>`,
        cellClick: (e, cell) => {
          e.stopPropagation(); // предотвращаем срабатывание rowClick
          const box = cell.getRow().getData();
          openAddItemModal(box);
        },
      },
    ],
    rowClick: (e, row) => {
      const box = row.getData();
      openBoxModal(box.id);
    },
  });
}


// ---------- Открытие модалки добавления айтема ----------
async function openAddItemModal(box) {
  // Присваиваем ID бокса и вкладки
  document.getElementById("itemBoxId").value = box.id;
  document.getElementById("itemTabId").value = box.tab_id;
  document.getElementById("itemName").value = "";

  const container = document.getElementById("tabFieldsContainer");
  container.innerHTML = `<div class="text-muted">Загрузка полей...</div>`;

  const fields = await getTabFields(box.tab_id);
  container.innerHTML = "";

  // Если полей нет
  if (!fields || !fields.length) {
    container.innerHTML = "<div class='text-muted'>Нет параметров для этой вкладки</div>";
    return;
  }

  // Для каждого поля создаём input или datalist
  fields.forEach((f, i) => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("mb-3");

    // Название поля
    const label = document.createElement("label");
    label.classList.add("form-label");
    label.textContent = f.name;
    wrapper.appendChild(label);

    // Поле ввода
    const input = document.createElement("input");
    input.classList.add("form-control");
    input.dataset.fieldName = f.name;
    input.placeholder = "Введите значение или выберите из списка";
    input.setAttribute("list", `datalist-${i}`);

    // datalist, если есть варианты
    if (Array.isArray(f.allowed_values) && f.allowed_values.length > 0) {
      const datalist = document.createElement("datalist");
      datalist.id = `datalist-${i}`;

      f.allowed_values.forEach(val => {
        const option = document.createElement("option");
        option.value = val;
        datalist.appendChild(option);
      });

      wrapper.appendChild(datalist);
    }

    wrapper.appendChild(input);
    container.appendChild(wrapper);
  });

  // Показываем модалку
  new bootstrap.Modal(document.getElementById("addItemModal")).show();
}


// ---------- Добавление айтема ----------
async function handleAddItem(e) {
  e.preventDefault();

  const tab_id = parseInt(document.getElementById("itemTabId").value);
  const box_id = parseInt(document.getElementById("itemBoxId").value);
  const name = document.getElementById("itemName").value.trim();
  const metadata_json = {};

  document.querySelectorAll("#tabFieldsContainer [data-field-name]").forEach(el => {
    const key = el.dataset.fieldName;
    const val = el.value.trim();
    if (val) metadata_json[key] = val;
  });

  const itemPayload = {
    name,
    qty: 1,
    position: 1,
    metadata_json,
    tag_id: null,
    tab_id,
    box_id,
    slot_id: null
  };

  console.log("Добавление айтема с данными:", itemPayload);

  const res = await fetch(`${API_URL}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(itemPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Ошибка добавления:", err);
    showToast("Ошибка при добавлении", "danger");
    return;
  }

  showToast("Айтем добавлен", "success");
  bootstrap.Modal.getInstance(document.getElementById("addItemModal")).hide();
  renderBoxes(tab_id);
}


// ---------- Простое уведомление ----------
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-bg-${type} border-0 position-fixed bottom-0 end-0 m-3 show`;
  toast.role = "alert";
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}
