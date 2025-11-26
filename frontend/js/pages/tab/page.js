import { showTopAlert } from "../../common/alerts.js";
import { createBoxesController } from "./boxes.js";
import { createTabState } from "./state.js";
import { createTabTagManager } from "./tagManagement.js";
import { fetchTabs, fetchSyncWorkerStatus, getBoxes } from "../../api.js";

export async function bootstrapTabPage() {
  const tabIdParam = new URLSearchParams(window.location.search).get("tab_id");
  if (!tabIdParam) {
    alert("Не указан tab_id");
    return;
  }
  const state = createTabState(Number(tabIdParam));

  const boxesController = createBoxesController(state, {
    boxViewModal: document.getElementById("boxViewModal"),
    boxViewModalDialog: document.getElementById("boxViewModalDialog"),
    addItemOffcanvas: document.getElementById("addItemOffcanvas"),
    addItemForm: document.getElementById("addItemForm"),
    addItemOpenBoxBtn: document.getElementById("addModalOpenBoxBtn"),
    searchFiltersModal: document.getElementById("searchFiltersModal"),
    searchFiltersForm: document.getElementById("searchFiltersForm"),
    searchFiltersFields: document.getElementById("searchFiltersFields"),
    searchFiltersResetBtn: document.getElementById("searchFiltersResetBtn"),
    searchResultsContainer: document.getElementById("searchResults"),
  });

  const tagManager = createTabTagManager(state, {
    boxesController,
    elements: collectTagElements(),
  });
  boxesController.registerTagManager(tagManager);

  await initializeTabMeta(state);
  await ensureSyncWorkerStatus(state);
  setupQuickActions(tagManager);
  setupBoxForm(boxesController);
  setupSearch(state, boxesController);
  setupOpenBoxShortcut(state, boxesController);

  try {
    await tagManager.refresh(true, { silent: true });
  } catch (err) {
    console.warn("Initial tag load failed", err);
  }
  tagManager.renderPills();
  await boxesController.renderBoxes();
}

async function initializeTabMeta(state) {
  let tabName = null;
  try {
    const tabs = await fetchTabs();
    state.latestTabsSnapshot = tabs || [];
    const current = (tabs || []).find((tab) => String(tab.id) === String(state.tabId));
    if (current) {
      tabName = current.name;
      state.currentTabEnablePos = current.enable_pos !== false;
    }
  } catch (err) {
    console.warn("Could not fetch tabs for name:", err);
  }

  const titleText = tabName ? `${tabName}` : `Вкладка #${state.tabId}`;
  const titleEl = document.getElementById("tabTitle");
  if (titleEl) titleEl.textContent = titleText;
  const brandEl = document.getElementById("tabNavbarBrand");
  if (brandEl) brandEl.textContent = tabName || `Вкладка #${state.tabId}`;
}

async function ensureSyncWorkerStatus(state) {
  try {
    const status = await fetchSyncWorkerStatus();
    state.syncWorkerOnline = !!status?.rq_worker_online;
    if (state.syncWorkerOnline === false && !state.syncWorkerWarningShown) {
      showTopAlert(
        "Воркер Redis для синхронизации не запущен — изменения не попадут в Google Sheets, пока он не запущен.",
        "warning",
        8000
      );
      state.syncWorkerWarningShown = true;
    }
  } catch (err) {
    console.warn("Не удалось проверить статус воркера синхронизации", err);
  }
}

function setupQuickActions(tagManager) {
  const ddTag = document.getElementById("dropdown-create-tag");
  if (ddTag) {
    ddTag.addEventListener("click", async (event) => {
      event.preventDefault();
      await tagManager.showCreateTagOffcanvas();
    });
  }
}

