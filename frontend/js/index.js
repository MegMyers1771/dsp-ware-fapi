import {
  fetchTabs,
  createTab,
  updateTab,
  deleteTab,
  API_URL,
  getTabFields,
  getBoxes,
  getItemsByBox,
  createTag,
  fetchTags,
  attachTag,
  detachTag,
  deleteTag as deleteTagApi,
} from "./api.js";

const FALLBACK_TAG_COLOR = "#6c757d";
const escapeHtml = (value) =>
  value === null || value === undefined
    ? ""
    : String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let allowedValueSanitizeRegex;
try {
  allowedValueSanitizeRegex = new RegExp("[^\\p{L}\\d\\-_%!,\\s]", "gu");
} catch {
  allowedValueSanitizeRegex = /[^A-Za-z0-9\-_%!,\s]/g;
}

const tokenizeAllowedValues = (value) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

function getReadableTextColor(hex) {
  if (!hex || typeof hex !== "string") return "#fff";
  let value = hex.trim().replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((num) => Number.isNaN(num))) return "#fff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#212529" : "#fff";
}

let tagCache = [];
let tagsById = new Map();
let tagsLoaded = false;
let latestTabsSnapshot = [];
let attachTagModalInstance = null;
let attachTagSelectEl;
let attachTagTabIdInput;
let attachTagSubmitBtn;
let attachTagChipsEl;
let attachTabContext = null;
let tagOffcanvasInstance = null;
let tagPillsContainer;
let deleteTagModalInstance = null;
let deleteTagNameEl;
let deleteTagBindingsEl;
let deleteTagConfirmBtn;
let pendingDeleteTagId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const attachModalEl = document.getElementById("attachTagModal");
  attachTagSelectEl = document.getElementById("attachTagSelect");
  attachTagTabIdInput = document.getElementById("attachTagTabId");
  attachTagSubmitBtn = document.getElementById("attachTagSubmit");
  attachTagChipsEl = document.getElementById("attachTabTagChips");
  if (attachModalEl) {
    attachTagModalInstance = new bootstrap.Modal(attachModalEl);
    const attachForm = document.getElementById("attachTagForm");
    if (attachForm) attachForm.addEventListener("submit", handleAttachTagSubmit);
  }

  const tagOffcanvasEl = document.getElementById("createTagOffcanvas");
  tagPillsContainer = document.getElementById("tagPillsContainer");
  if (tagOffcanvasEl) {
    tagOffcanvasInstance = new bootstrap.Offcanvas(tagOffcanvasEl);
  }

  const deleteTagModalEl = document.getElementById("deleteTagModal");
  if (deleteTagModalEl) {
    deleteTagModalInstance = new bootstrap.Modal(deleteTagModalEl);
    deleteTagNameEl = document.getElementById("deleteTagName");
    deleteTagBindingsEl = document.getElementById("deleteTagBindings");
    deleteTagConfirmBtn = document.getElementById("confirmDeleteTagBtn");
    deleteTagConfirmBtn?.addEventListener("click", handleDeleteTagConfirm);
  }

  if (tagPillsContainer) {
    tagPillsContainer.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest("[data-action='delete-tag']");
      if (!deleteBtn) return;
      const tagId = Number(deleteBtn.dataset.tagId);
      const tag = tagsById.get(tagId);
      if (tag) {
        openDeleteTagModal(tag);
      }
    });
  }

  await refreshTagCache(true);
  renderExistingTagPills();
  await renderTabs();

  // обработчики кнопок и форм
  document.getElementById("addFieldBtn").addEventListener("click", () =>
    addFieldRow(document.getElementById("fieldsContainer"))
  );
  document.getElementById("editAddFieldBtn").addEventListener("click", () =>
    addFieldRow(document.getElementById("editFieldsContainer"))
  );
  document.getElementById("createTabForm").addEventListener("submit", handleCreateTab);
  document.getElementById("editTabForm").addEventListener("submit", handleEditTab);

  // create tag form (index)
  const createTagForm = document.getElementById("createTagForm");
  if (createTagForm) createTagForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("tagName").value.trim();
    const color = document.getElementById("tagColor").value || null;
    const box_id = null;
    const tab_id = null;
    const item_id = null;

    if (!name) return alert("Введите имя тега");

    await createTag({ name, color, box_id, tab_id, item_id });
    showTopAlert('Тэг ' + name + ' добавлен', "success");
    tagOffcanvasInstance?.hide();
    document.getElementById("tagName").value = "";
    document.getElementById("tagColor").value = "#0d6efd";
    await refreshTagCache(true);
    renderExistingTagPills();
    await renderTabs();
  });

  // dropdown quick actions in navbar
  const ddNew = document.getElementById('dropdown-new-tab');
  if (ddNew) ddNew.addEventListener('click', (e) => { e.preventDefault(); new bootstrap.Modal(document.getElementById('createTabModal')).show(); });
  const ddTag = document.getElementById('dropdown-create-tag');
  if (ddTag)
    ddTag.addEventListener('click', async (e) => {
      e.preventDefault();
      await refreshTagCache();
      renderExistingTagPills();
      tagOffcanvasInstance?.show();
    });
});


