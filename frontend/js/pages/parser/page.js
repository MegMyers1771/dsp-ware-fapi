import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";
import {
  importParsedTab,
  createParserConfig,
  listParserConfigs,
  getParserConfig,
  deleteParserConfig,
  runParserConfig,
  fetchParserEnv,
  updateParserEnv,
  uploadParserCredentials,
} from "../../api.js";

const EXAMPLE_FIELDS = {
  Имя: "Товар",
  "Кол-во": "Шт",
  Формат: "Фор.",
  Вендор: "Вендор",
};

export async function bootstrapParserPage() {
  const state = {
    configs: [],
    loading: false,
    envInfo: null,
  };

  const form = document.getElementById("parserConfigForm");
  const configsBody = document.getElementById("configsTabsBody");

  document.getElementById("parserGoHomeBtn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
  document.getElementById("parserRefreshBtn")?.addEventListener("click", () => loadConfigs(state));
  document.getElementById("parserFillExampleBtn")?.addEventListener("click", () => {
    fillExampleConfig(state);
  });
  document.getElementById("addFieldBtn")?.addEventListener("click", () => addFieldRow());
  form?.addEventListener("submit", (event) => handleConfigFormSubmit(event, state));
  form?.addEventListener("reset", () => {
    setTimeout(() => {
      resetFieldRows();
    }, 0);
  });

  configsBody?.addEventListener("click", (event) => handleConfigAction(event, state));

  resetFieldRows();
  setupEnvInputs(state);
  setupCredentialsUpload(state);
  setupConfigImport(state);
  await loadParserEnv(state);
  loadConfigs(state);
}

async function loadConfigs(state) {
  if (state.loading) return;
  state.loading = true;
  setEmptyState("Загрузка...");
  try {
    const configs = await listParserConfigs();
    state.configs = configs;
    renderConfigs(configs);
  } catch (err) {
    console.error("Не удалось загрузить конфиги", err);
    setEmptyState(err?.message || "Не удалось загрузить конфиги");
    showTopAlert(err?.message || "Ошибка загрузки конфигов", "danger");
  } finally {
    state.loading = false;
  }
}

function renderConfigs(configs) {
  const body = document.getElementById("configsTabsBody");
  if (!body) return;
  if (!configs.length) {
    body.innerHTML = "";
    setEmptyState("Конфигов не найдено. Создайте новый.");
    return;
  }
  setEmptyState("");
  body.innerHTML = configs
    .map((config) => {
      const parseStatus = config.parsed
        ? `
            <div class="small text-success">Ящиков: ${config.parsed_boxes_count || 0}</div>
            <div class="small text-success">Айтемов: ${config.parsed_items_count || 0}</div>
            <div class="small">${config.parsed_has_allowed_values ? "Валидации: ✅" : "Валидации: —"}</div>
          `
        : `<div class="text-muted small">Парсинг не выполнен</div>`;
      return `
        <tr data-config-name="${escapeHtml(config.name)}">
          <td>
            <div class="fw-semibold">${escapeHtml(config.worksheet_name)}</div>
            <div class="text-muted small">id: ${escapeHtml(config.name)}</div>
            <div class="text-muted small">POS: ${config.enable_pos ? "вкл" : "выкл"}</div>
          </td>
          <td class="text-center">${config.fields_count}</td>
          <td class="text-center">${parseStatus}</td>
          <td class="text-center">
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-primary" data-action="preview">Просмотр</button>
              <button type="button" class="btn btn-outline-info" data-action="parse">Парсинг</button>
              <button type="button" class="btn btn-success" data-action="import" ${
                config.parsed ? "" : "disabled"
              }>Импортировать</button>
              <button type="button" class="btn btn-outline-danger" data-action="delete">Удалить</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function setEmptyState(message) {
  const element = document.getElementById("parserEmptyState");
  if (!element) return;
  if (!message) {
    element.classList.add("d-none");
    return;
  }
  element.textContent = message;
  element.classList.remove("d-none");
}

function handleConfigAction(event, state) {
  const row = event.target.closest("tr[data-config-name]");
  if (!row) return;
  const actionBtn = event.target.closest("[data-action]");
  if (!actionBtn) return;
  const name = row.dataset.configName;
  if (!name) return;

  switch (actionBtn.dataset.action) {
    case "preview":
      openConfigPreview(name);
      break;
    case "parse":
      runConfigNow(name, actionBtn, state);
      break;
    case "import":
      handleImport(name, actionBtn);
      break;
    case "delete":
      deleteConfig(name, state);
      break;
    default:
  }
}

async function openConfigPreview(configName) {
  const contentEl = document.getElementById("configPreviewContent");
  if (contentEl) {
    contentEl.innerHTML = `<div class="text-muted">Загрузка...</div>`;
  }
  try {
    const config = await getParserConfig(configName);
    if (contentEl) {
      const fieldsListHtml = Object.entries(config.fields || {})
        .map(
          ([field, column]) => `<div><strong>${escapeHtml(field)}</strong> → ${escapeHtml(column)}</div>`
        )
        .join("");

      contentEl.innerHTML = `
        <div class="mb-3">
          <div class="fw-semibold">${escapeHtml(config.worksheet_name)}</div>
          <div class="text-muted small">Box column: ${escapeHtml(config.box_column)}</div>
          <div class="text-muted small">POS: ${config.enable_pos ? "вкл" : "выкл"}</div>
        </div>
        <div class="mb-3">
          <h6>Поля</h6>
          ${fieldsListHtml || "<div class='text-muted'>Поля не заданы</div>"}
        </div>
      `;
    }
    const modalEl = document.getElementById("configPreviewModal");
    if (modalEl) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  } catch (err) {
    console.error("Не удалось загрузить конфиг", err);
    showTopAlert(err?.message || "Не удалось загрузить конфиг", "danger");
  }
}

async function runConfigNow(name, button, state) {
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Парсится...";
  try {
    const result = await runParserConfig(name);
    showTopAlert(
      `Парсинг "${result.worksheet_name}" завершён (боксов: ${result.boxes_count}, айтемов: ${result.items_count})`,
      "success"
    );
    await loadConfigs(state);
  } catch (err) {
    console.error("Парсинг не удался", err);
    showTopAlert(err?.message || "Не удалось запустить парсер", "danger");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function handleImport(name, button) {
  if (!button || !window.confirm(`Импортировать данные для конфига «${name}»?`)) {
    return;
  }
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Импорт...";
  try {
    const result = await importParsedTab(name);
    showTopAlert(
      `Импортировано: ${result.boxes_created} боксов, ${result.items_created} айтемов`,
      "success"
    );
  } catch (err) {
    console.error("Импорт не удался", err);
    showTopAlert(err?.message || "Не удалось импортировать", "danger");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function deleteConfig(name, state) {
  if (!window.confirm(`Удалить конфиг «${name}» и связанные данные?`)) {
    return;
  }
  try {
    await deleteParserConfig(name);
    showTopAlert("Конфиг удалён", "success");
    await loadConfigs(state);
  } catch (err) {
    console.error("Удаление не удалось", err);
    showTopAlert(err?.message || "Не удалось удалить конфиг", "danger");
  }
}

async function loadParserEnv(state) {
  try {
    const info = await fetchParserEnv();
    state.envInfo = info;
    applyEnvInfoToInputs(info);
  } catch (err) {
    console.error("Не удалось загрузить sheets_config.json", err);
    showTopAlert(err?.message || "Не удалось загрузить настройки sheets_config.json", "danger");
  }
}

async function persistEnvUpdate(state, payload, successMessage) {
  const updates = {};
  if ("spreadsheet_id" in payload) {
    const value = payload.spreadsheet_id || "";
    if (!value) {
      showTopAlert("Укажите корректный Spreadsheet ID", "warning");
      return;
    }
    updates.spreadsheet_id = value;
  }
  if ("credentials_path" in payload) {
    const value = payload.credentials_path || "";
    if (!value) {
      showTopAlert("Укажите путь к credentials", "warning");
      return;
    }
    updates.credentials_path = value;
  }
  try {
    const info = await updateParserEnv(updates);
    state.envInfo = info;
    applyEnvInfoToInputs(info);
    if (successMessage) {
      showTopAlert(successMessage, "success");
    }
  } catch (err) {
    console.error("Не удалось обновить sheets_config.json", err);
    showTopAlert(err?.message || "Не удалось обновить sheets_config.json", "danger");
  }
}

function applyEnvInfoToInputs(info) {
  const spreadsheetInput = document.getElementById("parserSpreadsheetId");
  if (spreadsheetInput && info?.spreadsheet_id !== undefined) {
    spreadsheetInput.value = info.spreadsheet_id || "";
  }
}

function setupEnvInputs(state) {
  const spreadsheetInput = document.getElementById("parserSpreadsheetId");
  const spreadsheetSaveBtn = document.getElementById("saveSpreadsheetIdBtn");
  spreadsheetSaveBtn?.addEventListener("click", () => {
    const value = spreadsheetInput?.value.trim();
    persistEnvUpdate(state, { spreadsheet_id: value }, "SPREADSHEET_ID обновлён");
  });
  spreadsheetInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      spreadsheetSaveBtn?.click();
    }
  });
}

// async function persistEnvUpdate(state, payload, successMessage) {
//   const updates = {};
//   if ("spreadsheet_id" in payload) {
//     const value = payload.spreadsheet_id || "";
//     if (!value) {
//       showTopAlert("Укажите корректный Spreadsheet ID", "warning");
//       return;
//     }
//     updates.spreadsheet_id = value;
//   }
//   if ("credentials_path" in payload) {
//     const value = payload.credentials_path || "";
//     if (!value) {
//       showTopAlert("Укажите путь к credentials", "warning");
//       return;
//     }
//     updates.credentials_path = value;
//   }
//   try {
//     const info = await updateParserEnv(updates);
//     state.envInfo = info;
//     applyEnvInfoToInputs(info);
//     if (successMessage) {
//       showTopAlert(successMessage, "success");
//     }
//   } catch (err) {
//     console.error("Не удалось обновить sheets_config.json", err);
//     showTopAlert(err?.message || "Не удалось обновить sheets_config.json", "danger");
//   }
// }

function setupCredentialsUpload(state) {
  setupJsonImportTrigger("uploadCredentialsBtn", "credentialsFileInput", async (jsonData) => {
    try {
      const info = await uploadParserCredentials({ data: jsonData, path: "credentials.json" });
      state.envInfo = info;
      showTopAlert("Credentials сохранён как credentials.json", "success");
    } catch (err) {
      console.error("Импорт credentials не удался", err);
      showTopAlert(err?.message || "Не удалось импортировать credentials", "danger");
    }
  });
}

function setupConfigImport(state) {
  setupJsonImportTrigger("importConfigBtn", "configFileInput", async (jsonData) => {
    try {
      applyImportedConfig(jsonData, state);
      showTopAlert("Конфиг из JSON загружен", "success");
    } catch (err) {
      console.error("Импорт конфига не удался", err);
      showTopAlert(err?.message || "Не удалось импортировать конфиг", "danger");
    }
  });
}

function applyImportedConfig(config, state) {
  const worksheetInput = document.getElementById("parserWorksheetName");
  const boxColumnInput = document.getElementById("parserBoxColumn");
  const enablePosInput = document.getElementById("parserEnablePos");
  if (worksheetInput) worksheetInput.value = config?.worksheet_name || "";
  if (boxColumnInput) boxColumnInput.value = config?.box_column || "";
  if (enablePosInput) enablePosInput.checked = config?.enable_pos !== false;

  if (config?.fields && typeof config.fields === "object") {
    renderFieldsFromMap(config.fields);
  }
}

async function handleConfigFormSubmit(event, state) {
  event.preventDefault();
  const form = event.currentTarget;
  const worksheetName = (document.getElementById("parserWorksheetName")?.value || "").trim();
  const boxColumn = (document.getElementById("parserBoxColumn")?.value || "").trim();
  const enablePos = Boolean(document.getElementById("parserEnablePos")?.checked);
  const fields = gatherFieldMap();
  if (!worksheetName || !boxColumn) {
    const message = "Заполните имя листа и колонку ящиков";
    setFormStatus(message, "danger");
    showTopAlert(message, "warning");
    return;
  }
  if (!("Имя" in fields) || !("Кол-во" in fields)) {
    console.log(fields);
    const message = "Добавьте обязательные поля Имя и Кол-во";
    setFormStatus(message, "danger");
    showTopAlert(message, "warning");
    return;
  }
  const payload = {
    worksheet_name: worksheetName,
    box_column: boxColumn,
    fields,
    enable_pos: enablePos,
  };
  const submitBtn = document.getElementById("parserConfigSaveBtn");
  submitBtn.disabled = true;
  setFormStatus("Сохраняем конфиг...", "info");
  try {
    const created = await createParserConfig(payload);
    setFormStatus(`Конфиг "${created.worksheet_name}" сохранён`, "success");
    showTopAlert(`Конфиг "${created.worksheet_name}" добавлен`, "success");
    await loadConfigs(state);
  } catch (err) {
    console.error("Сохранение конфига не удалось", err);
    const message = err?.message || "Не удалось сохранить конфиг";
    setFormStatus(message, "danger");
    showTopAlert(message, "danger");
  } finally {
    submitBtn.disabled = false;
    form.classList.remove("was-validated");
  }
}

function gatherFieldMap() {
  const fields = {};
  document.querySelectorAll("#fieldsList .field-row").forEach((row) => {
    const keyInput = row.querySelector(".field-key");
    const valueInput = row.querySelector(".field-value");
    const key =
      keyInput instanceof HTMLInputElement ? keyInput.value.trim() : "";
    const value =
      valueInput instanceof HTMLInputElement ? valueInput.value.trim() : "";
    if (key && value) {
      fields[key] = value;
    }
  });
  return fields;
}

function setFormStatus(message, type = "info") {
  const statusEl = document.getElementById("parserFormStatus");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.className = `small text-${type} mt-2`;
}

function resetFieldRows() {
  clearFieldRows();
  addFieldRow();
}

function clearFieldRows() {
  const container = document.getElementById("fieldsList");
  if (container) {
    container.innerHTML = "";
  }
}

function addFieldRow(key = "", value = "") {
  const container = document.getElementById("fieldsList");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "d-flex flex-wrap gap-2 align-items-start field-row";
  const keyWrapper = document.createElement("div");
  keyWrapper.style.flex = "1 1 180px";
  const columnWrapper = document.createElement("div");
  columnWrapper.style.flex = "1 1 180px";
  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.className = "form-control field-key";
  keyInput.placeholder = "Поле приложения";
  keyInput.value = key;
  const columnInput = document.createElement("input");
  columnInput.type = "text";
  columnInput.className = "form-control field-value";
  columnInput.placeholder = "Колонка листа";
  columnInput.value = value;
  keyWrapper.appendChild(keyInput);
  columnWrapper.appendChild(columnInput);
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-outline-danger btn-sm";
  removeBtn.setAttribute("aria-label", "Удалить поле");
  removeBtn.innerHTML = "&times;";
  removeBtn.addEventListener("click", () => row.remove());
  row.appendChild(keyWrapper);
  row.appendChild(columnWrapper);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function fillExampleConfig(state) {
  const worksheetInput = document.getElementById("parserWorksheetName");
  const boxInput = document.getElementById("parserBoxColumn");
  const posInput = document.getElementById("parserEnablePos");
  if (worksheetInput) worksheetInput.value = "HDD";
  if (boxInput) boxInput.value = "Ящик";
  if (posInput) posInput.checked = true;
  renderFieldsFromMap(EXAMPLE_FIELDS);
}

function renderFieldsFromMap(mapping) {
  clearFieldRows();
  const entries = Object.entries(mapping || {});
  if (!entries.length) {
    addFieldRow();
    return;
  }
  entries.forEach(([key, value]) => addFieldRow(key, value));
}

function setupJsonImportTrigger(buttonId, inputId, handler) {
  const button = document.getElementById(buttonId);
  const input = document.getElementById(inputId);
  if (!button || !input) return;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await handler(json);
    } catch (err) {
      console.error("Импорт JSON не удался", err);
      showTopAlert(err?.message || "Не удалось обработать JSON", "danger");
    } finally {
      input.value = "";
    }
  });
}
