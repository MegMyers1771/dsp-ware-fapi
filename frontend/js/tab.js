import { getItemsByBox, 
  getBoxes, 
  createBox, 
  getTabFields, 
  API_URL, 
  searchItems, 
  createTag, 
  fetchTabs, 
  deleteItem, 
  fetchTags, 
  attachTag, 
  detachTag } from "./api.js";

let addItemOffcanvasEl = null;
let addItemOffcanvasInstance = null;
let attachBoxTagModalInstance = null;
let attachBoxTagSelect;
let attachBoxIdInput;
let attachBoxTagSubmitBtn;
let attachItemTagModalInstance = null;
let attachItemTagSelect;
let attachItemIdInput;
let attachItemTagSubmitBtn;
let attachItemTagFormEl;
let attachBoxTagChips;
let attachItemTagChips;
let attachBoxContext = null;
let attachItemContext = null;
let currentTabId = null;
let currentBoxViewBoxId = null;
let boxViewModalDialogEl = null;
let boxViewModalEl = null;
let boxesById = new Map();
let tagCache = [];
let tagsById = new Map();
let tagsLoaded = false;
const FALLBACK_TAG_COLOR = "#6c757d";

document.addEventListener("DOMContentLoaded", async () => {
  const tabId = new URLSearchParams(window.location.search).get("tab_id");
  if (!tabId) return alert("Не указан tab_id");
  currentTabId = Number(tabId);

  boxViewModalDialogEl = document.getElementById("boxViewModalDialog");
  boxViewModalEl = document.getElementById("boxViewModal");
  addItemOffcanvasEl = document.getElementById("addItemOffcanvas");
  if (addItemOffcanvasEl) {
    addItemOffcanvasEl.addEventListener("show.bs.offcanvas", () => toggleBoxModalShift(true));
    addItemOffcanvasEl.addEventListener("hidden.bs.offcanvas", () => toggleBoxModalShift(false));
  }

  attachBoxTagSelect = document.getElementById("attachBoxTagSelect");
  attachBoxIdInput = document.getElementById("attachBoxId");
  attachBoxTagSubmitBtn = document.getElementById("attachBoxTagSubmit");
  attachBoxTagChips = document.getElementById("attachBoxTagChips");
  const attachBoxTagModalEl = document.getElementById("attachBoxTagModal");
  if (attachBoxTagModalEl) {
    attachBoxTagModalInstance = new bootstrap.Modal(attachBoxTagModalEl);
    const attachBoxTagForm = document.getElementById("attachBoxTagForm");
    if (attachBoxTagForm) attachBoxTagForm.addEventListener("submit", handleAttachBoxTagSubmit);
  }
  attachItemTagSelect = document.getElementById("attachItemTagSelect");
  attachItemIdInput = document.getElementById("attachItemId");
  attachItemTagSubmitBtn = document.getElementById("attachItemTagSubmit");
  attachItemTagFormEl = document.getElementById("attachItemTagForm");
  attachItemTagChips = document.getElementById("attachItemTagChips");
  const attachItemTagModalEl = document.getElementById("attachItemTagModal");
  if (attachItemTagModalEl) {
    attachItemTagModalInstance = new bootstrap.Modal(attachItemTagModalEl);
    if (attachItemTagFormEl) attachItemTagFormEl.addEventListener("submit", handleAttachItemTagSubmit);
  }

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

  await refreshTagCache();
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
    await refreshTagCache(true);
    if (currentTabId) renderBoxes(currentTabId);
  });
});

