import {
  attachTag,
  createTag,
  deleteTag as deleteTagApi,
  detachTag,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { buildAttachedTagChips, buildTagPills } from "../../common/tagTemplates.js";
import { escapeHtml } from "../../common/dom.js";

export function createTabTagManager(state, { boxesController, elements }) {
  assignUiRefs(state, elements);

  elements.createTagForm?.addEventListener("submit", (event) =>
    handleCreateTagSubmit(event, state, boxesController)
  );

  if (state.ui.tagPillsContainer) {
    state.ui.tagPillsContainer.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest("[data-action='delete-tag']");
      if (!deleteBtn) return;
      const tagId = Number(deleteBtn.dataset.tagId);
      const tag = state.tagStore.getById(tagId);
      if (tag) openDeleteTagModal(state, tag);
    });
  }

  elements.attachBoxTagForm?.addEventListener("submit", (event) =>
    handleAttachBoxTagSubmit(event, state, boxesController)
  );
  elements.attachItemTagForm?.addEventListener("submit", (event) =>
    handleAttachItemTagSubmit(event, state, boxesController)
  );
  state.ui.deleteTagConfirmBtn?.addEventListener("click", () =>
    handleDeleteTagConfirm(state, boxesController)
  );

  return {
    refresh: (force = false, { silent = false } = {}) => refreshTagCache(state, force, silent),
    renderPills: () => renderExistingTagPills(state),
    openAttachBoxTagModal: (box) => openAttachBoxTagModal(state, boxesController, box),
    openAttachItemTagModal: (item) => openAttachItemTagModal(state, boxesController, item),
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

function assignUiRefs(state, elements) {
  state.ui.tagPillsContainer = elements.tagPillsContainer ?? null;
  state.ui.tagOffcanvasInstance = elements.tagOffcanvasEl
    ? new bootstrap.Offcanvas(elements.tagOffcanvasEl)
    : null;
  state.ui.createTagForm = elements.createTagForm ?? null;
  state.ui.tagNameInput = elements.tagNameInput ?? null;
  state.ui.tagColorInput = elements.tagColorInput ?? null;

  if (elements.attachBoxTagModal) {
    state.ui.attachBox.modalInstance = new bootstrap.Modal(elements.attachBoxTagModal);
  }
  state.ui.attachBox.selectEl = elements.attachBoxTagSelect ?? null;
  state.ui.attachBox.idInput = elements.attachBoxIdInput ?? null;
  state.ui.attachBox.submitBtn = elements.attachBoxTagSubmit ?? null;
  state.ui.attachBox.chipsEl = elements.attachBoxTagChips ?? null;

  if (elements.attachItemTagModal) {
    state.ui.attachItem.modalInstance = new bootstrap.Modal(elements.attachItemTagModal);
  }
  state.ui.attachItem.selectEl = elements.attachItemTagSelect ?? null;
  state.ui.attachItem.idInput = elements.attachItemIdInput ?? null;
  state.ui.attachItem.submitBtn = elements.attachItemTagSubmit ?? null;
  state.ui.attachItem.formEl = elements.attachItemTagForm ?? null;
  state.ui.attachItem.chipsEl = elements.attachItemTagChips ?? null;

  if (elements.deleteTagModal) {
    state.ui.deleteTagModalInstance = new bootstrap.Modal(elements.deleteTagModal);
  }
  state.ui.deleteTagNameEl = elements.deleteTagName ?? null;
  state.ui.deleteTagBindingsEl = elements.deleteTagBindings ?? null;
  state.ui.deleteTagConfirmBtn = elements.deleteTagConfirmBtn ?? null;
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
  container.innerHTML = buildTagPills(state.tagStore.getAll());
}

async function handleCreateTagSubmit(event, state, boxesController) {
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
    await boxesController.renderBoxes();
  } catch (err) {
    console.error("Не удалось создать тэг", err);
    showTopAlert(err?.message || "Не удалось создать тэг", "danger", 5000);
  }
}

async function openAttachBoxTagModal(state, boxesController, box) {
  if (!state.ui.attachBox.modalInstance || !state.ui.attachBox.selectEl) {
    showTopAlert("Модалка для привязки тега недоступна", "danger");
    return;
  }

  state.contexts.attachBox = {
    id: box.id,
    name: box.name,
    tag_ids: Array.isArray(box.tag_ids) ? box.tag_ids.map((id) => Number(id)) : [],
  };
  if (state.ui.attachBox.idInput) state.ui.attachBox.idInput.value = box.id;
  renderAttachBoxTagChips(state, boxesController);
  const hasOptions = populateBoxTagSelect(state);
  if (!hasOptions) {
    showTopAlert("Свободных тэгов нет — можно отвязать существующие или создать новый.", "warning");
  }
  const modalTitle = document.querySelector("#attachBoxTagModal .modal-title");
  if (modalTitle) modalTitle.textContent = `Привязать тэг к "${box.name || box.id}"`;
  state.ui.attachBox.modalInstance.show();
}

