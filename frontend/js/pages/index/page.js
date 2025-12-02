import { showTopAlert } from "../../common/alerts.js";
import { fetchTabs, getBoxes, getItemsByBox, getTabFields } from "../../api.js";
import { escapeHtml } from "../../common/dom.js";
import { renderTagFillCell } from "../../common/tagTemplates.js";
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
  wireAdvancedMode(state, tagManager);

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

function wireAdvancedMode(state, tagManager) {
  const btn = document.getElementById("advancedModeBtn");
  const wrapper = document.getElementById("advancedModeWrapper");
  const tabsTableContainer = document.getElementById("tabsTableContainer");
  if (!btn || !wrapper) return;

  const trigger = async () => {
    if (tabsTableContainer) {
      tabsTableContainer.classList.add("d-none");
    }
    const refreshBtn = document.getElementById("advancedRefreshBtn");
    refreshBtn?.setAttribute("disabled", "disabled");
    await renderAdvancedMode(state, tagManager);
    refreshBtn?.removeAttribute("disabled");
  };

  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    const confirmed = confirm(
      "При активации расширенного режима будет идти подгрузка данных из БД. Может занять некоторое время. Продолжить?"
    );
    if (!confirmed) return;
    await trigger();
  });

  const refreshBtn = document.getElementById("advancedRefreshBtn");
  refreshBtn?.addEventListener("click", async () => {
    await trigger();
  });

  window.__openAdvancedMode = trigger;

  const params = new URLSearchParams(window.location.search);
  if (params.get("advanced") === "1" || params.has("advanced")) {
    trigger();
  }
}

let advancedLoading = false;

async function renderAdvancedMode(state, tagManager) {
  if (advancedLoading) return;
  advancedLoading = true;

  const wrapper = document.getElementById("advancedModeWrapper");
  const navEl = document.getElementById("advancedTabsNav");
  const contentEl = document.getElementById("advancedTabsContent");
  const messageEl = document.getElementById("advancedModeMessage");
  const progressEl = document.getElementById("advancedProgress");
  const progressLabelEl = document.getElementById("advancedProgressLabel");
  if (!wrapper || !navEl || !contentEl || !messageEl || !progressEl || !progressLabelEl) {
    advancedLoading = false;
    return;
  }

  wrapper.classList.remove("d-none");
  navEl.innerHTML = "";
  contentEl.innerHTML = "";
  messageEl.textContent = "Загружаем вкладки...";
  setProgress(progressEl, progressLabelEl, 0, "");

  try {
    await tagManager?.refresh(true, { silent: true });
  } catch (err) {
    console.warn("Не удалось обновить тэги перед загрузкой расширенного режима", err);
  }

  let tabs;
  try {
    tabs = await fetchTabs();
  } catch (err) {
    console.error("Не удалось загрузить вкладки для расширенного режима", err);
    messageEl.textContent = "Не удалось загрузить вкладки";
    setProgress(progressEl, progressLabelEl, 0, "Ошибка");
    advancedLoading = false;
    return;
  }

  if (!tabs || !tabs.length) {
    messageEl.textContent = "Вкладок нет";
    setProgress(progressEl, progressLabelEl, 100, "0 / 0");
    advancedLoading = false;
    return;
  }

  messageEl.textContent = "Загружаем ящики и айтемы...";
  const totalTabs = tabs.length;
  let completedTabs = 0;

  for (const [index, tab] of tabs.entries()) {
    const paneId = `advanced-pane-${tab.id}`;
    const navItem = document.createElement("li");
    navItem.className = "nav-item";
    navItem.role = "presentation";
    navItem.innerHTML = `<a class="nav-link${index === 0 ? " active" : ""}" data-bs-toggle="tab" href="#${paneId}" aria-selected="${
      index === 0 ? "true" : "false"
    }" role="tab">${escapeHtml(tab.name || `Вкладка ${tab.id}`)}</a>`;
    navEl.appendChild(navItem);

    const pane = document.createElement("div");
    pane.className = `tab-pane fade${index === 0 ? " show active" : ""}`;
    pane.id = paneId;
    pane.role = "tabpanel";
    pane.innerHTML = `<div class="text-muted">Загрузка ящиков...</div>`;
    contentEl.appendChild(pane);

    let boxes = [];
    let tabFields = [];
    try {
      [boxes, tabFields] = await Promise.all([getBoxes(tab.id), getTabFields(tab.id)]);
    } catch (err) {
      console.error("Не удалось получить ящики вкладки", tab.id, err);
      pane.innerHTML = `<div class="text-danger small">Не удалось загрузить ящики вкладки</div>`;
      completedTabs++;
      setProgress(progressEl, progressLabelEl, (completedTabs / totalTabs) * 100, `${completedTabs} / ${totalTabs}`);
      continue;
    }

    const itemsByBox = {};
    for (const box of boxes) {
      try {
        itemsByBox[box.id] = (await getItemsByBox(box.id)) || [];
      } catch (err) {
        console.error("Не удалось загрузить айтемы ящика", box.id, err);
        itemsByBox[box.id] = [];
      }
    }

    if (!boxes.length) {
      pane.innerHTML = `<div class="text-muted">Ящиков нет</div>`;
    } else {
      pane.innerHTML = buildAdvancedBoxesTable(boxes, itemsByBox, tabFields, state);
    }

    completedTabs++;
    setProgress(progressEl, progressLabelEl, (completedTabs / totalTabs) * 100, `${completedTabs} / ${totalTabs}`);
  }

  messageEl.textContent = "Данные загружены";
  advancedLoading = false;
}

