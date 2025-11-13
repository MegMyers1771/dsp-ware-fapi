import {
  API_URL,
  createBox as createBoxApi,
  issueInventoryItem,
  getBoxes,
  getItemsByBox,
  getTabFields,
  reorderItems,
  searchItems,
  updateItem,
  fetchStatuses,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";
import { renderTagFillCell } from "../../common/tagTemplates.js";
import { getDefaultItemFormMode } from "./state.js";

export function createBoxesController(state, elements) {
  let tagManagerApi = null;

  state.ui.boxViewModalEl = elements.boxViewModal ?? null;
  state.ui.boxViewModalDialogEl = elements.boxViewModalDialog ?? null;
  state.ui.addItemOffcanvasEl = elements.addItemOffcanvas ?? null;
  if (state.ui.addItemOffcanvasEl) {
    state.ui.addItemOffcanvasEl.addEventListener("show.bs.offcanvas", () => toggleBoxModalShift(state, true));
    state.ui.addItemOffcanvasEl.addEventListener("hidden.bs.offcanvas", () => {
      toggleBoxModalShift(state, false);
      setItemFormMode(state);
    });
  }

  if (!state.itemFormMode) {
    setItemFormMode(state);
  }

  elements.addItemForm?.addEventListener("submit", (event) =>
    handleItemFormSubmit(event, state, () => tagManagerApi)
  );

  state.ui.issueOffcanvasEl = document.getElementById("issueItemOffcanvas");
  state.ui.issueFormEl = document.getElementById("issueItemForm");
  const issueFormController = setupIssueOffcanvas(state, {
    async onIssued({ boxId } = {}) {
      const normalizedBoxId = Number(boxId ?? state.currentBoxViewBoxId);
      if (Number.isFinite(normalizedBoxId) && state.currentBoxViewBoxId === normalizedBoxId) {
        await openBoxModal(state, tagManagerApi, normalizedBoxId, null, { refreshOnly: true });
      }
      await renderBoxes(state, tagManagerApi);
    },
  });
  state.ui.issueFormController = issueFormController;

  const rerunLastSearch = async () => {
    if (!state.lastSearchQuery) return;
    await handleSearch(state, tagManagerApi, state.lastSearchQuery, state.searchFilters);
  };

  const filtersController = setupSearchFilters(state, {
    modalEl: elements.searchFiltersModal,
    formEl: elements.searchFiltersForm,
    fieldsContainer: elements.searchFiltersFields,
    resetBtn: elements.searchFiltersResetBtn,
    onFiltersChanged: rerunLastSearch,
  });
  state.ui.searchFiltersController = filtersController;

  return {
    registerTagManager(api) {
      tagManagerApi = api;
    },
    async renderBoxes() {
      await renderBoxes(state, tagManagerApi);
    },
    async openBoxModal(boxId, highlightItems = null, options = {}) {
      await openBoxModal(state, tagManagerApi, boxId, highlightItems, options);
    },
    async createBox(name, description) {
      await createBoxApi(state.tabId, name, description);
    },
    async handleSearch(query) {
      return handleSearch(state, tagManagerApi, query, state.searchFilters);
    },
    async openSearchFilters() {
      await filtersController?.open();
    },
  };
}

async function renderBoxes(state, tagManagerApi) {
  const boxes = await getBoxes(state.tabId);
  state.boxesById = new Map((boxes || []).map((box) => [Number(box.id), box]));
  try {
    await state.tagStore.refresh();
  } catch (err) {
    console.warn("Не удалось обновить кэш тэгов для боксов", err);
  }

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

  if (!tbody) return;
  tbody.innerHTML = "";

  if (!boxes || boxes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Ящиков нет</td></tr>`;
    return;
  }

  boxes.forEach((box) => {
    const tr = document.createElement("tr");
    tr.dataset.boxId = box.id;

    tr.innerHTML = `
      <td>${escapeHtml(box.id)}</td>
      <td class="tag-fill-cell">${renderTagFillCell(box.tag_ids, { tagLookup: state.tagStore.getById, emptyText: "Нет" })}</td>
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

    tr.addEventListener("click", (event) => {
      if (event.target.closest(".box-actions-container") || event.target.closest(".dropdown-menu")) return;
      openBoxModal(state, tagManagerApi, box.id);
    });

    tr.querySelector(".box-actions-dropdown")?.addEventListener("click", (event) => event.stopPropagation());

    tr.querySelector(".box-action-add-item")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openAddItemOffcanvas(state, box);
    });

    tr.querySelector(".box-action-attach-tag")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await tagManagerApi?.openAttachBoxTagModal(box);
    });

    tbody.appendChild(tr);
  });
}