function populateBoxTagSelect(state) {
  const select = state.ui.attachBox.selectEl;
  if (!select || !state.contexts.attachBox) return false;
  const usedIds = new Set(state.contexts.attachBox.tag_ids || []);
  const available = state.tagStore.getAll().filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    select.innerHTML = `<option value="">Нет доступных тэгов</option>`;
    select.disabled = true;
    state.ui.attachBox.submitBtn?.setAttribute("disabled", "disabled");
    return false;
  }

  select.disabled = false;
  select.innerHTML = available.map((tag) => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join("");
  select.value = available[0].id;
  state.ui.attachBox.submitBtn?.removeAttribute("disabled");
  return true;
}

async function handleAttachBoxTagSubmit(event, state, boxesController) {
  event.preventDefault();
  const tagId = Number(state.ui.attachBox.selectEl?.value);
  const boxId = Number(state.ui.attachBox.idInput?.value);
  if (!tagId || !boxId) {
    return showTopAlert("Выберите тэг и ящик", "warning");
  }

  state.ui.attachBox.submitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { box_id: boxId });
    showTopAlert("Тэг привязан к ящику", "success");
    if (state.contexts.attachBox && boxId === state.contexts.attachBox.id) {
      if (!state.contexts.attachBox.tag_ids.includes(tagId)) {
        state.contexts.attachBox.tag_ids.push(tagId);
      }
      renderAttachBoxTagChips(state, boxesController);
      populateBoxTagSelect(state);
    }
    await refreshTagCache(state, true, true);
    renderExistingTagPills(state);
    await boxesController.renderBoxes();
    if (state.currentBoxViewBoxId === boxId) {
      await boxesController.openBoxModal(boxId);
    }
  } catch (err) {
    console.error("Attach tag error:", err);
    const message = err?.message || "Не удалось привязать тэг";
    showTopAlert(message, "danger");
  } finally {
    state.ui.attachBox.submitBtn?.removeAttribute("disabled");
  }
}