async function openBoxModal(boxId, highlightItemId = null, options = {}) {
  const { refreshOnly = false } = options || {};
  currentBoxViewBoxId = Number(boxId);
  const items = await getItemsByBox(boxId);
  const content = document.getElementById("boxViewContent");
  const normalizedBoxId = Number(boxId);
  const fallbackTabId = (items[0]?.tab_id) ?? currentTabId;
  const targetBox =
    boxesById.get(normalizedBoxId) ||
    {
      id: normalizedBoxId,
      tab_id: fallbackTabId ?? currentTabId,
    };

  if (!items.length) {
    content.innerHTML = `<div class="text-muted">Ящик пуст</div>`;
  } else {
    // collect metadata keys across all items to build table columns
    const metaKeys = Array.from(new Set(items.flatMap(i => Object.keys(i.metadata_json || {}))));

    // build table header: POS, Tags, Name, ...metaKeys, Actions
    const headers = [
      { key: '__pos', label: 'POS', style: 'width:90px' },
      { key: '__tags', label: 'Тэги', style: 'width:140px', class: 'text-center' },
      { key: '__name', label: 'Название' },
      ...metaKeys.map(k => ({ key: k, label: k })),
      { key: '__actions', label: 'Действия', style: 'width:140px', class: 'text-center' }
    ];

    const esc = (s) => {
      if (s === null || s === undefined) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    };

    // calculate a sensible min-width so many columns are visible before horizontal scroll
    const approxColWidth = 160; // px per column
    const minWidth = Math.max(600, headers.length * approxColWidth);

    const totalItems = items.length;

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
              const fromStart = typeof i.box_position === 'number' ? i.box_position : null;
              const fromEnd = typeof i.box_position === 'number' ? (totalItems - i.box_position + 1) : null;
              const posLabel = fromStart !== null && fromEnd !== null ? `${fromStart} (${fromEnd})` : '';
              rowCells.push(`<td class="align-middle">${esc(posLabel)}</td>`);
              rowCells.push(`<td class="align-middle text-center">${renderTagStrips(i.tag_ids)}</td>`);
              rowCells.push(`<td class="align-middle">${esc(i.name)}</td>`);
              metaKeys.forEach(k => rowCells.push(`<td class="align-middle">${esc((i.metadata_json || {})[k])}</td>`));
              rowCells.push(`
                <td class="text-center align-middle">
                  <div class="btn-group btn-group-sm item-actions-container">
                    <button class="btn btn-sm btn-outline-secondary item-actions-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false">•••</button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li><button class="dropdown-item item-action-issue" type="button" data-item-id="${i.id}">Выдать</button></li>
                      <li><button class="dropdown-item item-action-attach-tag" type="button" data-item-id="${i.id}">Привязать тэг</button></li>
                    </ul>
                  </div>
                </td>
              `);
              return `<tr data-item-id="${i.id}">${rowCells.join('')}</tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    content.innerHTML = tableHtml;

    const addItemBtn = document.getElementById("boxViewAddItemBtn");
    if (addItemBtn) {
      addItemBtn.onclick = async () => {
        await openAddItemOffcanvas(targetBox);
      };
    }

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

    const itemMap = new Map(items.map(it => [String(it.id), it]));
    content.querySelectorAll('.item-actions-dropdown').forEach(btn => {
      btn.addEventListener('click', (e) => e.stopPropagation());
    });
    content.querySelectorAll('.item-action-issue').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        await issueItem(itemId, boxId);
      });
    });
    content.querySelectorAll('.item-action-attach-tag').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        const item = itemMap.get(String(itemId));
        if (!item) return;
        await openAttachItemTagModal(item);
      });
    });
  }

  if (refreshOnly) return;

  // show without backdrop so add-item modal can remain open in parallel
  const modalEl = document.getElementById("boxViewModal");
  const modal = new bootstrap.Modal(modalEl, { backdrop: false });

  // remove highlight when modal is hidden to reset state for next open
  if (modalEl) {
    modalEl.addEventListener('hidden.bs.modal', () => {
      toggleBoxModalShift(false);
      if (addItemOffcanvasInstance) {
        try {
          addItemOffcanvasInstance.hide();
        } catch (_) {
          // ignore if already hidden
        }
      }
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
  boxesById = new Map((boxes || []).map(box => [Number(box.id), box]));
  await refreshTagCache();

  // Helper: ensure table body exists (in case HTML changed)
  let tbody = document.getElementById("boxesTableBody");
  const container = document.getElementById("boxesTableContainer") || document.getElementById("boxesTable");
  if (!tbody && container) {
    container.innerHTML = `
      <table id="boxesTable" class="table table-hover table-striped">
        <thead class="table-dark">
          <tr>
            <th style="width:80px">ID</th>
            <th style="width:140px" class="text-center">Тэги</th>
            <th>Название</th>
            <th>Описание</th>
            <th style="width:120px" class="text-center">Товаров</th>
            <th style="width:140px" class="text-center">Действия</th>
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
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Ящиков нет</td></tr>`;
    return;
  }

  // render rows
  boxes.forEach(box => {
    const tr = document.createElement('tr');
    tr.dataset.boxId = box.id;

    tr.innerHTML = `
      <td>${escapeHtml(box.id)}</td>
      <td>${renderTagStrips(box.tag_ids)}</td>
      <td>${escapeHtml(box.name)}</td>
      <td>${escapeHtml(box.description)}</td>
      <td class="text-center">${escapeHtml(box.items_count ?? 0)}</td>
      <td class="text-center">
        <div class="btn-group btn-group-sm box-actions-container">
          <button class="btn btn-sm btn-outline-secondary box-actions-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false">•••</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button class="dropdown-item box-action-add-item" type="button">Добавить айтем</button></li>
            <li><button class="dropdown-item box-action-attach-tag" type="button">Привязать тэг</button></li>
          </ul>
        </div>
      </td>
    `;

    // row click opens box (unless click was on button)
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.box-actions-container') || e.target.closest('.dropdown-menu')) return;
      openBoxModal(box.id);
    });

    const dropdownToggle = tr.querySelector('.box-actions-dropdown');
    dropdownToggle?.addEventListener('click', (e) => e.stopPropagation());

    // add-item button
    const addBtn = tr.querySelector('.box-action-add-item');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddItemOffcanvas(box);
      });
    }

    const attachBtn = tr.querySelector('.box-action-attach-tag');
    if (attachBtn) {
      attachBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await openAttachBoxTagModal(box);
      });
    }

    tbody.appendChild(tr);
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getReadableTextColor(hex) {
  if (!hex || typeof hex !== "string") return "#fff";
  let value = hex.trim().replace("#", "");
  if (value.length === 3) {
    value = value.split("").map((ch) => ch + ch).join("");
  }
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((num) => Number.isNaN(num))) return "#fff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#212529" : "#fff";
}

function renderTagStrips(tagIds = []) {
  if (!Array.isArray(tagIds) || !tagIds.length) {
    return `<span class="text-muted small">Нет</span>`;
  }

  const strips = tagIds
    .map(id => {
      const tag = tagsById.get(Number(id));
      if (!tag) return "";
      const color = tag.color || FALLBACK_TAG_COLOR;
      const name = escapeHtml(tag.name || `#${id}`);
      return `<span class="tag-strip" style="background:${color};" title="${name}"></span>`;
    })
    .filter(Boolean);

  return strips.length ? `<div class="tag-strip-list">${strips.join("")}</div>` : `<span class="text-muted small">Нет</span>`;
}