function setupBoxForm(boxesController) {
  const formEl = document.getElementById("addBoxForm");
  const nameEl = document.getElementById("boxName");
  const descriptionEl = document.getElementById("boxDescription");
  const capacityEl = document.getElementById("boxCapacity");
  const modalEl = document.getElementById("addBoxModal");
  const modalInstance = modalEl ? new bootstrap.Modal(modalEl) : null;
  let editBoxId = null;

  document.getElementById("addBoxForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameEl?.value.trim() || "";
    const description = descriptionEl?.value.trim() || "";
    const capacityRaw = capacityEl?.value ?? "";
    const capacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : null;
    if (!name) return;

    try {
      if (editBoxId) {
        await boxesController.updateBox(editBoxId, { name, description, capacity });
        showTopAlert("Ящик обновлён", "success");
      } else {
        await boxesController.createBox(name, description, capacity);
        showTopAlert("Ящик создан", "success");
      }
      modalInstance?.hide();
      formEl?.reset();
      editBoxId = null;
      if (nameEl) nameEl.value = "";
      if (descriptionEl) descriptionEl.value = "";
      if (capacityEl) capacityEl.value = "";
      await boxesController.renderBoxes();
    } catch (err) {
      console.error("Не удалось создать ящик", err);
      showTopAlert(err?.message || "Не удалось сохранить ящик", "danger", 5000);
    }
  });

  const openForEdit = (box) => {
    editBoxId = box?.id ?? null;
    if (nameEl) nameEl.value = box?.name || "";
    if (descriptionEl) descriptionEl.value = box?.description || "";
    if (capacityEl) capacityEl.value = box?.capacity ?? "";
    if (modalEl) modalEl.querySelector(".modal-title").textContent = editBoxId ? "Редактировать ящик" : "Добавить ящик";
    modalInstance?.show();
  };

  const addBtn = document.getElementById("dropdown-add-box");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      editBoxId = null;
      formEl?.reset();
      if (modalEl) modalEl.querySelector(".modal-title").textContent = "Добавить ящик";
      modalInstance?.show();
    });
  }

  window.__openBoxEditModal = openForEdit;
}

function setupSearch(state, boxesController) {
  document.getElementById("searchBtn")?.addEventListener("click", async () => {
    const query = document.getElementById("searchInput").value.trim();
    await boxesController.handleSearch(query);
  });

  document.getElementById("openFiltersBtn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await boxesController.openSearchFilters();
  });
}

function setupOpenBoxShortcut(state, boxesController) {
  const btn = document.getElementById("openBoxBtn");
  const hiddenBtn = document.getElementById("openHiddenBoxBtn");
  const input = document.getElementById("openBoxInput");
  const hiddenInput = document.getElementById("openHiddenBoxInput");

  const handleOpen = async (valueRaw) => {
    const value = (valueRaw || "").trim();
    if (!value) return alert("Введите имя или id ящика");
    const boxes = await getBoxes(state.tabId);
    const byId = boxes.find((box) => String(box.id) === value);
    const byName =
      boxes.find((box) => box.name === value) ||
      boxes.find((box) => box.name && box.name.toLowerCase().includes(value.toLowerCase()));
    const target = byId || byName;
    if (!target) {
      return showTopAlert("Ящик не найден", "warning");
    }
    await boxesController.openBoxModal(target.id);
  };

  if (btn && input) {
    btn.addEventListener("click", async () => {
      await handleOpen(input.value);
    });
  }

  if (hiddenBtn && hiddenInput) {
    hiddenBtn.addEventListener("click", async () => {
      await handleOpen(hiddenInput.value);
    });
  }
}

function collectTagElements() {
  return {
    tagPillsContainer: document.getElementById("tagPillsContainer"),
    tagOffcanvasEl: document.getElementById("createTagOffcanvas"),
    createTagForm: document.getElementById("createTagForm"),
    tagNameInput: document.getElementById("tagName"),
    tagColorInput: document.getElementById("tagColor"),
    attachBoxTagModal: document.getElementById("attachBoxTagModal"),
    attachBoxTagForm: document.getElementById("attachBoxTagForm"),
    attachBoxTagSelect: document.getElementById("attachBoxTagSelect"),
    attachBoxIdInput: document.getElementById("attachBoxId"),
    attachBoxTagSubmit: document.getElementById("attachBoxTagSubmit"),
    attachBoxTagChips: document.getElementById("attachBoxTagChips"),
    attachItemTagModal: document.getElementById("attachItemTagModal"),
    attachItemTagForm: document.getElementById("attachItemTagForm"),
    attachItemTagSelect: document.getElementById("attachItemTagSelect"),
    attachItemIdInput: document.getElementById("attachItemId"),
    attachItemTagSubmit: document.getElementById("attachItemTagSubmit"),
    attachItemTagChips: document.getElementById("attachItemTagChips"),
    deleteTagModal: document.getElementById("deleteTagModal"),
    deleteTagName: document.getElementById("deleteTagName"),
    deleteTagBindings: document.getElementById("deleteTagBindings"),
    deleteTagConfirmBtn: document.getElementById("confirmDeleteTagBtn"),
  };
}
