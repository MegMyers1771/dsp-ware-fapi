import { searchItems, getTabFields } from "../../api.js";
import { escapeHtml } from "../../common/dom.js";
import { showTopAlert } from "../../common/alerts.js";

export async function handleSearch(state, query, filters = {}, { openBox }) {
  state.lastSearchQuery = query;
  const response = await searchItems(state.tabId, query, { tag_id: filters?.tag_id });
  const results = response.results || [];
  const container = getSearchResultsContainer(state);
  if (!container) return;

  const filteredResults = filterSearchResults(results, filters);
  if (!filteredResults.length) {
    const baseMessage = results.length ? "Совпадений по выбранным фильтрам не найдено" : "Совпадений не найдено";
    container.innerHTML = `<div class="text-muted">${baseMessage}</div>`;
    return;
  }

  const detailed = Boolean(state.isDescriptionFull);
  container.innerHTML = filteredResults
    .map((item) => buildSearchResultMarkup(item, { detailed }))
    .join("");
  bindSearchResultButtons(container, async (boxId, highlightIds) => {
    await openBox(boxId, highlightIds);
  });
}

export function setupSearchFilters(
  state,
  {
    modalEl = document.getElementById("searchFiltersModal"),
    formEl = document.getElementById("searchFiltersForm"),
    fieldsContainer = document.getElementById("searchFiltersFields"),
    tagSelect = document.getElementById("searchFilterTag"),
    resetBtn = document.getElementById("searchFiltersResetBtn"),
    onFiltersChanged,
  } = {}
) {
  if (!modalEl || !formEl || !fieldsContainer) return null;
  const modal = new bootstrap.Modal(modalEl);
  let cachedFields = null;

  const ensureTags = async () => {
    if (!tagSelect) return;
    if (!state.tagStore.isLoaded()) {
      try {
        await state.tagStore.refresh();
      } catch (err) {
        console.warn("Не удалось загрузить теги для фильтра", err);
      }
    }
    const tags = state.tagStore.getAll() || [];
    tagSelect.innerHTML = `<option value="">Все</option>`;
    tags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = String(tag.id);
      option.textContent = tag.name || `Тэг #${tag.id}`;
      option.style.backgroundColor = tag.color || "";
      tagSelect.appendChild(option);
    });
  };

  const loadFields = async () => {
    if (cachedFields) return cachedFields;
    try {
      cachedFields = await getTabFields(state.tabId);
    } catch (err) {
      console.error("Не удалось загрузить поля вкладки", err);
      showTopAlert(err?.message || "Не удалось загрузить поля вкладки", "danger");
      cachedFields = [];
    }
    return cachedFields;
  };

  const renderFields = (fields) => {
    if (!fields.length) {
      fieldsContainer.innerHTML = `<div class="col-12 text-muted">Для этой вкладки нет полей</div>`;
      return;
    }
    fieldsContainer.innerHTML = fields
      .map((field, index) => {
        const safeName = String(field.name || `field-${index}`);
        const inputId = `search-filter-${index}-${safeName}`.replace(/[^a-zA-Z0-9_-]/g, "");
        const allowedValues = Array.isArray(field.allowed_values) ? field.allowed_values : null;
        const datalistId = allowedValues?.length ? `${inputId}-list` : "";
        const datalist = allowedValues?.length
          ? `<datalist id="${datalistId}">${allowedValues.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist>`
          : "";
        const extraAttrs = datalistId ? `list="${escapeHtml(datalistId)}"` : "";
        return `
          <div class="col-12 col-md-6">
            <label class="form-label" for="${inputId}">${escapeHtml(safeName)}</label>
            <input type="text" class="form-control" id="${inputId}" data-filter-field="${escapeHtml(safeName)}" placeholder="Значение" ${extraAttrs}/>
            ${datalist}
          </div>
        `;
      })
      .join("");
  };

  const applyStoredValues = () => {
    const filters = state.searchFilters || {};
    if (tagSelect) {
      tagSelect.value = filters.tag_id ? String(filters.tag_id) : "";
    }
    fieldsContainer.querySelectorAll("[data-filter-field]").forEach((input) => {
      const key = input.dataset.filterField;
      input.value = filters?.[key] ?? "";
    });
  };

  const collectValues = () => {
    const payload = {};
    if (tagSelect && tagSelect.value) {
      const id = Number(tagSelect.value);
      if (Number.isFinite(id)) {
        payload.tag_id = id;
      }
    }
    fieldsContainer.querySelectorAll("[data-filter-field]").forEach((input) => {
      const name = input.dataset.filterField;
      const value = input.value.trim();
      if (value) {
        payload[name] = value;
      }
    });
    return payload;
  };

  const open = async () => {
    await ensureTags();
    const fields = await loadFields();
    renderFields(fields);
    applyStoredValues();
    modal.show();
  };

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.searchFilters = collectValues();
    modal.hide();
    await onFiltersChanged?.();
  });

  resetBtn?.addEventListener("click", async () => {
    state.searchFilters = {};
    if (tagSelect) {
      tagSelect.value = "";
    }
    fieldsContainer.querySelectorAll("[data-filter-field]").forEach((input) => {
      input.value = "";
    });
    modal.hide();
    await onFiltersChanged?.();
  });

  return {
    open,
  };
}