async function openBoxModal(state, tagManagerApi, boxId, highlightItems = null, options = {}) {
  const { refreshOnly = false } = options || {};
  state.currentBoxViewBoxId = Number(boxId);
  const items = await getItemsByBox(boxId);
  const content = document.getElementById("boxViewContent");
  const normalizedBoxId = Number(boxId);
  const fallbackTabId = items[0]?.tab_id ?? state.tabId;
  const targetBox =
    state.boxesById.get(normalizedBoxId) ||
    {
      id: normalizedBoxId,
      tab_id: fallbackTabId ?? state.tabId,
    };

  if (!items.length) {
    content.innerHTML = `<div class="text-muted">Ящик пуст</div>`;
  } else {
    const metaKeys = Array.from(new Set(items.flatMap((item) => Object.keys(item.metadata_json || {}))));
    const headers = [
      state.currentTabEnablePos
        ? { key: "__pos", label: "POS", style: "width:90px" }
        : { key: "__seq", label: "№", style: "width:70px" },
      { key: "__tags", label: "Тэги", style: "width:140px", class: "text-center" },
      { key: "__name", label: "Название" },
      ...metaKeys.map((key) => ({ key, label: key })),
      { key: "__actions", label: "Действия", style: "width:140px", class: "text-center" },
    ];

    const esc = (value) => escapeHtml(value);
    const minWidth = Math.max(600, headers.length * 160);
    const totalItems = items.length;

    const tableHtml = `
      <div class="table-responsive">
        <table class="table table-hover table-sm small" style="min-width:${minWidth}px;">
          <thead class="table-dark">
            <tr>
              ${headers
                .map(
                  (header) => `<th ${header.style ? `style="${header.style}"` : ""} class="text-nowrap${header.class ? ` ${header.class}` : ""}">${esc(header.label)}</th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${items
              .map((item, index) => {
                const cells = [];
                const fromStart = typeof item.box_position === "number" ? item.box_position : null;
                const fromEnd = typeof item.box_position === "number" ? totalItems - item.box_position + 1 : null;
                const posLabel = state.currentTabEnablePos
                  ? fromStart !== null && fromEnd !== null
                    ? `${fromStart} (${fromEnd})`
                    : ""
                  : index + 1;
                cells.push(`<td class="align-middle">${esc(posLabel)}</td>`);
                cells.push(
                  `<td class="tag-fill-cell align-middle">${renderTagFillCell(item.tag_ids, {
                    tagLookup: state.tagStore.getById,
                    emptyText: "Нет",
                  })}</td>`
                );
                cells.push(`<td class="align-middle">${esc(item.name)}</td>`);
                metaKeys.forEach((key) => cells.push(`<td class="align-middle">${esc((item.metadata_json || {})[key])}</td>`));
                cells.push(`
                  <td class="text-center align-middle">
                    <div class="btn-group btn-group-sm item-actions-container">
                      <button class="btn btn-sm btn-outline-secondary item-actions-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false">•••</button>
                      <ul class="dropdown-menu dropdown-menu-end">
                        <li><button class="dropdown-item item-action-edit" type="button" data-item-id="${item.id}">Редактировать</button></li>
                        <li><button class="dropdown-item item-action-issue" type="button" data-item-id="${item.id}">Выдать</button></li>
                        <li><button class="dropdown-item item-action-attach-tag" type="button" data-item-id="${item.id}">Привязать тэг</button></li>
                      </ul>
                    </div>
                  </td>
                `);
                return `<tr data-item-id="${item.id}">${cells.join("")}</tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    content.innerHTML = tableHtml;
    if (state.currentTabEnablePos) {
      enableItemReorder(state, tagManagerApi, content, Number(boxId));
    }

    const highlightIds = normalizeHighlightIds(highlightItems);
    if (highlightIds.length) {
      setTimeout(() => {
        highlightIds.forEach((id, index) => {
          const row = content.querySelector(`tr[data-item-id='${id}']`);
          if (row) {
            row.classList.add("table-success", "text-white");
            if (index === 0) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        });
      }, 30);
    }

    const itemMap = new Map(items.map((item) => [String(item.id), item]));
    content.querySelectorAll(".item-actions-dropdown").forEach((btn) => {
      btn.addEventListener("click", (event) => event.stopPropagation());
    });
    content.querySelectorAll(".item-action-edit").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        const targetItem = itemMap.get(String(itemId));
        if (targetItem) {
          await openAddItemOffcanvas(state, targetBox, { item: targetItem });
        }
      });
    });
    content.querySelectorAll(".item-action-issue").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        const targetItem = itemMap.get(String(itemId));
        if (!targetItem) return;
        await issueItem(state, state.ui.issueFormController, targetItem, targetBox);
      });
    });
    content.querySelectorAll(".item-action-attach-tag").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const itemId = btn.dataset.itemId;
        if (!itemId) return;
        const targetItem = itemMap.get(String(itemId));
        if (targetItem) {
          await tagManagerApi?.openAttachItemTagModal(targetItem);
        }
      });
    });
  }

  const addItemBtn = document.getElementById("boxViewAddItemBtn");
  if (addItemBtn) {
    addItemBtn.onclick = async () => {
      await openAddItemOffcanvas(state, targetBox);
    };
  }

  if (refreshOnly) return;

  const modalEl = state.ui.boxViewModalEl || document.getElementById("boxViewModal");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl, { backdrop: false, focus: false });

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      toggleBoxModalShift(state, false);
      if (state.ui.addItemOffcanvasInstance) {
        try {
          state.ui.addItemOffcanvasInstance.hide();
        } catch {
          // ignore
        }
      }
      const highlightedRow = document.querySelector("#boxViewContent .table-success");
      highlightedRow?.classList.remove("table-success", "text-white");
      const highlighted = document.querySelector("#boxViewContent .bg-success");
      if (highlighted) {
        highlighted.classList.remove("bg-success", "text-white");
        highlighted.classList.add("bg-light");
      }
    },
    { once: true }
  );

  modal.show();
}

function enableItemReorder(state, tagManagerApi, container, boxId) {
  const tbody = container.querySelector("tbody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr"));
  if (rows.length < 2) return;

  let draggingRow = null;
  let orderChanged = false;
  let previousUserSelect = "";

  const detach = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".item-actions-container")) return;

    draggingRow = event.currentTarget;
    draggingRow.classList.add("dragging");
    orderChanged = false;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    event.preventDefault();
  };

  const handleMouseMove = (event) => {
    if (!draggingRow) return;

    const pointerY = event.clientY;
    const next = draggingRow.nextElementSibling;
    if (next) {
      const nextRect = next.getBoundingClientRect();
      const trigger = nextRect.top + nextRect.height / 2;
      if (pointerY > trigger) {
        draggingRow.parentNode.insertBefore(next, draggingRow);
        orderChanged = true;
        return;
      }
    }

    const prev = draggingRow.previousElementSibling;
    if (prev) {
      const prevRect = prev.getBoundingClientRect();
      const trigger = prevRect.top + prevRect.height / 2;
      if (pointerY < trigger) {
        draggingRow.parentNode.insertBefore(draggingRow, prev);
        orderChanged = true;
      }
    }
  };

  const handleMouseUp = async () => {
    detach();
    if (!draggingRow) return;

    draggingRow.classList.remove("dragging");
    document.body.style.userSelect = previousUserSelect || "";
    const droppedRow = draggingRow;
    draggingRow = null;

    if (!orderChanged) return;

    const orderedIds = Array.from(tbody.querySelectorAll("tr")).map((row) => Number(row.dataset.itemId));
    const highlightId = Number(droppedRow.dataset.itemId);

    try {
      await reorderItems(boxId, orderedIds);
      showTopAlert("Порядок в ящике сохранён", "success", 2500);
      await openBoxModal(state, tagManagerApi, boxId, highlightId ? [highlightId] : null, { refreshOnly: true });
    } catch (err) {
      console.error("Ошибка сохранения порядка", err);
      showTopAlert(err?.message || "Не удалось сохранить порядок", "danger");
      await openBoxModal(state, tagManagerApi, boxId, highlightId ? [highlightId] : null, { refreshOnly: true });
    }
  };

  rows.forEach((row) => {
    row.classList.add("draggable-item-row");
    row.addEventListener("mousedown", handleMouseDown);
  });
}

function toggleBoxModalShift(state, enable) {
  state.ui.boxViewModalDialogEl?.classList.toggle("shifted", !!enable);
  state.ui.boxViewModalEl?.classList.toggle("stacked", !!enable);
}

async function issueItem(state, issueFormController, item, box) {
  if (!issueFormController) {
    showTopAlert("Форма выдачи недоступна", "danger");
    return;
  }
  await issueFormController.open(item, box);
}

function setupSearchFilters(
  state,
  {
    modalEl = document.getElementById("searchFiltersModal"),
    formEl = document.getElementById("searchFiltersForm"),
    fieldsContainer = document.getElementById("searchFiltersFields"),
    resetBtn = document.getElementById("searchFiltersResetBtn"),
    onFiltersChanged,
  } = {}
) {
  if (!modalEl || !formEl || !fieldsContainer) return null;
  const modal = new bootstrap.Modal(modalEl);
  let cachedFields = null;

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
      .map(
        (field) => `
          <div class="col-12 col-md-6">
            <label class="form-label">${escapeHtml(field.name)}</label>
            <input type="text" class="form-control" data-filter-field="${escapeHtml(field.name)}" placeholder="Значение" />
          </div>
        `
      )
      .join("");
  };

  const applyStoredValues = () => {
    const filters = state.searchFilters || {};
    fieldsContainer.querySelectorAll("[data-filter-field]").forEach((input) => {
      const key = input.dataset.filterField;
      input.value = filters?.[key] ?? "";
    });
  };

  const collectValues = () => {
    const payload = {};
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

function setupIssueOffcanvas(state, { onIssued } = {}) {
  const offcanvasEl = document.getElementById("issueItemOffcanvas");
  const formEl = document.getElementById("issueItemForm");
  if (!offcanvasEl || !formEl) {
    return null;
  }

  const instance = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
  state.ui.issueOffcanvasInstance = instance;

  const statusSelect = document.getElementById("issueStatusId");
  const statusHintEl = document.getElementById("issueStatusHint");
  const responsibleInput = document.getElementById("issueResponsible");
  const serialInput = document.getElementById("issueSerialNumber");
  const invoiceInput = document.getElementById("issueInvoiceNumber");
  const summaryEl = document.getElementById("issueItemSummary");
  const metaEl = document.getElementById("issueItemMeta");
  const submitBtn = document.getElementById("issueSubmitBtn");

  let pendingContext = null;
  let statuses = [];
  let statusesLoaded = false;
  let statusesLoading = false;

  const renderStatusOptions = (preferredId) => {
    if (!statusSelect) return;
    if (!statuses.length) {
      statusSelect.innerHTML = "";
      if (statusHintEl) statusHintEl.textContent = "Создайте статусы на главной странице";
      return;
    }
    if (statusHintEl) statusHintEl.textContent = "";
    statusSelect.innerHTML = statuses
      .map((status) => {
        const selected = String(status.id) === String(preferredId) ? "selected" : "";
        return `<option value="${status.id}" ${selected}>${escapeHtml(status.name || "Статус")}</option>`;
      })
      .join("");
  };

  const ensureStatuses = async () => {
    if (statusesLoaded || statusesLoading) return statuses;
    statusesLoading = true;
    try {
      statuses = await fetchStatuses();
      statusesLoaded = true;
    } catch (err) {
      console.warn("Не удалось загрузить статусы для выдачи", err);
      throw err;
    } finally {
      statusesLoading = false;
    }
    return statuses;
  };

  offcanvasEl.addEventListener("hidden.bs.offcanvas", () => {
    pendingContext = null;
    formEl.reset();
    if (statusSelect) statusSelect.innerHTML = "";
    if (statusHintEl) statusHintEl.textContent = "";
  });

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingContext) {
      showTopAlert("Айтем не выбран", "danger");
      return;
    }
    const statusId = Number(statusSelect?.value);
    if (!Number.isInteger(statusId) || statusId <= 0) {
      showTopAlert("Выберите статус выдачи", "warning");
      statusSelect?.focus();
      return;
    }
    const responsible = responsibleInput?.value.trim();
    if (!responsible) {
      showTopAlert("Укажите ответственного", "warning");
      responsibleInput?.focus();
      return;
    }
    const serialNumber = serialInput?.value.trim();
    const invoiceNumber = invoiceInput?.value.trim();
    submitBtn?.setAttribute("disabled", "disabled");
    try {
      await issueInventoryItem(pendingContext.item.id, {
        status_id: statusId,
        responsible,
        serial_number: serialNumber || null,
        invoice_number: invoiceNumber || null,
      });
      window.localStorage?.setItem("issueResponsible", responsible);
      window.localStorage?.setItem("issueStatusId", String(statusId));
      showTopAlert("Айтем выдан", "success");
      const context = pendingContext;
      pendingContext = null;
      instance.hide();
      await onIssued?.({ boxId: context?.box?.id, itemId: context?.item?.id });
    } catch (err) {
      console.error("Issue error", err);
      showTopAlert(err?.message || "Ошибка при выдаче айтема", "danger");
    } finally {
      submitBtn?.removeAttribute("disabled");
    }
  });

  return {
    open: async (item, box) => {
      pendingContext = {
        item,
        box: box || state.boxesById.get(Number(item?.box_id)) || { id: item?.box_id, tab_id: item?.tab_id },
      };
      if (summaryEl) summaryEl.innerHTML = buildIssueSummary(state, pendingContext.item, pendingContext.box);
      if (metaEl) metaEl.innerHTML = buildIssueMetadata(pendingContext.item);
      if (statusSelect) statusSelect.innerHTML = "<option value=\"\">Загрузка...</option>";
      const savedResponsible = window.localStorage?.getItem("issueResponsible") || "";
      if (responsibleInput) responsibleInput.value = savedResponsible;
      if (serialInput) serialInput.value = "";
      if (invoiceInput) invoiceInput.value = "";
      const savedStatusId = window.localStorage?.getItem("issueStatusId") || "";
      try {
        await ensureStatuses();
      } catch (err) {
        if (statusHintEl) statusHintEl.textContent = "Не удалось загрузить статусы";
      }
      renderStatusOptions(savedStatusId);
      instance.show();
      setTimeout(() => responsibleInput?.focus(), 200);
    },
  };
}

function resolveTabName(state, tabId) {
  if (!tabId) return `Вкладка #${state.tabId}`;
  const snapshot = state.latestTabsSnapshot || [];
  const found = snapshot.find((tab) => Number(tab.id) === Number(tabId));
  return found?.name || `Вкладка #${tabId}`;
}

function buildIssueSummary(state, item, box) {
  const esc = (value) => escapeHtml(value ?? "—");
  const tabName = resolveTabName(state, item?.tab_id ?? box?.tab_id);
  const boxLabel = box?.name || (box?.id ? `Ящик #${box.id}` : "—");
  return `
    <div class="fw-semibold">${esc(item?.name || "Без названия")}</div>
    <div class="text-muted small">Вкладка: ${esc(tabName)} · Ящик: ${esc(boxLabel)}</div>
  `;
}

function buildIssueMetadata(item) {
  const esc = (value) => escapeHtml(value ?? "—");
  const entries = Object.entries(item?.metadata_json || {});
  if (!entries.length) {
    return '<div class="text-muted">Дополнительные поля отсутствуют</div>';
  }
  return entries
    .map(([key, value]) => `<div><span class="text-secondary">${esc(key)}:</span> ${esc(value)}</div>`)
    .join("");
}

async function openAddItemOffcanvas(state, box, { item = null } = {}) {
  if (!box) {
    console.warn("Не удалось открыть форму: не указан ящик");
    return;
  }
  const isEdit = !!item;
  setItemFormMode(state, {
    mode: isEdit ? "edit" : "create",
    itemId: item?.id ?? null,
    boxId: box?.id ?? item?.box_id ?? null,
    tagIds: Array.isArray(item?.tag_ids) ? [...item.tag_ids] : [],
    qty: item?.qty ?? 1,
    position: item?.box_position ?? 1,
  });

  const nameInput = document.getElementById("itemName");
  const boxInput = document.getElementById("itemBoxId");
  const tabInput = document.getElementById("itemTabId");
  const titleEl = document.getElementById("addItemOffcanvasLabel");
  const submitBtn = document.querySelector("#addItemForm button[type='submit']");

  if (boxInput) boxInput.value = item?.box_id ?? box.id;
  if (tabInput) tabInput.value = item?.tab_id ?? box.tab_id;
  if (nameInput) nameInput.value = item?.name ?? "";

  if (titleEl) {
    titleEl.textContent = isEdit
      ? `Изменить айтем (${item?.name || item?.id || ""})`
      : "Добавить айтем";
  }
  if (submitBtn) {
    submitBtn.textContent = isEdit ? "Сохранить" : "Добавить";
  }

  const container = document.getElementById("tabFieldsContainer");
  if (container) container.innerHTML = `<div class="text-muted">Загрузка...</div>`;

  const fields = await getTabFields(box.tab_id);
  if (container) {
    container.innerHTML = "";
    const meta = (item && item.metadata_json) || {};
    fields.forEach((field) => {
      const wrapper = document.createElement("div");
      wrapper.className = "mb-3";
      const label = document.createElement("label");
      label.className = "form-label";
      label.textContent = field.name;
      const input = document.createElement("input");
      input.className = "form-control";
      input.dataset.fieldName = field.name;
      if (field.strong) input.dataset.strong = "1";
      if (field.allowed_values?.length) {
        input.dataset.allowed = JSON.stringify(field.allowed_values);
        const datalistId = `allowed-${field.name}-list`;
        input.setAttribute("list", datalistId);
        const datalist = document.createElement("datalist");
        datalist.id = datalistId;
        datalist.innerHTML = field.allowed_values.map((val) => `<option value="${escapeHtml(val)}"></option>`).join("");
        wrapper.appendChild(label);
        wrapper.appendChild(datalist);
      } else {
        wrapper.appendChild(label);
      }
      const currentValue = meta[field.name];
      if (currentValue !== undefined && currentValue !== null) {
        input.value = currentValue;
      }
      wrapper.appendChild(input);
      container.appendChild(wrapper);
    });
  }

  const offcanvasEl = state.ui.addItemOffcanvasEl || document.getElementById("addItemOffcanvas");
  if (!offcanvasEl) {
    console.warn("Отсутствует offcanvas для добавления/редактирования айтема");
    return;
  }
  if (!state.ui.addItemOffcanvasInstance) {
    state.ui.addItemOffcanvasInstance = new bootstrap.Offcanvas(offcanvasEl);
  }
  state.ui.addItemOffcanvasInstance.show();
  nameInput?.focus();
}

async function handleItemFormSubmit(event, state, getTagManager) {
  event.preventDefault();

  const tabId = parseInt(document.getElementById("itemTabId").value, 10);
  const boxId = parseInt(document.getElementById("itemBoxId").value, 10);
  const nameInput = document.getElementById("itemName");
  const name = nameInput.value.trim();
  const metadata_json = {};
  const errors = [];

  if (Number.isNaN(boxId)) {
    return showTopAlert("Не выбран ящик для айтема", "danger");
  }

  document.querySelectorAll("#tabFieldsContainer [data-field-name]").forEach((el) => {
    const key = el.dataset.fieldName;
    const val = el.value.trim();
    if (el.dataset.strong && el.dataset.allowed) {
      const allowed = JSON.parse(el.dataset.allowed);
      if (val && !allowed.includes(val)) {
        errors.push(`Поле "${key}" должно иметь одно из значений: ${allowed.join(", ")}`);
      }
    }
    if (val) metadata_json[key] = val;
  });

  if (!name && Object.keys(metadata_json).length === 0) {
    return showTopAlert("Заполните имя или хотя бы одно значение атрибутов", "danger");
  }

  if (errors.length) {
    return showTopAlert(errors.join("; "), "danger");
  }

  const tagManagerApi = typeof getTagManager === "function" ? getTagManager() : null;
  const mode = state.itemFormMode?.mode || "create";
  let highlightId = null;
  let createdItem = null;

  if (mode === "edit" && state.itemFormMode?.itemId) {
    const payload = {
      name,
      qty: state.itemFormMode?.qty ?? 1,
      position: state.itemFormMode?.position ?? 1,
      metadata_json,
      tag_ids: state.itemFormMode?.tagIds ?? [],
      box_id: boxId,
    };

    try {
      await updateItem(state.itemFormMode.itemId, payload);
      highlightId = state.itemFormMode.itemId;
      showTopAlert("Айтем обновлён", "success");
      state.ui.addItemOffcanvasInstance?.hide();
    } catch (err) {
      console.error("Ошибка обновления айтема:", err);
      showTopAlert(err?.message || "Не удалось обновить айтем", "danger");
      return;
    }
  } else {
    if (Number.isNaN(tabId)) {
      return showTopAlert("Не указана вкладка для айтема", "danger");
    }

    const payload = {
      name,
      qty: 1,
      position: 1,
      metadata_json,
      tag_ids: [],
      tab_id: tabId,
      box_id: boxId,
    };

    const res = await fetch(`${API_URL}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Ошибка добавления:", text);
      showTopAlert("Ошибка при добавлении", "danger");
      return;
    }

    createdItem = await res.json().catch(() => null);
    highlightId = createdItem?.id || null;
    showTopAlert("Айтем добавлен", "success");
    nameInput.value = "";
    document.querySelectorAll("#tabFieldsContainer [data-field-name]").forEach((el) => (el.value = ""));
  }

  await renderBoxes(state, tagManagerApi);

  const boxModalEl = state.ui.boxViewModalEl || document.getElementById("boxViewModal");
  if (
    boxModalEl?.classList.contains("show") &&
    state.currentBoxViewBoxId &&
    Number(state.currentBoxViewBoxId) === Number(boxId)
  ) {
    await openBoxModal(state, tagManagerApi, boxId, highlightId ? [highlightId] : null, { refreshOnly: true });
  }

  setItemFormMode(state);
}

async function handleSearch(state, tagManagerApi, query, filters = {}) {
  state.lastSearchQuery = query;
  const response = await searchItems(state.tabId, query);
  const results = response.results || [];
  const container = document.getElementById("searchResults");

  const filteredResults = filterSearchResults(results, filters);

  if (!filteredResults.length) {
    const baseMessage = results.length ? "Совпадений по выбранным фильтрам не найдено" : "Совпадений не найдено";
    container.innerHTML = `<div class="text-muted">${baseMessage}</div>`;
    return;
  }

  const grouped = groupSearchResults(filteredResults);

  container.innerHTML = grouped
    .map((group) => {
      const name = escapeHtml(group.name);
      const countText = `${group.itemIds.length} шт`;
      const boxLabel = escapeHtml(group.boxName || "—");
      const openBtn = group.boxId
        ? `<button class="btn btn-sm btn-outline-success" data-box-id="${group.boxId}" data-highlight-ids="${group.itemIds.join(",")}">${boxLabel}</button>`
        : `<span class="text-muted small">Ящик неизвестен</span>`;

      return `
        <div class="d-flex align-items-center justify-content-between gap-2 border p-2 mb-2 bg-dark rounded shadow-sm flex-wrap">
          <div class="d-flex flex-column flex-sm-row gap-2">
            <span><strong>${name}</strong></span>
            <span class="badge text-bg-secondary">${countText}</span>
          </div>
          ${openBtn}
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-box-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const boxId = Number(btn.dataset.boxId);
      if (!boxId) return;
      const highlightIds =
        btn.dataset.highlightIds
          ?.split(",")
          .map((val) => Number(val.trim()))
          .filter((num) => !Number.isNaN(num)) || [];
      await openBoxModal(state, tagManagerApi, boxId, highlightIds);
    });
  });
}

function groupSearchResults(results = []) {
  const map = new Map();
  results.forEach((item) => {
    const boxId = item.box?.id ?? null;
    const name = item.name || "—";
    const key = boxId ? `${boxId}::${name}` : `solo::${item.id}`;
    if (!map.has(key)) {
      map.set(key, {
        name,
        boxId,
        boxName: item.box?.name || "—",
        itemIds: [],
      });
    }
    map.get(key).itemIds.push(item.id);
  });
  return Array.from(map.values());
}

function filterSearchResults(results = [], filters = {}) {
  const activeFilters = Object.entries(filters || {})
    .map(([field, value]) => [field, typeof value === "string" ? value.trim() : ""])
    .filter(([, value]) => value);

  if (!activeFilters.length) {
    return results;
  }

  return results.filter((item) => {
    const metadata = item.metadata || {};
    return activeFilters.every(([fieldName, expected]) => {
      const actual = metadata[fieldName];
      if (actual === undefined || actual === null) {
        return false;
      }
      return String(actual).toLowerCase().includes(expected.toLowerCase());
    });
  });
}

function setItemFormMode(state, overrides = {}) {
  state.itemFormMode = {
    ...getDefaultItemFormMode(),
    ...overrides,
  };
}

function normalizeHighlightIds(value) {
  if (value === null || value === undefined) return [];
  const source = Array.isArray(value) ? value : [value];
  const dedup = new Set();
  source.forEach((item) => {
    const num = Number(item);
    if (!Number.isNaN(num)) {
      dedup.add(num);
    }
  });
  return Array.from(dedup);
}
