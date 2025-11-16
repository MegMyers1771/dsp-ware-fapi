import {
  API_URL,
  createBox as createBoxApi,
  issueInventoryItem,
  getBoxes,
  getItemsByBox,
  getTabFields,
  reorderItems,
  updateItem,
  fetchStatuses,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";
import { renderTagFillCell } from "../../common/tagTemplates.js";
import { getDefaultItemFormMode } from "./state.js";
import { getCurrentUser } from "../../common/authControls.js";
import {
  setupBoxTableScrollSync,
  toggleBoxModalShift,
  setupBoxModalResizeToggle,
} from "./uiHelpers.js";
import { handleSearch, setupSearchFilters } from "./search.js";

function formatMetadataDisplay(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = typeof value === "string" ? value.trim() : String(value);
  if (!normalized) {
    return "";
  }
  return escapeHtml(normalized);
}

export function createBoxesController(state, elements) {
  let tagManagerApi = null;

  state.ui.boxViewModalEl = elements.boxViewModal ?? null;
  state.ui.boxViewModalDialogEl = elements.boxViewModalDialog ?? null;
  setupBoxModalResizeToggle(state);
  state.ui.addItemFormRefs = state.ui.addItemFormRefs || getAddItemFormRefs();
  state.ui.addItemOffcanvasEl = elements.addItemOffcanvas ?? null;
  if (state.ui.addItemOffcanvasEl) {
    state.ui.addItemOffcanvasEl.addEventListener("show.bs.offcanvas", () =>
      toggleBoxModalShift(state, true, "right", "addItem")
    );
    state.ui.addItemOffcanvasEl.addEventListener("hidden.bs.offcanvas", () => {
      toggleBoxModalShift(state, false, "right", "addItem");
      setItemFormMode(state);
    });
  }

  if (!state.itemFormMode) {
    setItemFormMode(state);
  }

  elements.addItemForm?.addEventListener("submit", (event) =>
    handleItemFormSubmit(event, state, () => tagManagerApi)
  );

  const addItemOpenBoxBtn = elements.addItemOpenBoxBtn ?? document.getElementById("addModalOpenBoxBtn");
  if (addItemOpenBoxBtn) {
    addItemOpenBoxBtn.addEventListener("click", async () => {
      const boxInput = document.getElementById("itemBoxId");
      const boxId = Number(boxInput?.value || state.itemFormMode?.boxId);
      if (!Number.isFinite(boxId) || boxId <= 0) {
        showTopAlert("Сначала выберите ящик для айтема", "warning");
        boxInput?.focus();
        return;
      }
      await openBoxModal(state, tagManagerApi, boxId, null, { refreshOnly: false });
    });
  }

  state.ui.issueOffcanvasEl = document.getElementById("issueItemOffcanvas");
  state.ui.issueFormEl = document.getElementById("issueItemForm");
  state.ui.issueRefs = state.ui.issueRefs || getIssueFormRefs();
  if (state.ui.issueOffcanvasEl) {
    state.ui.issueOffcanvasEl.addEventListener("show.bs.offcanvas", () =>
      toggleBoxModalShift(state, true, "left", "issue")
    );
    state.ui.issueOffcanvasEl.addEventListener("hidden.bs.offcanvas", () =>
      toggleBoxModalShift(state, false, "left", "issue")
    );
  }
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
    await handleSearch(state, state.lastSearchQuery, state.searchFilters, {
      openBox: (boxId, highlightIds) => openBoxModal(state, tagManagerApi, boxId, highlightIds),
    });
  };

  const filtersController = setupSearchFilters(state, {
    modalEl: elements.searchFiltersModal,
    formEl: elements.searchFiltersForm,
    fieldsContainer: elements.searchFiltersFields,
    resetBtn: elements.searchFiltersResetBtn,
    onFiltersChanged: rerunLastSearch,
  });
  state.ui.searchFiltersController = filtersController;
  state.ui.searchResultsEl = elements.searchResultsContainer ?? document.getElementById("searchResults");

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
      return handleSearch(state, query, state.searchFilters, {
        openBox: (boxId, highlightIds) => openBoxModal(state, tagManagerApi, boxId, highlightIds),
      });
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

  const container = document.getElementById("boxesTableContainer");
  let tbody = container?.querySelector("#boxesTableBody") || document.getElementById("boxesTableBody");
  if (!tbody && container) {
    container.innerHTML = `
      <table id="boxesTable" class="table table-hover table-striped mb-0">
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
    tbody = container.querySelector("#boxesTableBody");
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

  if (!state.currentTabFields.length) {
    try {
      const fields = await getTabFields(targetBox.tab_id);
      state.currentTabFields = fields;
    } catch (err) {
      console.warn("Не удалось загрузить поля вкладки", err);
      state.currentTabFields = [];
    }
  }

  if (!items.length) {
    content.innerHTML = `<div class="text-muted">Ящик пуст</div>`;
  } else {
    const fieldNames = (state.currentTabFields || []).map((field) => field.name).filter(Boolean);
    const metadataKeys = Array.from(new Set(items.flatMap((item) => Object.keys(item.metadata_json || {}))));
    const metaKeys = Array.from(
      new Set([...fieldNames, ...metadataKeys.filter((key) => !fieldNames.includes(key))])
    );
    const headers = [
      state.currentTabEnablePos
        ? { key: "__pos", label: "POS", style: "width:50px" }
        : { key: "__seq", label: "№", style: "width:70px" },
      { key: "__tags", label: "Тэги", style: "width:75px", class: "text-center" },
      { key: "__name", label: "Название", style: "width:380px" },
      { key: "__qty", label: "Кол-во", style: "width:110px", class: "text-center" },
      ...metaKeys.map((key) => ({ key, label: key })),
      { key: "__actions", label: "Действия", style: "width:140px", class: "text-center" },
    ];

    const esc = (value) => escapeHtml(value);
    const minWidth = Math.max(600, headers.length * 160);
    const totalItems = items.length;

    const tableHtml = `
      <div class="box-table-scroll">
        <div class="box-table-scroll-top">
          <div class="box-table-scroll-spacer"></div>
        </div>
        <div class="table-responsive box-table-scroll-content">
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
                cells.push(
                  `<td class="align-middle item-name-cell" data-item-name="${escapeHtml(
                    item.name
                  )}" data-item-id="${item.id}">${esc(item.name)}</td>`
                );
                const qtyLabel = typeof item.qty === "number" ? item.qty : "—";
                cells.push(`<td class="align-middle text-center">${esc(qtyLabel)}</td>`);
                metaKeys.forEach((key) =>
                  cells.push(
                    `<td class="align-middle">${formatMetadataDisplay((item.metadata_json || {})[key])}</td>`
                  )
                );
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
      </div>
    `;

    content.innerHTML = tableHtml;
    setupBoxTableScrollSync(content);
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
    const nameCells = content.querySelectorAll(".item-name-cell");
    nameCells.forEach((cell) => {
      const name = cell.dataset.itemName || "";
      let pointerMoved = false;
      cell.addEventListener("mousedown", () => {
        pointerMoved = false;
      });
      cell.addEventListener("mousemove", () => {
        pointerMoved = true;
      });
      cell.addEventListener("mouseup", async (event) => {
        if (pointerMoved) return;
        try {
          await navigator.clipboard.writeText(name);
          cell.classList.add("text-success");
          setTimeout(() => cell.classList.remove("text-success"), 350);
          showTopAlert("Название скопировано", "success", 1200);
        } catch (err) {
          console.warn("Clipboard copy failed", err);
          showTopAlert("Не удалось скопировать название", "warning");
        }
      });
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
  modalEl.addEventListener("shown.bs.modal", () => setupBoxModalResizeToggle(state));

  modalEl.addEventListener(
    "hidden.bs.modal",
    () => {
      toggleBoxModalShift(state, false, null, null);
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

async function issueItem(state, issueFormController, item, box) {
  if (!issueFormController) {
    showTopAlert("Форма выдачи недоступна", "danger");
    return;
  }
  if (!item || typeof item.qty !== "number" || item.qty <= 0) {
    showTopAlert("Для этого айтема нет доступного количества", "warning");
    return;
  }
  await issueFormController.open(item, box);
}

function setupIssueOffcanvas(state, { onIssued } = {}) {
  const offcanvasEl = state.ui.issueOffcanvasEl || document.getElementById("issueItemOffcanvas");
  const formEl = state.ui.issueFormEl || document.getElementById("issueItemForm");
  if (!offcanvasEl || !formEl) {
    return null;
  }

  const instance = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
  state.ui.issueOffcanvasInstance = instance;

  const refs = ensureIssueFormRefs(state);
  const { statusSelect, statusHintEl, responsibleInput, serialInput, invoiceInput, summaryEl, metaEl, submitBtn } = refs;

  if (responsibleInput) {
    responsibleInput.readOnly = true;
    responsibleInput.classList.add("bg-light", "text-muted");
  }

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

  const resolveResponsibleUserName = () => (getCurrentUser()?.user_name || "").trim();

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
    const responsible = resolveResponsibleUserName();
    if (!responsible) {
      showTopAlert("Авторизуйтесь, чтобы выдать айтем", "warning");
      return;
    }
    const serialNumber = serialInput?.value.trim();
    const invoiceNumber = invoiceInput?.value.trim();
    submitBtn?.setAttribute("disabled", "disabled");
    try {
      await issueInventoryItem(pendingContext.item.id, {
        status_id: statusId,
        responsible_user_name: responsible,
        serial_number: serialNumber || null,
        invoice_number: invoiceNumber || null,
      });
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
      const currentUserName = resolveResponsibleUserName();
      if (!currentUserName) {
        showTopAlert("Авторизуйтесь, чтобы выдать айтем", "warning");
        instance.hide();
        return;
      }
      if (responsibleInput) responsibleInput.value = currentUserName;
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
  const qtyLabel = typeof item?.qty === "number" ? item.qty : "—";
  return `
    <div class="fw-semibold">${esc(item?.name || "Без названия")}</div>
    <div class="text-muted small">Вкладка: ${esc(tabName)} · Ящик: ${esc(boxLabel)}</div>
    <div class="text-muted small">Кол-во на складе: ${esc(qtyLabel)}</div>
  `;
}

function buildIssueMetadata(item) {
  const entries = Object.entries(item?.metadata_json || {});
  if (!entries.length) {
    return '<div class="text-muted">Дополнительные поля отсутствуют</div>';
  }
  return entries
    .map(
      ([key, value]) =>
        `<div><span class="text-secondary">${escapeHtml(key)}:</span> ${formatMetadataDisplay(value)}</div>`
    )
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

  const formRefs = ensureAddItemFormRefs(state);
  const { nameInput, qtyInput, boxInput, tabInput, titleEl, submitBtn, fieldsContainer } = formRefs;

  if (boxInput) boxInput.value = item?.box_id ?? box.id;
  if (tabInput) tabInput.value = item?.tab_id ?? box.tab_id;
  if (nameInput) nameInput.value = item?.name ?? "";
  if (qtyInput) qtyInput.value = String(item?.qty ?? 1);

  if (titleEl) {
    titleEl.textContent = isEdit
      ? `Изменить айтем (${item?.name || item?.id || ""})`
      : "Добавить айтем";
  }
  if (submitBtn) {
    submitBtn.textContent = isEdit ? "Сохранить" : "Добавить";
  }

  if (fieldsContainer) fieldsContainer.innerHTML = `<div class="text-muted">Загрузка...</div>`;

  const fields = await getTabFields(box.tab_id);
  if (fieldsContainer) {
    fieldsContainer.innerHTML = "";
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
      fieldsContainer.appendChild(wrapper);
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

  const formRefs = ensureAddItemFormRefs(state);
  const { tabInput, boxInput, nameInput, qtyInput, fieldsContainer } = formRefs;
  const tabId = parseInt(tabInput?.value ?? "", 10);
  const boxId = parseInt(boxInput?.value ?? "", 10);
  const name = nameInput?.value.trim() || "";
  const qtyValue = Number.parseInt(qtyInput?.value ?? "", 10);
  const metadata_json = {};
  const errors = [];

  if (Number.isNaN(boxId)) {
    return showTopAlert("Не выбран ящик для айтема", "danger");
  }

  fieldsContainer?.querySelectorAll("[data-field-name]").forEach((el) => {
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

  if (!name) {
    showTopAlert("Введите название айтема", "danger");
    nameInput?.focus();
    return;
  }

  if (!Number.isInteger(qtyValue) || qtyValue <= 0) {
    showTopAlert("Количество должно быть больше нуля", "danger");
    qtyInput?.focus();
    return;
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
      qty: qtyValue,
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
      qty: qtyValue,
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
    if (qtyInput) {
      qtyInput.value = "1";
    }
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

function getAddItemFormRefs() {
  return {
    formEl: document.getElementById("addItemForm"),
    fieldsContainer: document.getElementById("tabFieldsContainer"),
    nameInput: document.getElementById("itemName"),
    qtyInput: document.getElementById("itemQty"),
    boxInput: document.getElementById("itemBoxId"),
    tabInput: document.getElementById("itemTabId"),
    titleEl: document.getElementById("addItemOffcanvasLabel"),
    submitBtn: document.querySelector("#addItemForm button[type='submit']"),
  };
}

function ensureAddItemFormRefs(state) {
  if (!state.ui.addItemFormRefs) {
    state.ui.addItemFormRefs = getAddItemFormRefs();
  }
  return state.ui.addItemFormRefs;
}

function getIssueFormRefs() {
  return {
    offcanvasEl: document.getElementById("issueItemOffcanvas"),
    formEl: document.getElementById("issueItemForm"),
    statusSelect: document.getElementById("issueStatusId"),
    statusHintEl: document.getElementById("issueStatusHint"),
    responsibleInput: document.getElementById("issueResponsibleUserName"),
    serialInput: document.getElementById("issueSerialNumber"),
    invoiceInput: document.getElementById("issueInvoiceNumber"),
    summaryEl: document.getElementById("issueItemSummary"),
    metaEl: document.getElementById("issueItemMeta"),
    submitBtn: document.getElementById("issueSubmitBtn"),
  };
}

function ensureIssueFormRefs(state) {
  if (!state.ui.issueRefs) {
    state.ui.issueRefs = getIssueFormRefs();
  }
  return state.ui.issueRefs;
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