function renderAttachChipList(container, tagIds, emptyText, onRemove) {
  if (!container) return;
  const ids = Array.isArray(tagIds) ? tagIds : [];
  if (!ids.length) {
    container.innerHTML = `<div class="text-muted small">${emptyText}</div>`;
    return;
  }

  const markup = ids
    .map((id) => {
      const tag = tagsById.get(Number(id));
      if (!tag) return "";
      const color = escapeHtml(tag.color || FALLBACK_TAG_COLOR);
      const readable = getReadableTextColor(tag.color || FALLBACK_TAG_COLOR);
      const darkClass = readable === "#212529" ? " dark-text" : "";
      const name = escapeHtml(tag.name || `#${tag.id}`);
      return `
        <div class="tag-pill${darkClass}" style="background:${color}; border-color:${color}; color:${readable};">
          <span class="tag-pill-label">${name}</span>
          <button type="button" class="tag-pill-delete" title="Отвязать тэг" data-remove-tag-id="${tag.id}">&times;</button>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!markup) {
    container.innerHTML = `<div class="text-muted small">${emptyText}</div>`;
    return;
  }

  container.innerHTML = markup;

  container.querySelectorAll("[data-remove-tag-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const tagId = Number(btn.dataset.removeTagId);
      if (!tagId) return;
      btn.disabled = true;
      try {
        await onRemove(tagId);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function refreshTagCache(force = false) {
  if (tagsLoaded && !force) return tagCache;
  try {
    tagCache = await fetchTags();
    tagsById = new Map((tagCache || []).map(tag => [tag.id, tag]));
    tagsLoaded = true;
  } catch (err) {
    console.warn("Не удалось загрузить тэги", err);
  }
  return tagCache;
}

function populateBoxTagSelect(context) {
  if (!attachBoxTagSelect) return;
  attachBoxTagSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Выберите тэг";
  placeholder.disabled = true;
  placeholder.selected = true;
  attachBoxTagSelect.appendChild(placeholder);

  const usedIds = new Set(
    Array.isArray(context?.tag_ids) ? context.tag_ids.map((id) => Number(id)) : []
  );
  const available = (tagCache || []).filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет доступных тэгов";
    attachBoxTagSelect.appendChild(option);
    attachBoxTagSelect.disabled = true;
    attachBoxTagSubmitBtn?.setAttribute("disabled", "disabled");
    return;
  }

  attachBoxTagSelect.disabled = false;
  attachBoxTagSubmitBtn?.removeAttribute("disabled");
  available.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag.id;
    option.textContent = tag.name;
    attachBoxTagSelect.appendChild(option);
  });
  attachBoxTagSelect.value = available[0].id;
}

async function openAttachBoxTagModal(box) {
  await refreshTagCache();
  if (!tagCache || !tagCache.length) {
    showTopAlert("Нет доступных тэгов — создайте тэг перед привязкой", "warning");
    return;
  }
  attachBoxContext = {
    id: box.id,
    name: box.name,
    tag_ids: Array.isArray(box.tag_ids) ? box.tag_ids.map((id) => Number(id)) : [],
  };
  populateBoxTagSelect(attachBoxContext);
  renderAttachBoxTagChips();
  if (attachBoxIdInput) attachBoxIdInput.value = box.id;
  const modalTitle = document.querySelector("#attachBoxTagModal .modal-title");
  if (modalTitle) modalTitle.textContent = `Привязать тэг к "${box.name || box.id}"`;
  attachBoxTagModalInstance?.show();
}

async function handleAttachBoxTagSubmit(e) {
  e.preventDefault();
  const tagId = Number(attachBoxTagSelect?.value);
  const boxId = Number(attachBoxIdInput?.value);
  if (!tagId || !boxId) {
    return showTopAlert("Выберите тэг и ящик", "warning");
  }

  attachBoxTagSubmitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { box_id: boxId });
    showTopAlert("Тэг привязан к ящику", "success");
    if (attachBoxContext && boxId === attachBoxContext.id) {
      if (!attachBoxContext.tag_ids.includes(tagId)) {
        attachBoxContext.tag_ids.push(tagId);
      }
      renderAttachBoxTagChips();
      populateBoxTagSelect(attachBoxContext);
    }
    await refreshTagCache(true);
    if (currentTabId) await renderBoxes(currentTabId);
    if (currentBoxViewBoxId === boxId) {
      await openBoxModal(boxId);
    }
  } catch (err) {
    console.error("Attach tag error:", err);
    const message = err?.message || "Не удалось привязать тэг";
    showTopAlert(message, "danger");
  } finally {
    attachBoxTagSubmitBtn?.removeAttribute("disabled");
  }
}

function renderAttachBoxTagChips() {
  renderAttachChipList(
    attachBoxTagChips,
    attachBoxContext?.tag_ids || [],
    "Нет привязанных тэгов",
    detachTagFromBox
  );
}

function populateItemTagSelect(context) {
  if (!attachItemTagSelect) return;
  attachItemTagSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Выберите тэг";
  placeholder.disabled = true;
  placeholder.selected = true;
  attachItemTagSelect.appendChild(placeholder);

  const usedIds = new Set(
    Array.isArray(context?.tag_ids) ? context.tag_ids.map((id) => Number(id)) : []
  );
  const available = (tagCache || []).filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет доступных тэгов";
    attachItemTagSelect.appendChild(option);
    attachItemTagSelect.disabled = true;
    attachItemTagSubmitBtn?.setAttribute("disabled", "disabled");
    return;
  }

  attachItemTagSelect.disabled = false;
  attachItemTagSubmitBtn?.removeAttribute("disabled");
  available.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag.id;
    option.textContent = tag.name;
    attachItemTagSelect.appendChild(option);
  });
  attachItemTagSelect.value = available[0].id;
}

async function openAttachItemTagModal(item) {
  await refreshTagCache();
  if (!tagCache || !tagCache.length) {
    showTopAlert("Нет доступных тэгов — создайте тэг перед привязкой", "warning");
    return;
  }
  attachItemContext = {
    id: item.id,
    name: item.name,
    box_id: item.box_id,
    tag_ids: Array.isArray(item.tag_ids) ? item.tag_ids.map((id) => Number(id)) : [],
  };
  populateItemTagSelect(attachItemContext);
  renderAttachItemTagChips();
  if (attachItemIdInput) attachItemIdInput.value = item.id;
  if (attachItemTagFormEl) attachItemTagFormEl.dataset.boxId = item.box_id || "";
  const modalTitle = document.querySelector("#attachItemTagModal .modal-title");
  if (modalTitle) modalTitle.textContent = `Привязать тэг к "${item.name || item.id}"`;
  attachItemTagModalInstance?.show();
}

async function handleAttachItemTagSubmit(e) {
  e.preventDefault();
  const tagId = Number(attachItemTagSelect?.value);
  const itemId = Number(attachItemIdInput?.value);
  if (!tagId || !itemId) {
    return showTopAlert("Выберите тэг и айтем", "warning");
  }

  attachItemTagSubmitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { item_id: itemId });
    showTopAlert("Тэг привязан к айтему", "success");
    if (attachItemContext && itemId === attachItemContext.id) {
      if (!attachItemContext.tag_ids.includes(tagId)) {
        attachItemContext.tag_ids.push(tagId);
      }
      renderAttachItemTagChips();
      populateItemTagSelect(attachItemContext);
    }
    await refreshTagCache(true);
    const boxId = attachItemTagFormEl?.dataset.boxId || attachItemContext?.box_id || currentBoxViewBoxId;
    if (boxId) {
      await openBoxModal(Number(boxId));
    } else if (currentTabId) {
      await renderBoxes(currentTabId);
    }
    if (attachItemTagFormEl) attachItemTagFormEl.dataset.boxId = "";
  } catch (err) {
    console.error("Attach tag error:", err);
    const message = err?.message || "Не удалось привязать тэг";
    showTopAlert(message, "danger");
  } finally {
    attachItemTagSubmitBtn?.removeAttribute("disabled");
  }
}

function renderAttachItemTagChips() {
  renderAttachChipList(
    attachItemTagChips,
    attachItemContext?.tag_ids || [],
    "Нет привязанных тэгов",
    detachTagFromItem
  );
}

async function detachTagFromBox(tagId) {
  if (!attachBoxContext) return;
  try {
    await detachTag(tagId, { box_id: attachBoxContext.id });
    attachBoxContext.tag_ids = attachBoxContext.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachBoxTagChips();
    populateBoxTagSelect(attachBoxContext);
    await refreshTagCache(true);
    if (currentTabId) await renderBoxes(currentTabId);
    if (currentBoxViewBoxId === attachBoxContext.id) {
      await openBoxModal(attachBoxContext.id);
    }
    showTopAlert("Тэг отвязан от ящика", "success");
  } catch (err) {
    console.error("Detach tag error:", err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

async function detachTagFromItem(tagId) {
  if (!attachItemContext) return;
  try {
    await detachTag(tagId, { item_id: attachItemContext.id });
    attachItemContext.tag_ids = attachItemContext.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachItemTagChips();
    populateItemTagSelect(attachItemContext);
    await refreshTagCache(true);
    const boxId = attachItemContext.box_id || currentBoxViewBoxId;
    if (boxId) {
      await openBoxModal(Number(boxId));
    } else if (currentTabId) {
      await renderBoxes(currentTabId);
    }
    showTopAlert("Тэг отвязан от айтема", "success");
  } catch (err) {
    console.error("Detach tag error:", err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

async function issueItem(itemId, boxId) {
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
    await openBoxModal(Number(boxId));
  } catch (err) {
    console.error('Delete error:', err);
    showTopAlert('Ошибка при выдаче айтема', 'danger');
  }
}

function toggleBoxModalShift(enable) {
  if (!boxViewModalDialogEl) return;
  boxViewModalDialogEl.classList.toggle("shifted", !!enable);
  if (boxViewModalEl) {
    boxViewModalEl.classList.toggle("stacked", !!enable);
  }
}


// ---------- Открытие оффканваса добавления айтема ----------
async function openAddItemOffcanvas(box) {
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

  // Показываем оффканвас
  const offcanvasEl = addItemOffcanvasEl || document.getElementById("addItemOffcanvas");
  if (!offcanvasEl) return console.warn("Отсутствует offcanvas для добавления айтема");
  if (!addItemOffcanvasInstance) {
    addItemOffcanvasInstance = new bootstrap.Offcanvas(offcanvasEl);
  }
  addItemOffcanvasInstance.show();
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
    tag_ids: [],
    tab_id,
    box_id,
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
  const createdItem = await res.json().catch(() => null);

  // success — clear inputs but keep modal open
  showTopAlert("Айтем добавлен", "success");
  document.getElementById('itemName').value = '';
  document.querySelectorAll('#tabFieldsContainer [data-field-name]').forEach(el => el.value = '');
  // refresh box/table data in background
  await renderBoxes(tab_id);
  const boxModalEl = document.getElementById("boxViewModal");
  if (
    boxModalEl?.classList.contains("show") &&
    currentBoxViewBoxId &&
    Number(currentBoxViewBoxId) === Number(box_id)
  ) {
    await openBoxModal(box_id, createdItem?.id || null, { refreshOnly: true });
  }
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