function setProgress(progressEl, labelEl, value, label) {
  const safeValue = Math.min(100, Math.max(0, Math.round(value)));
  progressEl.style.width = `${safeValue}%`;
  labelEl.textContent = label;
}

function buildAdvancedBoxesTable(boxes, itemsByBox, tabFields, state) {
  if (!boxes.length) {
    return `<div class="text-muted">Ящиков нет</div>`;
  }

  const itemFieldNames = (tabFields || []).map((f) => f?.name).filter(Boolean);
  const parts = [];

  boxes.forEach((box) => {
    const items = itemsByBox[box.id] || [];
    const hasSerialColumn = items.some((item) => Boolean(normalizeSerials(item.serial_number)));

    const boxHeaders = [
      '<th style="width:140px">Тэги</th>',
      "<th>Название</th>",
      "<th>Описание</th>",
      '<th style="width:140px" class="text-center">Кол-во</th>',
    ];

    const itemHeaders = ['<th style="width:140px">Тэги</th>', "<th>Название</th>"];
    if (hasSerialColumn) {
      itemHeaders.push('<th style="width:160px" class="text-center">Серийный номер</th>');
    }
    itemHeaders.push('<th style="width:120px" class="text-center">Кол-во</th>');
    itemFieldNames.forEach((name) => itemHeaders.push(`<th>${escapeHtml(name)}</th>`));

    const capacity = Number.isFinite(box.capacity) ? box.capacity : null;
    const capacityLabel = capacity ? `${items.length} / ${capacity}` : `${items.length}`;

    parts.push(`
      <div class="table-responsive mb-2">
        <table class="table table-hover table-sm advanced-table">
          <thead class="table-light">
            <tr>${boxHeaders.join("")}</tr>
          </thead>
          <tbody>
            <tr class="table-secondary">
              <td class="tag-fill-cell">${renderTagFillCell(box.tag_ids, { tagLookup: state.tagStore.getById, emptyText: "Нет" })}</td>
              <td>${escapeHtml(box.name || `Ящик #${box.id}`)}</td>
              <td>${escapeHtml(box.description || "")}</td>
              <td class="text-center">${escapeHtml(capacityLabel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `);

    const colCount = itemHeaders.length;
    if (items.length === 0) {
      parts.push(`<div class="text-muted mb-4">Айтемов нет</div>`);
      return;
    }

    const itemRows = items
      .map((item) => {
        const meta = item.metadata_json || item.metadata || {};
        const serials = normalizeSerials(item.serial_number);
        const qty = Number.isFinite(item.qty) ? item.qty : item.qty ?? "";
        return `
          <tr class="table-active">
            <td class="tag-fill-cell">${renderTagFillCell(item.tag_ids, { tagLookup: state.tagStore.getById, emptyText: "—" })}</td>
            <td>${escapeHtml(item.name || item.item_name || `Айтем #${item.id}`)}</td>
            ${hasSerialColumn ? `<td class="text-center">${escapeHtml(serials || "")}</td>` : ""}
            <td class="text-center">${escapeHtml(qty)}</td>
            ${itemFieldNames.map((key) => `<td>${escapeHtml(meta?.[key] ?? "")}</td>`).join("")}
          </tr>
        `;
      })
      .join("");

    parts.push(`
      <div class="table-responsive mb-4">
        <table class="table table-hover table-sm advanced-table">
          <thead class="table-light">
            <tr>${itemHeaders.join("")}</tr>
          </thead>
          <tbody>
            ${itemRows || `<tr><td colspan="${colCount}" class="text-muted">Айтемов нет</td></tr>`}
          </tbody>
        </table>
      </div>
    `);
  });

  return parts.join("");
}

function normalizeSerials(serialsRaw) {
  if (Array.isArray(serialsRaw)) {
    return serialsRaw.map((val) => String(val || "").trim()).filter(Boolean).join(", ");
  }
  if (serialsRaw == null) return "";
  return String(serialsRaw)
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean)
    .join(", ");
}
