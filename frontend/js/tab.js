import { getItemsByBox, getBoxes, createBox, getTabFields, addItem, API_URL, searchItems, createTag, fetchTabs, deleteItem } from "./api.js";

document.addEventListener("DOMContentLoaded", async () => {
  const tabId = new URLSearchParams(window.location.search).get("tab_id");
  if (!tabId) return alert("Не указан tab_id");

  // try to fetch tab name and set titles/brand
  let tabName = null;
  try {
    const tabs = await fetchTabs();
    const tab = (tabs || []).find(t => String(t.id) === String(tabId));
    if (tab) tabName = tab.name;
  } catch (err) {
    console.warn('Could not fetch tabs for name:', err);
  }

  const titleText = tabName ? `${tabName}` : `Вкладка #${tabId}`;
  document.getElementById("tabTitle").textContent = titleText;
  const brandEl = document.getElementById('tabNavbarBrand');
  if (brandEl) brandEl.textContent = tabName || `Вкладка #${tabId}`;

  renderBoxes(tabId);

  // dropdown quick actions
  const ddAdd = document.getElementById('dropdown-add-box');
  if (ddAdd) ddAdd.addEventListener('click', (e) => { e.preventDefault(); new bootstrap.Modal(document.getElementById('addBoxModal')).show(); });
  const ddTag = document.getElementById('dropdown-create-tag');
  if (ddTag) ddTag.addEventListener('click', (e) => { e.preventDefault(); new bootstrap.Modal(document.getElementById('createTagModal')).show(); });

  // --- Создание ящика ---
  document.getElementById("addBoxForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("boxName").value.trim();
    const description = document.getElementById("boxDescription").value.trim();
    if (!name) return;

    await createBox(tabId, name, description);
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
        <div class="border p-2 mb-2 bg-light rounded shadow-sm">
          <div><b>${r.name}</b> → <i>${r.box?.name ?? "—"}</i></div>
          ${meta}
          ${r.box ? `<button class="btn btn-sm btn-success mt-2" data-box-id="${r.box.id}" data-item-id="${r.id}">Открыть в ящике</button>` : ""}
        </div>
      `;
    }).join("");

    // навешиваем обработчики на кнопки
    container.querySelectorAll("[data-box-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const boxId = btn.dataset.boxId;
        const itemId = btn.dataset.itemId || null;
        await openBoxModal(boxId, itemId);
      });
    });
  });

  // --- Открыть ящик по строке (имя или id) ---
  const openBoxBtn = document.getElementById("openBoxBtn");
  if (openBoxBtn) {
    openBoxBtn.addEventListener("click", async () => {
      const q = document.getElementById("openBoxInput").value.trim();
      if (!q) return alert('Введите имя или id ящика');

      const boxes = await getBoxes(tabId);
      // try id first
      const byId = boxes.find(b => String(b.id) === q);
      const byName = boxes.find(b => b.name === q) || boxes.find(b => b.name && b.name.toLowerCase().includes(q.toLowerCase()));
      const target = byId || byName;
      if (!target) return alert('Ящик не найден');
      await openBoxModal(target.id);
    });
  }

  // --- Добавление айтема ---
  document.getElementById("addItemForm").addEventListener("submit", handleAddItem);

  // make 'Open Box' button inside add-item modal (if present) open the current box
  const addModalOpenBtn = document.getElementById("addModalOpenBoxBtn");
  if (addModalOpenBtn) {
    addModalOpenBtn.addEventListener('click', async () => {
      const boxId = document.getElementById('itemBoxId').value;
      if (!boxId) return showTopAlert('Не указан ID ящика', 'danger');
      await openBoxModal(boxId);
    });
  }

  // create tag form (tab page)
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
  });
});

async function openBoxModal(boxId, highlightItemId = null) {
  const items = await getItemsByBox(boxId);
  const content = document.getElementById("boxViewContent");

  if (!items.length) {
    content.innerHTML = `<div class="text-muted">Ящик пуст</div>`;
  } else {
    // collect metadata keys across all items to build table columns
    const metaKeys = Array.from(new Set(items.flatMap(i => Object.keys(i.metadata_json || {}))));

    // build table header: ID, Name, ...metaKeys, Actions
    const headers = [
      { key: '__id', label: 'ID', style: 'width:80px' },
      { key: '__name', label: 'Название' },
      ...metaKeys.map(k => ({ key: k, label: k })),
      { key: '__actions', label: 'Действие', style: 'width:140px', class: 'text-center' }
    ];

    const esc = (s) => {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };

    // calculate a sensible min-width so many columns are visible before horizontal scroll
    const approxColWidth = 160; // px per column
    const minWidth = Math.max(600, headers.length * approxColWidth);

    const tableHtml = `
      <div class="table-responsive">
        <table class="table table-hover table-sm small" style="min-width:${minWidth}px;">
          <thead class="table-dark">
            <tr>
              ${headers.map(h => `<th ${h.style ? `style="${h.style}"` : ''} ${h.class ? `class="${h.class} text-nowrap"` : `class=\"text-nowrap\"`}>${esc(h.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${items.map(i => {
              const rowCells = [];
              rowCells.push(`<td class="align-middle">${esc(i.id)}</td>`);
              rowCells.push(`<td class="align-middle">${esc(i.name)}</td>`);
              metaKeys.forEach(k => rowCells.push(`<td class="align-middle">${esc((i.metadata_json || {})[k])}</td>`));
              rowCells.push(`<td class="text-center align-middle"><button class="btn btn-sm btn-danger issue-item-btn" data-item-id="${i.id}">Выдать</button></td>`);
              return `<tr data-item-id="${i.id}">${rowCells.join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    content.innerHTML = tableHtml;

    // if highlightItemId provided, highlight the corresponding row
    if (highlightItemId) {
      setTimeout(() => {
        const row = content.querySelector(`tr[data-item-id='${highlightItemId}']`);
        if (row) {
          row.classList.add('table-success');
          // optional extra contrast
          row.classList.add('text-white');
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 30);
    }

    // attach handlers for issue (delete) buttons
    content.querySelectorAll('.issue-item-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        if (!confirm('Вы точно хотите выдать этот айтем?')) return;
        try {
          const res = await deleteItem(itemId);
          if (!res.ok) {
            const txt = await res.text();
            console.error('Delete failed:', txt);
            showTopAlert('Ошибка при выдаче айтема', 'danger');
            return;
          }
          showTopAlert('Айтем выдан', 'success');
          // refresh the box contents
          await openBoxModal(boxId);
        } catch (err) {
          console.error('Delete error:', err);
          showTopAlert('Ошибка при выдаче айтема', 'danger');
        }
      });
    });
  }

  // show without backdrop so add-item modal can remain open in parallel
  const modalEl = document.getElementById("boxViewModal");
  const modal = new bootstrap.Modal(modalEl, { backdrop: false });

  // remove highlight when modal is hidden to reset state for next open
  if (modalEl) {
    modalEl.addEventListener('hidden.bs.modal', () => {
      // remove table row highlight if present
      const highlightedRow = content.querySelector('.table-success');
      if (highlightedRow) {
        highlightedRow.classList.remove('table-success', 'text-white');
      }
      // also remove any div-based highlight (back-compat)
      const highlighted = content.querySelector('.bg-success');
      if (highlighted) {
        highlighted.classList.remove('bg-success', 'text-white');
        highlighted.classList.add('bg-light');
      }
    }, { once: true });
  }

  modal.show();
}

// ---------- Отображение боксов ----------
async function renderBoxes(tabId) {
  const boxes = await getBoxes(tabId);

  // Helper: ensure table body exists (in case HTML changed)
  let tbody = document.getElementById("boxesTableBody");
  const container = document.getElementById("boxesTableContainer") || document.getElementById("boxesTable");
  if (!tbody && container) {
    container.innerHTML = `
      <table id="boxesTable" class="table table-hover table-striped">
        <thead class="table-dark">
          <tr>
            <th style="width:80px">ID</th>
            <th>Название</th>
            <th>Описание</th>
            <th style="width:120px" class="text-center">Товаров</th>
            <th style="width:140px" class="text-center">Действие</th>
          </tr>
        </thead>
        <tbody id="boxesTableBody"></tbody>
      </table>
    `;
    tbody = document.getElementById("boxesTableBody");
  }

  if (!tbody) return; // nothing we can do

  tbody.innerHTML = "";

  if (!boxes || boxes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Ящиков нет</td></tr>`;
    return;
  }

  // render rows
  boxes.forEach(box => {
    const tr = document.createElement('tr');
    tr.dataset.boxId = box.id;

    // escape helper for safety
    const esc = (s) => {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };

    tr.innerHTML = `
      <td>${esc(box.id)}</td>
      <td>${esc(box.name)}</td>
      <td>${esc(box.description)}</td>
      <td class="text-center">${esc(box.items_count ?? 0)}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-success add-item-btn">➕ Add Item</button>
      </td>
    `;

    // row click opens box (unless click was on button)
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.add-item-btn')) return; // handled below
      openBoxModal(box.id);
    });

    // add-item button
    const addBtn = tr.querySelector('.add-item-btn');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddItemModal(box);
      });
    }

    tbody.appendChild(tr);
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
    if (f.strong) {
      input.dataset.strong = "1";
    }

      // datalist, если есть варианты — добавляем только примитивные значения (убираем словари)
      if (Array.isArray(f.allowed_values) && f.allowed_values.length > 0) {
        const datalist = document.createElement("datalist");
        datalist.id = `datalist-${i}`;
        // attach allowed values for validation when strong is set
        const allowedPrimitives = (f.allowed_values || []).filter(v => (typeof v === 'string' || typeof v === 'number'));
        input.dataset.allowed = JSON.stringify(allowedPrimitives || []);
        allowedPrimitives.forEach(val => {
          const option = document.createElement("option");
          option.value = String(val);
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
  const errors = [];

  document.querySelectorAll("#tabFieldsContainer [data-field-name]").forEach(el => {
    const key = el.dataset.fieldName;
    const val = el.value.trim();
    // strong enforcement: if field is strong and input value is not one of allowed, error
    if (el.dataset.strong && el.dataset.allowed) {
      const allowed = JSON.parse(el.dataset.allowed);
      if (val && !allowed.includes(val)) {
        errors.push(`Поле \"${key}\" должно иметь одно из значений: ${allowed.join(', ')}`);
      }
    }
    if (val) metadata_json[key] = val;
  });

  // If both name and metadata are empty -> error
  if (!name && Object.keys(metadata_json).length === 0) {
    return showTopAlert('Заполните имя или хотя бы одно значение атрибутов', 'danger');
  }

  if (errors.length) {
    return showTopAlert(errors.join('; '), 'danger');
  }

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
    showTopAlert("Ошибка при добавлении", "danger");
    return;
  }

  // success — clear inputs but keep modal open
  showTopAlert("Айтем добавлен", "success");
  document.getElementById('itemName').value = '';
  document.querySelectorAll('#tabFieldsContainer [data-field-name]').forEach(el => el.value = '');
  // refresh box/table data in background
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

// More visible alert at the top of the page
function showTopAlert(message, type = 'danger', timeout = 4000) {
  // ensure only one top alert at a time
  const existing = document.getElementById('topAlert');
  if (existing) existing.remove();

  const alert = document.createElement('div');
  alert.id = 'topAlert';
  alert.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x m-3`;
  alert.style.zIndex = 1080;
  alert.role = 'alert';
  alert.innerHTML = `
    <div>${message}</div>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  document.body.appendChild(alert);
  if (timeout) setTimeout(() => alert.remove(), timeout);
}
