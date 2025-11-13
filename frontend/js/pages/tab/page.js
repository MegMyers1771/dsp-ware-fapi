import { showTopAlert } from "../../common/alerts.js";
import { createBoxesController } from "./boxes.js";
import { createTabState } from "./state.js";
import { createTabTagManager } from "./tagManagement.js";
import { fetchTabs, getBoxes } from "../../api.js";

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
    searchFiltersModal: document.getElementById("searchFiltersModal"),
    searchFiltersForm: document.getElementById("searchFiltersForm"),
    searchFiltersFields: document.getElementById("searchFiltersFields"),
    searchFiltersResetBtn: document.getElementById("searchFiltersResetBtn"),
  });

  const tagManager = createTabTagManager(state, {
    boxesController,
    elements: collectTagElements(),
  });
  boxesController.registerTagManager(tagManager);

  await initializeTabMeta(state);
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

function setupQuickActions(tagManager) {
  const ddAdd = document.getElementById("dropdown-add-box");
  if (ddAdd) {
    ddAdd.addEventListener("click", (event) => {
      event.preventDefault();
      new bootstrap.Modal(document.getElementById("addBoxModal")).show();
    });
  }

  const ddTag = document.getElementById("dropdown-create-tag");
  if (ddTag) {
    ddTag.addEventListener("click", async (event) => {
      event.preventDefault();
      await tagManager.showCreateTagOffcanvas();
    });
  }
}

function setupBoxForm(boxesController) {
  document.getElementById("addBoxForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("boxName").value.trim();
    const description = document.getElementById("boxDescription").value.trim();
    if (!name) return;

    try {
      await boxesController.createBox(name, description);
      showTopAlert("Ящик создан", "success");
      bootstrap.Modal.getInstance(document.getElementById("addBoxModal"))?.hide();
      document.getElementById("addBoxForm").reset();
      await boxesController.renderBoxes();
    } catch (err) {
      console.error("Не удалось создать ящик", err);
      showTopAlert(err?.message || "Не удалось создать ящик", "danger", 5000);
    }
  });
}

function setupSearch(state, boxesController) {
  document.getElementById("searchBtn")?.addEventListener("click", async () => {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) return;
    await boxesController.handleSearch(query);
  });

  document.getElementById("openFiltersBtn")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await boxesController.openSearchFilters();
  });
}

function setupOpenBoxShortcut(state, boxesController) {
  const btn = document.getElementById("openBoxBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const value = document.getElementById("openBoxInput").value.trim();
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
  });
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