function normalizeQty(value) {
  return typeof value === "number" && value > 0 ? value : 1;
}

function filterSearchResults(results = [], filters = {}) {
  const tagId = Number(filters.tag_id);
  const activeFilters = Object.entries(filters || {})
    .map(([field, value]) => [field, typeof value === "string" ? value.trim() : value])
    .filter(([field, value]) => field !== "tag_id" && !!value);

  if (!activeFilters.length && !Number.isFinite(tagId)) {
    return results;
  }

  return results.filter((item) => {
    if (Number.isFinite(tagId)) {
      const tagIds = Array.isArray(item.tag_ids) ? item.tag_ids.map((id) => Number(id)) : [];
      if (!tagIds.includes(tagId)) return false;
    }
    const metadata = item.metadata || {};
    return activeFilters.every(([fieldName, expected]) => {
      const actual = metadata[fieldName];
      if (actual === undefined || actual === null) {
        return false;
      }
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    });
  });
}

function buildSearchResultMarkup(item, options = {}) {
  const detailed = Boolean(options.detailed);
  const name = escapeHtml(item.name || "—");
  const boxId = item.box?.id ?? null;
  const boxName = item.box?.name || "—";
  const ids = item.id ? [item.id] : [];
  const qtyValue = normalizeQty(item.qty);
  const countText = qtyValue ? `Кол-во: ${qtyValue}` : "";
  const serialText = Array.isArray(item.serial_number)
    ? escapeHtml(item.serial_number.join(", "))
    : item.serial_number
      ? escapeHtml(String(item.serial_number))
      : "";
  const metaEntries = detailed ? Object.entries(item.metadata || item.metadata_json || {}) : [];
  const metaHtml = detailed
    ? metaEntries.length
      ? metaEntries
          .map(
            ([key, value]) =>
              `<div class="small"><span class="text-muted">${escapeHtml(String(key))}:</span> ${escapeHtml(
                value == null ? "" : String(value)
              )}</div>`
          )
          .join("")
      : `<div class="small text-muted">Доп. поля пусты</div>`
    : "";
  const highlightAttr = ids.length ? ` data-highlight-ids="${ids.join(",")}"` : "";
  const openBtn = boxId
    ? `<button class="btn btn-sm btn-outline-success" data-box-id="${boxId}"${highlightAttr}>${escapeHtml(
        boxName || "—"
      )}</button>`
    : `<span class="text-muted small">Ящик неизвестен</span>`;

  return `
    <div class="d-flex align-items-start justify-content-between gap-3 border p-2 mb-2 bg-dark rounded shadow-sm flex-wrap">
      <div class="d-flex flex-column gap-2">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <span><strong>${name}</strong></span>
          ${countText ? `<span class="badge text-bg-secondary">${countText}</span>` : ""}
          ${!detailed && serialText ? `<span class="badge text-bg-info">SN: ${serialText}</span>` : ""}
        </div>
        ${detailed && serialText ? `<div class="small"><span class="text-muted">Серийный:</span> ${serialText}</div>` : ""}
        ${metaHtml}
      </div>
      ${openBtn}
    </div>
  `;
}

function bindSearchResultButtons(container, handler) {
  container.querySelectorAll("[data-box-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const boxId = Number(btn.dataset.boxId);
      if (!boxId) return;
      const highlightIds =
        btn.dataset.highlightIds
          ?.split(",")
          .map((val) => Number(val.trim()))
          .filter((num) => !Number.isNaN(num)) || [];
      await handler(boxId, highlightIds);
    });
  });
}

function getSearchResultsContainer(state) {
  if (state.ui.searchResultsEl) {
    return state.ui.searchResultsEl;
  }
  const el = document.getElementById("searchResults");
  state.ui.searchResultsEl = el;
  return el;
}