async function renderAttachBoxTagChips(state, boxesController) {
  const container = state.ui.attachBox.chipsEl;
  if (!container) return;
  const ids = Array.isArray(state.contexts.attachBox?.tag_ids) ? state.contexts.attachBox.tag_ids : [];
  container.innerHTML = buildAttachedTagChips(ids, { tagLookup: state.tagStore.getById });

  container.querySelectorAll("[data-remove-tag-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const tagId = Number(btn.dataset.removeTagId);
      if (!tagId) return;
      btn.disabled = true;
      try {
        await detachTagFromBox(state, boxesController, tagId);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function detachTagFromBox(state, boxesController, tagId) {
  if (!state.contexts.attachBox) return;
  try {
    await detachTag(tagId, { box_id: state.contexts.attachBox.id });
    state.contexts.attachBox.tag_ids = state.contexts.attachBox.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachBoxTagChips(state, boxesController);
    populateBoxTagSelect(state);
    await refreshTagCache(state, true, true);
    renderExistingTagPills(state);
    await boxesController.renderBoxes();
    if (state.currentBoxViewBoxId === state.contexts.attachBox.id) {
      await boxesController.openBoxModal(state.contexts.attachBox.id);
    }
    showTopAlert("Тэг отвязан от ящика", "success");
  } catch (err) {
    console.error("Detach tag error:", err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

async function openAttachItemTagModal(state, boxesController, item) {
  await refreshTagCache(state);
  if (!state.tagStore.getAll().length) {
    showTopAlert("Нет доступных тэгов — создайте тэг перед привязкой", "warning");
    return;
  }
  state.contexts.attachItem = {
    id: item.id,
    name: item.name,
    box_id: item.box_id,
    tag_ids: Array.isArray(item.tag_ids) ? item.tag_ids.map((id) => Number(id)) : [],
  };
  populateItemTagSelect(state);
  renderAttachItemTagChips(state, boxesController);
  if (state.ui.attachItem.idInput) state.ui.attachItem.idInput.value = item.id;
  if (state.ui.attachItem.formEl) state.ui.attachItem.formEl.dataset.boxId = item.box_id || "";
  const modalTitle = document.querySelector("#attachItemTagModal .modal-title");
  if (modalTitle) modalTitle.textContent = `Привязать тэг к "${item.name || item.id}"`;
  state.ui.attachItem.modalInstance?.show();
}

function populateItemTagSelect(state) {
  const select = state.ui.attachItem.selectEl;
  if (!select || !state.contexts.attachItem) return;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Выберите тэг";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  const usedIds = new Set(state.contexts.attachItem.tag_ids || []);
  const available = state.tagStore.getAll().filter((tag) => !usedIds.has(tag.id));

  if (!available.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет доступных тэгов";
    select.appendChild(option);
    select.disabled = true;
    state.ui.attachItem.submitBtn?.setAttribute("disabled", "disabled");
    return;
  }

  select.disabled = false;
  state.ui.attachItem.submitBtn?.removeAttribute("disabled");
  available.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag.id;
    option.textContent = tag.name;
    select.appendChild(option);
  });
  select.value = available[0].id;
}

async function handleAttachItemTagSubmit(event, state, boxesController) {
  event.preventDefault();
  const tagId = Number(state.ui.attachItem.selectEl?.value);
  const itemId = Number(state.ui.attachItem.idInput?.value);
  if (!tagId || !itemId) {
    return showTopAlert("Выберите тэг и айтем", "warning");
  }

  state.ui.attachItem.submitBtn?.setAttribute("disabled", "disabled");
  try {
    await attachTag(tagId, { item_id: itemId });
    showTopAlert("Тэг привязан к айтему", "success");
    if (state.contexts.attachItem && itemId === state.contexts.attachItem.id) {
      if (!state.contexts.attachItem.tag_ids.includes(tagId)) {
        state.contexts.attachItem.tag_ids.push(tagId);
      }
      renderAttachItemTagChips(state, boxesController);
      populateItemTagSelect(state);
    }
    await refreshTagCache(state, true, true);
    renderExistingTagPills(state);
    const boxId =
      state.ui.attachItem.formEl?.dataset.boxId || state.contexts.attachItem?.box_id || state.currentBoxViewBoxId;
    if (boxId) {
      await boxesController.openBoxModal(Number(boxId));
    } else {
      await boxesController.renderBoxes();
    }
    if (state.ui.attachItem.formEl) state.ui.attachItem.formEl.dataset.boxId = "";
  } catch (err) {
    console.error("Attach tag error:", err);
    const message = err?.message || "Не удалось привязать тэг";
    showTopAlert(message, "danger");
  } finally {
    state.ui.attachItem.submitBtn?.removeAttribute("disabled");
  }
}

function renderAttachItemTagChips(state, boxesController) {
  const container = state.ui.attachItem.chipsEl;
  if (!container) return;
  const ids = Array.isArray(state.contexts.attachItem?.tag_ids) ? state.contexts.attachItem.tag_ids : [];
  container.innerHTML = buildAttachedTagChips(ids, { tagLookup: state.tagStore.getById });

  container.querySelectorAll("[data-remove-tag-id]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const tagId = Number(btn.dataset.removeTagId);
      if (!tagId) return;
      btn.disabled = true;
      try {
        await detachTagFromItem(state, boxesController, tagId);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function detachTagFromItem(state, boxesController, tagId) {
  if (!state.contexts.attachItem) return;
  try {
    await detachTag(tagId, { item_id: state.contexts.attachItem.id });
    state.contexts.attachItem.tag_ids = state.contexts.attachItem.tag_ids.filter(
      (id) => Number(id) !== Number(tagId)
    );
    renderAttachItemTagChips(state, boxesController);
    populateItemTagSelect(state);
    await refreshTagCache(state, true, true);
    renderExistingTagPills(state);
    const boxId = state.contexts.attachItem.box_id || state.currentBoxViewBoxId;
    if (boxId) {
      await boxesController.openBoxModal(Number(boxId));
    } else {
      await boxesController.renderBoxes();
    }
    showTopAlert("Тэг отвязан от айтема", "success");
  } catch (err) {
    console.error("Detach tag error:", err);
    showTopAlert(err?.message || "Не удалось отвязать тэг", "danger");
  }
}

function openDeleteTagModal(state, tag) {
  if (!state.ui.deleteTagModalInstance || !state.ui.deleteTagBindingsEl || !state.ui.deleteTagNameEl) return;
  state.pendingDeleteTagId = tag.id;
  state.ui.deleteTagNameEl.textContent = tag.name;
  const bindings = describeTagBindings(state, tag);
  state.ui.deleteTagBindingsEl.innerHTML = bindings.length
    ? bindings.map((item) => `<li>${item}</li>`).join("")
    : `<li class="text-muted">Тэг не привязан ни к чему</li>`;
  state.ui.deleteTagModalInstance.show();
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

  boxIds.forEach((boxId) => {
    const box = state.boxesById.get(Number(boxId));
    const label = box?.name ? `${box.name} (#${boxId})` : `#${boxId}`;
    bindings.push(`Ящик: ${escapeHtml(label)}`);
  });

  itemIds.forEach((itemId) => {
    bindings.push(`Айтем ID: ${escapeHtml(itemId)}`);
  });

  return bindings;
}

async function handleDeleteTagConfirm(state, boxesController) {
  if (!state.pendingDeleteTagId) return;
  state.ui.deleteTagConfirmBtn?.setAttribute("disabled", "disabled");
  try {
    await deleteTagApi(state.pendingDeleteTagId);
    showTopAlert("Тэг удалён", "success");
    state.ui.deleteTagModalInstance?.hide();
    await refreshTagCache(state, true);
    renderExistingTagPills(state);
    await boxesController.renderBoxes();
  } catch (err) {
    console.error("Не удалось удалить тэг", err);
    showTopAlert(err?.message || "Не удалось удалить тэг", "danger");
  } finally {
    state.pendingDeleteTagId = null;
    state.ui.deleteTagConfirmBtn?.removeAttribute("disabled");
  }
}
