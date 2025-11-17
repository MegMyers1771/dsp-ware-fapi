import { showTopAlert } from "../../common/alerts.js";
import { setupFieldControls } from "./fields.js";
import { createTagManager } from "./tagManagement.js";
import { createTabsTable } from "./tabsTable.js";
import { initTabActions, openEditTabModal, openTabSyncModal } from "./tabActions.js";
import { initStatusActions } from "./statusActions.js";
import { createIndexState } from "./state.js";

export async function bootstrapIndexPage() {
  const state = createIndexState();
  setupFieldControls();

  let tagManager;
  const tabsTable = createTabsTable(state, {
    onAttachTag: (tab) => tagManager?.openAttachModal(tab),
    onEditTab: (tab) => openEditTabModal(tab),
    onSyncTab: (tab) => openTabSyncModal(tab, { onTabsChanged: () => tabsTable.render() }),
  });

  tagManager = createTagManager(state, {
    elements: collectElements(),
    onTabsChanged: () => tabsTable.render(),
  });

  initTabActions({
    onTabsChanged: () => tabsTable.render(),
  });
  initStatusActions();

  wireQuickActions(tagManager);

  try {
    await tagManager.refresh(true, { silent: true });
  } catch (err) {
    console.warn("Initial tag load failed", err);
  }
  tagManager.renderPills();
  await tabsTable.render();
}

function collectElements() {
  return {
    tagPillsContainer: document.getElementById("tagPillsContainer"),
    tagOffcanvasEl: document.getElementById("createTagOffcanvas"),
    createTagForm: document.getElementById("createTagForm"),
    tagNameInput: document.getElementById("tagName"),
    tagColorInput: document.getElementById("tagColor"),
    attachModalEl: document.getElementById("attachTagModal"),
    attachFormEl: document.getElementById("attachTagForm"),
    attachSelectEl: document.getElementById("attachTagSelect"),
    attachTabIdInput: document.getElementById("attachTagTabId"),
    attachSubmitBtn: document.getElementById("attachTagSubmit"),
    attachChipsEl: document.getElementById("attachTabTagChips"),
    deleteModalEl: document.getElementById("deleteTagModal"),
    deleteNameEl: document.getElementById("deleteTagName"),
    deleteBindingsEl: document.getElementById("deleteTagBindings"),
    deleteConfirmBtn: document.getElementById("confirmDeleteTagBtn"),
  };
}

function wireQuickActions(tagManager) {
  const ddNew = document.getElementById("dropdown-new-tab");
  if (ddNew) {
    ddNew.addEventListener("click", (event) => {
      event.preventDefault();
      const modal = document.getElementById("createTabModal");
      if (!modal) return showTopAlert("Модалка создания вкладки не найдена", "danger");
      new bootstrap.Modal(modal).show();
    });
  }

  const ddTag = document.getElementById("dropdown-create-tag");
  if (ddTag) {
    ddTag.addEventListener("click", async (event) => {
      event.preventDefault();
      await tagManager.showCreateTagOffcanvas();
    });
  }

  const historyBtn = document.getElementById("dropdown-check-history");
  if (historyBtn) {
    historyBtn.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "/history";
    });
  }

  const parserBtn = document.getElementById("dropdown-open-parser");
  if (parserBtn) {
    parserBtn.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "/parser";
    });
  }
}
