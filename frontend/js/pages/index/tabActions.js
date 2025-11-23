import {
  createTab,
  createTabField as apiCreateTabField,
  deleteTabField as apiDeleteTabField,
  fetchParserEnv,
  fetchSyncWorkerStatus,
  fetchTabSyncSettings,
  getBoxes,
  getItemsByBox,
  getTabFields,
  listParserConfigs,
  updateParserEnv,
  updateTab,
  updateTabField as apiUpdateTabField,
  updateTabSyncSettings,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";
import { addFieldRow, collectFields } from "./fields.js";

const syncModalState = {
  modal: null,
  form: null,
  enableSwitch: null,
  configSelect: null,
  spreadsheetInput: null,
  submitBtn: null,
  tabNameEl: null,
  currentTab: null,
  onTabsChanged: null,
  workerWarningEl: null,
  workerOnline: null,
  workerAlertShown: false,
};

export function initTabActions({ onTabsChanged }) {
  document.getElementById("createTabForm")?.addEventListener("submit", (event) =>
    handleCreateTab(event, onTabsChanged)
  );
  document.getElementById("editTabForm")?.addEventListener("submit", (event) =>
    handleEditTab(event, onTabsChanged)
  );
  initSyncModal(onTabsChanged);
}

async function handleCreateTab(event, onTabsChanged) {
  event.preventDefault();
  const nameInput = document.getElementById("tabName");
  const enablePosInput = document.getElementById("tabEnablePos");
  if (!nameInput) return;
  const name = nameInput.value.trim();
  const enablePos = enablePosInput?.checked ?? true;
  if (!name) return alert("Введите имя вкладки");

  let tab;
  try {
    tab = await createTab({
      name,
      description: "",
      tag_ids: [],
      enable_pos: enablePos,
    });
  } catch (err) {
    console.error("Не удалось создать вкладку", err);
    showTopAlert(err?.message || "Не удалось создать вкладку", "danger", 5000);
    return;
  }

  const container = document.getElementById("fieldsContainer");
  const fields = collectFields(container);

  for (const field of fields) {
    if (!field.name) return alert("Каждое поле должно иметь имя");
    if (field.allowed_values_raw && field.allowed_values.length === 0) {
      return alert("Некорректный формат списка значений: используйте 'val1, val2'");
    }
  }

  await Promise.all(
    fields.map((field) =>
      apiCreateTabField({
        name: field.name,
        allowed_values: field.allowed_values,
        tab_id: tab.id,
        strong: !!field.strong,
      })
    )
  );

  nameInput.value = "";
  container.innerHTML = "";
  if (enablePosInput) enablePosInput.checked = true;
  bootstrap.Modal.getInstance(document.getElementById("createTabModal"))?.hide();
  await onTabsChanged();
}

async function handleEditTab(event, onTabsChanged) {
  event.preventDefault();
  const id = document.getElementById("editTabId")?.value;
  const nameInput = document.getElementById("editTabName");
  const name = nameInput?.value.trim();
  const enablePos = document.getElementById("editEnablePos")?.checked ?? true;
  const container = document.getElementById("editFieldsContainer");
  if (!id) return;

  if (!name) {
    showTopAlert("Введите название вкладки", "danger");
    return;
  }

  const fields = collectFields(container);
  for (const field of fields) {
    if (!field.name) {
      showTopAlert("Каждое поле должно иметь имя", "danger");
      return;
    }
    if (field.allowed_values_raw && field.allowed_values.length === 0) {
      showTopAlert("Некорректный список значений: используйте формат 'v1, v2'", "danger");
      return;
    }
  }

  const originalIds = parseOriginalFieldIds(container?.dataset?.originalFieldIds);
  const persistedIds = new Set();

  try {
    await updateTab(id, { name, enable_pos: enablePos });

    for (const field of fields) {
      if (field.id) {
        persistedIds.add(field.id);
        await apiUpdateTabField(field.id, {
          name: field.name,
          allowed_values: field.allowed_values,
          strong: !!field.strong,
        });
      } else {
        const created = await apiCreateTabField({
          tab_id: Number(id),
          name: field.name,
          allowed_values: field.allowed_values,
          strong: !!field.strong,
        });
        if (created?.id) {
          persistedIds.add(created.id);
        }
      }
    }

    for (const previousId of originalIds) {
      if (!persistedIds.has(previousId)) {
        await apiDeleteTabField(previousId);
      }
    }
  } catch (err) {
    console.error("Ошибка обновления вкладки", err);
    showTopAlert(err?.message || "Не удалось обновить вкладку", "danger");
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById("editTabModal"))?.hide();
  showTopAlert("Вкладка обновлена", "success");
  await onTabsChanged();
}

export async function openEditTabModal(tab) {
  document.getElementById("editTabId").value = tab.id;
  document.getElementById("editTabName").value = tab.name;
  const modalTitle = document.querySelector("#editTabModal .modal-title");
  if (modalTitle) {
    modalTitle.textContent = `Редактирование «${tab.name}»`;
  }
  const editEnablePosEl = document.getElementById("editEnablePos");
  if (editEnablePosEl) {
    editEnablePosEl.checked = tab.enable_pos !== false;
  }
  const container = document.getElementById("editFieldsContainer");
  if (!container) return;
  container.innerHTML = "Загрузка...";

  const fields = await getTabFields(tab.id);
  const usedMap = await fieldsUsedMap(tab.id, fields);

  container.innerHTML = "";
  const initialIds = fields
    .map((f) => (f?.id !== undefined ? Number(f.id) : null))
    .filter((val) => Number.isFinite(val));
  container.dataset.originalFieldIds = JSON.stringify(initialIds);
  fields.forEach((field) => {
    const row = addFieldRow(container, {
      id: field.id,
      stable_key: field.stable_key,
      name: field.name,
      allowed_values: field.allowed_values || [],
      strong: field.strong,
    });
    if (!row) return;
    if (usedMap[field.id]) {
      lockFieldRow(row);
    }
  });

  new bootstrap.Modal(document.getElementById("editTabModal")).show();
}

export async function openTabSyncModal(tab, { onTabsChanged } = {}) {
  if (!syncModalState.modal) {
    initSyncModal(onTabsChanged);
  }
  if (!syncModalState.modal) {
    showTopAlert("Модалка синхронизации недоступна", "danger");
    return;
  }
  if (onTabsChanged) {
    syncModalState.onTabsChanged = onTabsChanged;
  }
  syncModalState.currentTab = tab;
  syncModalState.tabNameEl.textContent = `Синхронизация «${tab.name}»`;
  syncModalState.submitBtn?.setAttribute("disabled", "disabled");
  syncModalState.configSelect?.classList.remove("is-invalid");

  try {
    const [settings, env, configs, workerStatus] = await Promise.all([
      fetchTabSyncSettings(tab.id),
      fetchParserEnv(),
      listParserConfigs(),
      fetchSyncWorkerStatus().catch((err) => {
        console.warn("Не удалось проверить статус воркера синхронизации", err);
        return null;
      }),
    ]);
    renderSyncConfigOptions(configs, settings.config_name);
    updateSyncWorkerWarning(workerStatus?.rq_worker_online);
    if (syncModalState.enableSwitch) {
      syncModalState.enableSwitch.checked = !!settings.enable_sync;
    }
    if (syncModalState.configSelect) {
      syncModalState.configSelect.value = settings.config_name || "";
    }
    if (syncModalState.spreadsheetInput) {
      syncModalState.spreadsheetInput.value = env.spreadsheet_id || "";
      syncModalState.spreadsheetInput.dataset.initialValue = env.spreadsheet_id || "";
    }
    syncModalState.submitBtn?.removeAttribute("disabled");
    syncModalState.modal.show();
  } catch (err) {
    syncModalState.submitBtn?.removeAttribute("disabled");
    console.error("Не удалось загрузить настройки синхронизации", err);
    showTopAlert(err?.message || "Не удалось загрузить настройки синхронизации", "danger");
  }
}

function lockFieldRow(row) {
  row.dataset.locked = "1";
  const removeBtn = row.querySelector(".remove-field");
  if (removeBtn) {
    removeBtn.disabled = true;
    removeBtn.classList.add("disabled");
    removeBtn.setAttribute("title", "Нельзя удалить поле с существующими значениями");
  }
  if (!row.querySelector(".field-lock-badge")) {
    const badge = document.createElement("div");
    badge.className = "small text-warning mt-1 field-lock-badge";
    badge.textContent = "⚠️ Поле уже заполнено в айтемах — удалить нельзя";
    row.appendChild(badge);
  }
}

function parseOriginalFieldIds(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((val) => Number(val))
      .filter((val) => Number.isFinite(val));
  } catch {
    return [];
  }
}

