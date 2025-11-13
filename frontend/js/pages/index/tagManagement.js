import {
  attachTag,
  createTag,
  deleteTag as deleteTagApi,
  detachTag,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { buildAttachedTagChips, buildTagPills } from "../../common/tagTemplates.js";
import { escapeHtml } from "../../common/dom.js";

export function createTagManager(state, { elements, onTabsChanged }) {
  state.ui.tagPillsContainer = elements.tagPillsContainer;
  state.ui.tagOffcanvasInstance = elements.tagOffcanvasEl
    ? new bootstrap.Offcanvas(elements.tagOffcanvasEl)
    : null;
  state.ui.tagNameInput = elements.tagNameInput ?? null;
  state.ui.tagColorInput = elements.tagColorInput ?? null;

  if (elements.createTagForm) {
    elements.createTagForm.addEventListener("submit", (event) =>
      handleCreateTagSubmit(event, state, onTabsChanged)
    );
  }

  if (state.ui.tagPillsContainer) {
    state.ui.tagPillsContainer.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest("[data-action='delete-tag']");
      if (!deleteBtn) return;
      const tagId = Number(deleteBtn.dataset.tagId);
      const tag = state.tagStore.getById(tagId);
      if (tag) openDeleteTagModal(state, tag);
    });
  }

  if (elements.attachModalEl) {
    state.ui.attachModalInstance = new bootstrap.Modal(elements.attachModalEl);
  }
  state.ui.attachSelectEl = elements.attachSelectEl ?? null;
  state.ui.attachTabIdInput = elements.attachTabIdInput ?? null;
  state.ui.attachSubmitBtn = elements.attachSubmitBtn ?? null;
  state.ui.attachChipsEl = elements.attachChipsEl ?? null;

  if (elements.attachFormEl) {
    elements.attachFormEl.addEventListener("submit", (event) =>
      handleAttachTagSubmit(event, state, onTabsChanged)
    );
  }

  if (elements.deleteModalEl) {
    state.ui.deleteModalInstance = new bootstrap.Modal(elements.deleteModalEl);
  }
  state.ui.deleteNameEl = elements.deleteNameEl ?? null;
  state.ui.deleteBindingsEl = elements.deleteBindingsEl ?? null;
  state.ui.deleteConfirmBtn = elements.deleteConfirmBtn ?? null;
  state.ui.deleteConfirmBtn?.addEventListener("click", () =>
    handleDeleteTagConfirm(state, onTabsChanged)
  );

  return {
    refresh: (force = false, { silent = false } = {}) => refreshTagCache(state, force, silent),
    renderPills: () => renderExistingTagPills(state),
    openAttachModal: (tab) => openAttachTagModal(state, tab, onTabsChanged),
    showCreateTagOffcanvas: async () => {
      try {
        await refreshTagCache(state);
      } catch (err) {
        console.error("Не удалось обновить тэги перед созданием", err);
      }
      renderExistingTagPills(state);
      state.ui.tagOffcanvasInstance?.show();
    },
  };
}

async function refreshTagCache(state, force = false, silent = false) {
  try {
    return await state.tagStore.refresh(force);
  } catch (err) {
    console.error("Не удалось загрузить тэги", err);
    if (!silent) {
      showTopAlert("Не удалось загрузить тэги. Попробуйте обновить страницу.", "warning", 5000);
    }
    throw err;
  }
}

function renderExistingTagPills(state) {
  const container = state.ui.tagPillsContainer;
  if (!container) return;
  const tags = state.tagStore.getAll();
  container.innerHTML = buildTagPills(tags);
}

async function handleCreateTagSubmit(event, state, onTabsChanged) {
  event.preventDefault();
  const nameInput = state.ui.tagNameInput;
  const colorInput = state.ui.tagColorInput;
  if (!nameInput) return;

  const name = nameInput.value.trim();
  const color = colorInput?.value || null;
  if (!name) return alert("Введите имя тега");

  try {
    await createTag({ name, color, box_id: null, tab_id: null, item_id: null });
    showTopAlert(`Тэг ${name} добавлен`, "success");
    state.ui.tagOffcanvasInstance?.hide();
    nameInput.value = "";
    if (colorInput) colorInput.value = "#0d6efd";
    await refreshTagCache(state, true);
    renderExistingTagPills(state);
    await onTabsChanged();
  } catch (err) {
    console.error("Не удалось создать тэг", err);
    showTopAlert(err?.message || "Не удалось создать тэг", "danger", 5000);
  }
}

function openAttachTagModal(state, tab, onTabsChanged) {
  if (!state.ui.attachModalInstance || !state.ui.attachSelectEl) {
    showTopAlert("Модалка для привязки тега недоступна", "danger");
    return;
  }

  state.attachTabContext = {
    id: tab.id,
    name: tab.name,
    tag_ids: Array.isArray(tab.tag_ids) ? tab.tag_ids.map((id) => Number(id)) : [],
  };
  if (state.ui.attachTabIdInput) state.ui.attachTabIdInput.value = tab.id;
  renderAttachTagChips(state, onTabsChanged);
  const hasOptions = populateAttachTagSelect(state);
  if (!hasOptions) {
    showTopAlert("Свободных тэгов нет — можно отвязать существующие или создать новый.", "warning");
  }
  state.ui.attachModalInstance.show();
}