// ---------- Отображение вкладок ----------
async function renderTabs() {
  await refreshTagCache();
  const tabs = await fetchTabs();
  latestTabsSnapshot = tabs || [];
  renderExistingTagPills();
  // render as a bootstrap table
  let tbody = document.getElementById('tabsTableBody');
  const container = document.getElementById('tabsTableContainer') || document.getElementById('tabs-table');
  if (!tbody && container) {
    container.innerHTML = `
      <table id="tabsTable" class="table table-hover table-striped">
        <thead class="table-dark">
          <tr>
            <th style="width:80px">ID</th>
            <th style="width:140px">Tags</th>
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
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Вкладок нет</td></tr>`;
    return;
  }

  for (const tab of tabs) {
    // <button class="btn btn-sm btn-outline-secondary edit-tab-btn">Edit</button>
    const tr = document.createElement('tr');
    tr.dataset.tabId = tab.id;
    tr.innerHTML = `
      <td>${escapeHtml(tab.id)}</td>
      <td>${renderTagStrips(tab.tag_ids)}</td>
      <td>${escapeHtml(tab.name)}</td>
      <td class="text-center">${escapeHtml(tab.box_count ?? 0)}</td>
      <td class="text-center">
        <div class="btn-group" role="group">
          
          <div class="btn-group btn-group-sm">
            <button class="btn btn-sm btn-outline-secondary tab-actions-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false">•••</button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><button class="dropdown-item attach-tag-btn" type="button">Привязать тэг</button></li>
              <li><button class="dropdown-item view-fields-btn" type="button" disabled>Просмотреть поля</button></li>
              <li><hr class="dropdown-divider"></li>
              <li><button class="dropdown-item text-danger delete-tab-btn" type="button">Удалить</button></li>
            </ul>
          </div>
        </div>
      </td>
    `;

    // handlers
    // tr.querySelector('.edit-tab-btn').addEventListener('click', async (e) => {
    //   e.stopPropagation();
    //   openEditTabModal(tab);
    // });

    // tr.querySelector('.open-tab-btn').addEventListener('click', (e) => {
    //   e.stopPropagation();
    //   window.location.href = `/static/tab.html?tab_id=${tab.id}`;
    // });

    const dropdownToggle = tr.querySelector('.tab-actions-dropdown');
    if (dropdownToggle) {
      dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    const attachBtn = tr.querySelector('.attach-tag-btn');
    if (attachBtn) {
      attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAttachTagModal(tab);
      });
    }

    tr.querySelector('.delete-tab-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Удалить вкладку "${tab.name}"?`)) {
        await deleteTab(tab.id);
        await renderTabs();
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
    tag_ids: []
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
  await renderTabs();
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
  await renderTabs();
}


// ---------- Добавление поля ----------
function addFieldRow(container, field = {}) {
  const usePills = container?.dataset?.usePills === "1";
  const chipTarget = container?.dataset?.chipTarget || "name";
  const chipOnName = usePills && chipTarget === "name";
  const chipOnAllowed = usePills && chipTarget === "allowed";
  const div = document.createElement("div");
  div.classList.add("field-entry");
  const allowedValue = Array.isArray(field.allowed_values)
    ? field.allowed_values.join(", ")
    : field.allowed_values || "";

  div.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-5">
        <input class="form-control field-name" placeholder="Название" value="${field.name || ""}">
        ${
          chipOnName
            ? `
        <div class="field-name-pill-wrapper d-none mt-2">
          <span class="field-chip">
            <span class="field-chip-label"></span>
            <button type="button" class="field-chip-remove" aria-label="Удалить поле">&times;</button>
          </span>
        </div>`
            : ""
        }
      </div>
      <div class="col-md-5">
        <input class="form-control field-allowed" placeholder="Допустимые значения (через запятую)" 
          value="${allowedValue}">
        ${
          chipOnAllowed
            ? `
        <div class="field-allowed-pill-wrapper d-none mt-2">
          <div class="field-chip-list"></div>
        </div>`
            : ""
        }
      </div>
      <div class="col-md-2 text-end">
        <div class="d-flex align-items-center justify-content-end gap-2">
          <label class="mb-0 small text-muted">
            <input type="checkbox" class="form-check-input field-strong" ${field.strong ? "checked" : ""}> strong
          </label>
          <button type="button" class="btn btn-sm btn-outline-danger remove-field">✕</button>
        </div>
      </div>
    </div>
  `;

  const removeButton = div.querySelector(".remove-field");
  if (removeButton) removeButton.addEventListener("click", () => div.remove());
  container.appendChild(div);

  if (chipOnName) {
    initializeFieldChip(div, ".field-name", ".field-name-pill-wrapper", field.name || "");
  }
  if (chipOnAllowed) {
    initializeFieldChip(div, ".field-allowed", ".field-allowed-pill-wrapper", allowedValue, {
      sanitizeAllowed: true,
      multiValue: true,
    });
  }
}

function initializeFieldChip(row, inputSelector, wrapperSelector, initialValue = "", options = {}) {
  const input = row.querySelector(inputSelector);
  const wrapper = row.querySelector(wrapperSelector);
  if (!input || !wrapper) return;

  const labelEl = wrapper.querySelector(".field-chip-label");
  const chipRemoveBtn = wrapper.querySelector(".field-chip-remove");
  const inlineRemoveBtn = row.querySelector(".remove-field");
  const multiValue = !!options.multiValue;
  const listEl = wrapper.querySelector(".field-chip-list");
  let multiValues = multiValue ? tokenizeAllowedValues(initialValue) : [];

  const toggleInlineRemove = (hidden) => {
    if (!inlineRemoveBtn) return;
    inlineRemoveBtn.classList.toggle("d-none", hidden);
  };

  const showChip = (value) => {
    if (!labelEl) return;
    labelEl.textContent = value;
    wrapper.classList.remove("d-none");
    input.classList.add("d-none");
    toggleInlineRemove(true);
  };

  const hideChip = () => {
    wrapper.classList.add("d-none");
    input.classList.remove("d-none");
    toggleInlineRemove(false);
    input.focus();
    input.select();
  };

  const sanitizeValue = (value) => {
    if (!options.sanitizeAllowed) return value;
    return value.replace(allowedValueSanitizeRegex, "");
  };

  if (options.sanitizeAllowed) {
    input.addEventListener("input", () => {
      const sanitized = sanitizeValue(input.value);
      if (sanitized !== input.value) {
        input.value = sanitized;
      }
    });
  }

  const updateInputValueFromMulti = () => {
    if (!multiValue) return;
    input.value = multiValues.join(", ");
  };

  const renderMultiChips = () => {
    if (!multiValue || !listEl) return;
    listEl.innerHTML = multiValues
      .map(
        (val, idx) => `
        <span class="field-chip" data-index="${idx}">
          <span class="field-chip-label">${escapeHtml(val)}</span>
          <button type="button" class="field-chip-remove" data-index="${idx}" aria-label="Удалить значение">&times;</button>
        </span>`
      )
      .join("");
    wrapper.classList.toggle("d-none", multiValues.length === 0);
    input.classList.toggle("d-none", multiValues.length > 0);
    toggleInlineRemove(multiValues.length > 0);
  };

  const commitName = () => {
    const sanitizedValue = sanitizeValue(input.value);
    input.value = sanitizedValue;
    if (multiValue) {
      const tokens = tokenizeAllowedValues(sanitizedValue);
      if (!tokens.length) {
        multiValues = [];
        wrapper.classList.add("d-none");
        input.classList.remove("d-none");
        toggleInlineRemove(false);
        return;
      }
      multiValues = tokens;
      updateInputValueFromMulti();
      renderMultiChips();
      return;
    }

    const value = sanitizedValue.trim();
    if (!value) {
      wrapper.classList.add("d-none");
      input.classList.remove("d-none");
      toggleInlineRemove(false);
      return;
    }
    input.value = value;
    showChip(value);
  };

  if (initialValue) {
    if (multiValue) {
      multiValues = tokenizeAllowedValues(sanitizeValue(initialValue));
      updateInputValueFromMulti();
      renderMultiChips();
    } else {
      input.value = initialValue;
      commitName();
    }
  } else {
    wrapper.classList.add("d-none");
    input.classList.remove("d-none");
    toggleInlineRemove(false);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement === input) return;
      commitName();
    }, 0);
  });

  wrapper.addEventListener("click", (e) => {
    const removeEl = e.target.closest(".field-chip-remove");
    if (multiValue && removeEl) {
      const idx = Number(removeEl.dataset.index);
      if (!Number.isNaN(idx)) {
        multiValues.splice(idx, 1);
        updateInputValueFromMulti();
        renderMultiChips();
      }
      e.stopPropagation();
      return;
    }
    hideChip();
  });

  if (!multiValue) {
    chipRemoveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      row.remove();
    });
  }
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

async function refreshTagCache(force = false) {
  if (!force && tagsLoaded) return tagCache;
  try {
    tagCache = await fetchTags();
    tagsById = new Map(tagCache.map((tag) => [tag.id, tag]));
    tagsLoaded = true;
  } catch (err) {
    console.error("Не удалось загрузить тэги", err);
    if (!tagCache.length) {
      showTopAlert("Не удалось загрузить тэги. Попробуйте обновить страницу.", "warning", 5000);
    }
    tagsLoaded = false;
  }
  return tagCache;
}

function renderTagStrips(tagIds = []) {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return `<span class="text-muted small">нет</span>`;
  }

  const strips = tagIds
    .map((id) => tagsById.get(id))
    .filter(Boolean)
    .map((tag) => {
      const name = escapeHtml(tag.name);
      const color = escapeHtml(tag.color || FALLBACK_TAG_COLOR);
      return `<span class="tag-strip" title="${name}" style="background:${color};"></span>`;
    });

  if (!strips.length) {
    return `<span class="text-muted small">нет</span>`;
  }

  return `<div class="tag-strip-list">${strips.join("")}</div>`;
}

function renderExistingTagPills() {
  if (!tagPillsContainer) return;
  if (!Array.isArray(tagCache) || !tagCache.length) {
    tagPillsContainer.innerHTML = `<div class="text-muted small">Тэгов пока нет</div>`;
    return;
  }

  tagPillsContainer.innerHTML = tagCache
    .map((tag) => {
      const name = escapeHtml(tag.name);
      const color = escapeHtml(tag.color || FALLBACK_TAG_COLOR);
      const readable = getReadableTextColor(tag.color || FALLBACK_TAG_COLOR);
      const darkClass = readable === "#fff" ? "" : " dark-text";
      return `
        <div class="tag-pill${darkClass}" style="background:${color}; border-color:${color};">
          <span class="tag-pill-label">${name}</span>
          <button type="button" class="tag-pill-delete" title="Удалить тэг" data-action="delete-tag" data-tag-id="${tag.id}">&times;</button>
        </div>
      `;
    })
    .join("");
}

function openAttachTagModal(tab) {
  if (!attachTagModalInstance || !attachTagSelectEl) {
    showTopAlert("Модалка для привязки тега недоступна", "danger");
    return;
  }

  attachTabContext = {
    id: tab.id,
    name: tab.name,
    tag_ids: Array.isArray(tab.tag_ids) ? tab.tag_ids.map((id) => Number(id)) : [],
  };
  attachTagTabIdInput.value = tab.id;
  renderAttachTagChips();
  const hasOptions = populateAttachTagSelect(attachTabContext);
  if (!hasOptions) {
    showTopAlert("Свободных тэгов нет — можно отвязать существующие или создать новый.", "warning");
  }
  attachTagModalInstance.show();
}

function populateAttachTagSelect(tab) {
  if (!attachTagSelectEl) return false;
  const usedIds = new Set(
    Array.isArray(tab.tag_ids) ? tab.tag_ids.map((id) => Number(id)) : []
  );
  const available = (tagCache || []).filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    attachTagSelectEl.innerHTML = `<option value="">Нет доступных тэгов</option>`;
    attachTagSelectEl.disabled = true;
    attachTagSubmitBtn?.setAttribute("disabled", "disabled");
    return false;
  }

  attachTagSelectEl.disabled = false;
  attachTagSelectEl.innerHTML = available
    .map((tag) => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`)
    .join("");
  attachTagSelectEl.value = available[0].id;
  attachTagSubmitBtn?.removeAttribute("disabled");
  return true;
}