async function fieldsUsedMap(tabId, fields) {
  const map = {};
  fields.forEach((field) => {
    if (field?.id !== undefined) {
      map[field.id] = false;
    }
  });

  const boxes = await getBoxes(tabId);
  if (!boxes || !Array.isArray(boxes) || boxes.length === 0) return map;

  for (const box of boxes) {
    const items = (await getItemsByBox(box.id)) || [];
    for (const item of items) {
      const meta = item.metadata_json || {};
      for (const field of fields) {
        if (!field?.id || map[field.id]) continue;
        const value = meta ? meta[field.name] : undefined;
        if (value !== undefined && value !== null && String(value).length > 0) {
          map[field.id] = true;
        }
      }
    }
  }

  return map;
}

function initSyncModal(onTabsChanged) {
  const modalEl = document.getElementById("tabSyncModal");
  if (!modalEl || typeof bootstrap === "undefined" || !bootstrap.Modal) {
    return;
  }
  syncModalState.onTabsChanged = onTabsChanged;
  syncModalState.modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  syncModalState.form = document.getElementById("tabSyncForm");
  syncModalState.enableSwitch = document.getElementById("tabSyncEnableSwitch");
  syncModalState.configSelect = document.getElementById("tabSyncConfigSelect");
  syncModalState.spreadsheetInput = document.getElementById("tabSyncSpreadsheetId");
  syncModalState.submitBtn = document.getElementById("tabSyncSubmit");
  syncModalState.tabNameEl = document.getElementById("tabSyncTabName");
  syncModalState.workerWarningEl = document.getElementById("tabSyncWorkerWarning");
  syncModalState.form?.addEventListener("submit", handleTabSyncSubmit);
}