function populateAttachTagSelect(state) {
  const select = state.ui.attachSelectEl;
  if (!select || !state.attachTabContext) return false;
  const usedIds = new Set(state.attachTabContext.tag_ids || []);
  const available = state.tagStore.getAll().filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    select.innerHTML = `<option value="">Нет доступных тэгов</option>`;
    select.disabled = true;
    state.ui.attachSubmitBtn?.setAttribute("disabled", "disabled");
    return false;
  }

  select.disabled = false;
  select.innerHTML = available.map((tag) => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join("");
  select.value = available[0].id;
  state.ui.attachSubmitBtn?.removeAttribute("disabled");
  return true;
}

function renderAttachTagChips(state, onTabsChanged) {
  const container = state.ui.attachChipsEl;
  if (!container) return;

  const ids = Array.isArray(state.attachTabContext?.tag_ids) ? state.attachTabContext.tag_ids : [];
  const markup = buildAttachedTagChips(ids, { tagLookup: state.tagStore.getById });
  container.innerHTML = markup;

  container.querySelectorAll("[data-remove-tag-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const tagId = Number(btn.dataset.removeTagId);
      if (!tagId) return;
      btn.disabled = true;
      try {
        await detachTagFromTab(state, tagId, onTabsChanged);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function detachTagFromTab(state, tagId, onTabsChanged) {
  if (!state.attachTabContext) return;
  try {
    await detachTag(tagId, { tab_id: state.attachTabContext.id });
    state.attachTabContext.tag_ids = state.attachTabContext.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachTagChips(state, onTabsChanged);
    populateAttachTagSelect(state);
    await refreshTagCache(state, true, true);
    await onTabsChanged();
    showTopAlert("Тэг отвязан от вкладки", "success");
  } catch (err) {
    console.error(err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

async function handleAttachTagSubmit(event, state, onTabsChanged) {
  event.preventDefault();
  if (!state.ui.attachSelectEl || !state.ui.attachTabIdInput) return;

  const tagId = Number(state.ui.attachSelectEl.value);
  const tabId = Number(state.ui.attachTabIdInput.value);
  if (!tagId || !tabId) {
    showTopAlert("Выберите тэг для привязки", "warning");
    return;
  }

  state.ui.attachSubmitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { tab_id: tabId });
    showTopAlert("Тэг успешно привязан", "success");
    if (state.attachTabContext && tabId === state.attachTabContext.id) {
      if (!state.attachTabContext.tag_ids.includes(tagId)) {
        state.attachTabContext.tag_ids.push(tagId);
      }
      renderAttachTagChips(state, onTabsChanged);
      populateAttachTagSelect(state);
    }
    await refreshTagCache(state, true, true);
    await onTabsChanged();
  } catch (err) {
    console.error(err);
    showTopAlert(err.message || "Не удалось привязать тэг", "danger");
  } finally {
    state.ui.attachSubmitBtn?.removeAttribute("disabled");
  }
}

function openDeleteTagModal(state, tag) {
  if (!state.ui.deleteModalInstance || !state.ui.deleteBindingsEl || !state.ui.deleteNameEl) return;
  state.pendingDeleteTagId = tag.id;
  state.ui.deleteNameEl.textContent = tag.name;
  const bindings = describeTagBindings(state, tag);
  state.ui.deleteBindingsEl.innerHTML = bindings.length
    ? bindings.map((item) => `<li>${item}</li>`).join("")
    : `<li class="text-muted">Тег не привязан ни к чему</li>`;
  state.ui.deleteModalInstance.show();
}

function describeTagBindings(state, tag) {
  const bindings = [];
  const tabIds = Array.isArray(tag.attached_tabs) ? tag.attached_tabs : [];
  const boxIds = Array.isArray(tag.attached_boxes) ? tag.attached_boxes : [];
  const itemIds = Array.isArray(tag.attached_items) ? tag.attached_items : [];

  tabIds.forEach((tabId) => {
    const tabName = state.latestTabsSnapshot.find((t) => t.id === tabId)?.name;
    bindings.push(`Вкладка: ${escapeHtml(tabName || `#${tabId}`)}`);
  });
  boxIds.forEach((boxId) => bindings.push(`Бокс ID: ${escapeHtml(boxId)}`));
  itemIds.forEach((itemId) => bindings.push(`Айтем ID: ${escapeHtml(itemId)}`));
  return bindings;
}

async function handleDeleteTagConfirm(state, onTabsChanged) {
  if (!state.pendingDeleteTagId) return;
  state.ui.deleteConfirmBtn?.setAttribute("disabled", "disabled");
  try {
    await deleteTagApi(state.pendingDeleteTagId);
    showTopAlert("Тэг удалён", "success");
    state.ui.deleteModalInstance?.hide();
    await refreshTagCache(state, true);
    renderExistingTagPills(state);
    await onTabsChanged();
  } catch (err) {
    console.error(err);
    showTopAlert(err.message || "Не удалось удалить тэг", "danger");
  } finally {
    state.pendingDeleteTagId = null;
    state.ui.deleteConfirmBtn?.removeAttribute("disabled");
  }
}