function renderAttachTagChips() {
  if (!attachTagChipsEl) return;
  const tagIds = Array.isArray(attachTabContext?.tag_ids)
    ? attachTabContext.tag_ids
    : [];

  if (!tagIds.length) {
    attachTagChipsEl.innerHTML = `<div class="text-muted small">Нет привязанных тэгов</div>`;
    return;
  }

  const markup = tagIds
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
    attachTagChipsEl.innerHTML = `<div class="text-muted small">Нет привязанных тэгов</div>`;
    return;
  }

  attachTagChipsEl.innerHTML = markup;

  attachTagChipsEl.querySelectorAll("[data-remove-tag-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const tagId = Number(btn.dataset.removeTagId);
      if (!tagId) return;
      btn.disabled = true;
      try {
        await detachTagFromTab(tagId);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function detachTagFromTab(tagId) {
  if (!attachTabContext) return;
  try {
    await detachTag(tagId, { tab_id: attachTabContext.id });
    attachTabContext.tag_ids = attachTabContext.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachTagChips();
    populateAttachTagSelect(attachTabContext);
    await refreshTagCache(true);
    await renderTabs();
    showTopAlert("Тэг отвязан от вкладки", "success");
  } catch (err) {
    console.error(err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

async function handleAttachTagSubmit(e) {
  e.preventDefault();
  if (!attachTagSelectEl || !attachTagTabIdInput) return;

  const tagId = Number(attachTagSelectEl.value);
  const tabId = Number(attachTagTabIdInput.value);
  if (!tagId || !tabId) {
    showTopAlert("Выберите тэг для привязки", "warning");
    return;
  }

  attachTagSubmitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { tab_id: tabId });
    showTopAlert("Тэг успешно привязан", "success");
    if (attachTabContext && tabId === attachTabContext.id) {
      if (!attachTabContext.tag_ids.includes(tagId)) {
        attachTabContext.tag_ids.push(tagId);
      }
      renderAttachTagChips();
      populateAttachTagSelect(attachTabContext);
    }
    await refreshTagCache(true);
    await renderTabs();
  } catch (err) {
    console.error(err);
    showTopAlert(err.message || "Не удалось привязать тэг", "danger");
  } finally {
    attachTagSubmitBtn?.removeAttribute("disabled");
  }
}

function openDeleteTagModal(tag) {
  if (!deleteTagModalInstance || !deleteTagBindingsEl || !deleteTagNameEl) return;
  pendingDeleteTagId = tag.id;
  deleteTagNameEl.textContent = tag.name;
  const bindings = describeTagBindings(tag);
  deleteTagBindingsEl.innerHTML = bindings.length
    ? bindings.map((item) => `<li>${item}</li>`).join("")
    : `<li class="text-muted">Тег не привязан ни к чему</li>`;
  deleteTagModalInstance.show();
}

function describeTagBindings(tag) {
  const bindings = [];
  const tabIds = Array.isArray(tag.attached_tabs) ? tag.attached_tabs : [];
  const boxIds = Array.isArray(tag.attached_boxes) ? tag.attached_boxes : [];
  const itemIds = Array.isArray(tag.attached_items) ? tag.attached_items : [];

  tabIds.forEach((tabId) => {
    const tabName = latestTabsSnapshot.find((t) => t.id === tabId)?.name;
    bindings.push(`Вкладка: ${escapeHtml(tabName || `#${tabId}`)}`);
  });
  boxIds.forEach((boxId) => bindings.push(`Бокс ID: ${escapeHtml(boxId)}`));
  itemIds.forEach((itemId) => bindings.push(`Айтем ID: ${escapeHtml(itemId)}`));
  return bindings;
}

async function handleDeleteTagConfirm() {
  if (!pendingDeleteTagId) return;
  deleteTagConfirmBtn?.setAttribute("disabled", "disabled");
  try {
    await deleteTagApi(pendingDeleteTagId);
    showTopAlert("Тэг удалён", "success");
    deleteTagModalInstance?.hide();
    await refreshTagCache(true);
    renderExistingTagPills();
    await renderTabs();
  } catch (err) {
    console.error(err);
    showTopAlert(err.message || "Не удалось удалить тэг", "danger");
  } finally {
    pendingDeleteTagId = null;
    deleteTagConfirmBtn?.removeAttribute("disabled");
  }
}