function renderSyncConfigOptions(configs, selectedName) {
  if (!syncModalState.configSelect) return;
  const options = [
    '<option value="">— Выберите конфиг —</option>',
    ...configs.map(
      (config) =>
        `<option value="${config.name}" ${config.name === selectedName ? "selected" : ""}>${escapeHtml(
          config.worksheet_name || config.name
        )}</option>`
    ),
  ];
  syncModalState.configSelect.innerHTML = options.join("");
}

async function handleTabSyncSubmit(event) {
  event.preventDefault();
  if (!syncModalState.currentTab) return;
  const configName = syncModalState.configSelect?.value || "";
  const enableSync = !!(syncModalState.enableSwitch?.checked && configName);
  if (syncModalState.enableSwitch?.checked && !configName) {
    syncModalState.configSelect?.classList.add("is-invalid");
    showTopAlert("Выберите конфигурацию для синхронизации", "danger");
    return;
  }
  syncModalState.configSelect?.classList.remove("is-invalid");
  if (enableSync && syncModalState.workerOnline === false) {
    showTopAlert(
      "Воркер Redis для синхронизации не запущен — операции будут завершаться ошибкой, пока он не будет запущен.",
      "warning",
      7000
    );
  }
  const spreadsheetId = (syncModalState.spreadsheetInput?.value || "").trim();
  const initialId = syncModalState.spreadsheetInput?.dataset.initialValue || "";

  const requests = [
    updateTabSyncSettings(syncModalState.currentTab.id, {
      enable_sync: enableSync,
      config_name: enableSync ? configName : null,
    }),
  ];
  if (spreadsheetId !== initialId) {
    requests.push(
      updateParserEnv({
        spreadsheet_id: spreadsheetId,
      })
    );
  }

  syncModalState.submitBtn?.setAttribute("disabled", "disabled");
  try {
    await Promise.all(requests);
    showTopAlert("Настройки синхронизации сохранены", "success");
    syncModalState.modal?.hide();
    await syncModalState.onTabsChanged?.();
  } catch (err) {
    console.error("Ошибка сохранения синхронизации", err);
    const suffix =
      syncModalState.workerOnline === false
        ? " Убедитесь, что запущен Redis воркер (например, `rq worker sync`)."
        : "";
    showTopAlert((err?.message || "Не удалось сохранить синхронизацию") + suffix, "danger");
  } finally {
    syncModalState.submitBtn?.removeAttribute("disabled");
  }
}

function updateSyncWorkerWarning(isOnline) {
  const normalized = !!isOnline;
  syncModalState.workerOnline = normalized;
  const warningEl = syncModalState.workerWarningEl;
  if (warningEl) {
    if (normalized) {
      warningEl.classList.add("d-none");
    } else {
      warningEl.classList.remove("d-none");
    }
  }
  if (!normalized && !syncModalState.workerAlertShown) {
    showTopAlert("Воркер Redis для синхронизации не запущен — операции будут завершаться ошибкой.", "warning", 7000);
    syncModalState.workerAlertShown = true;
  }
}
