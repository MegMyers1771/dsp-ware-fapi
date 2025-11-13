import {
  fetchParsedTabSummaries,
  fetchParsedTabDetail,
  importParsedTab,
  runParserJob,
} from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";

export function bootstrapParserPage() {
  const state = {
    tabs: [],
    detailsCache: new Map(),
    loading: false,
  };

  document.getElementById("parserGoHomeBtn")?.addEventListener("click", () => {
    window.location.href = "/";
  });
  document.getElementById("parserRefreshBtn")?.addEventListener("click", () => {
    loadParsedTabs(state);
  });
  document.getElementById("parserFillExampleBtn")?.addEventListener("click", () => {
    fillExampleConfig();
  });

  const tableBody = document.getElementById("parsedTabsBody");
  tableBody?.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-tab-name]");
    if (!row) return;
    const tabName = row.dataset.tabName;
    if (!tabName) return;

    if (event.target.closest("button[data-action='preview']")) {
      openPreview(tabName, state);
    } else if (event.target.closest("button[data-action='import']")) {
      handleImport(tabName, event.target.closest("button[data-action='import']"), state);
    }
  });

  document.getElementById("parserConfigForm")?.addEventListener("submit", (event) =>
    handleParserSubmit(event, state)
  );

  loadParsedTabs(state);
}

async function loadParsedTabs(state) {
  if (state.loading) return;
  state.loading = true;
  setEmptyState("Загрузка...");
  try {
    state.tabs = await fetchParsedTabSummaries();
    renderParsedTabs(state.tabs);
  } catch (err) {
    console.error("Не удалось загрузить список файлов", err);
    setEmptyState(err?.message || "Не удалось загрузить список файлов");
    showTopAlert(err?.message || "Ошибка загрузки списка", "danger");
  } finally {
    state.loading = false;
  }
}

function renderParsedTabs(tabs) {
  const body = document.getElementById("parsedTabsBody");
  if (!body) return;

  if (!tabs.length) {
    body.innerHTML = "";
    setEmptyState("Файлы не найдены. Сначала запусти парсер.");
    return;
  }

  setEmptyState("");
  body.innerHTML = tabs
    .map(
      (tab) => `
        <tr data-tab-name="${escapeHtml(tab.name)}">
          <td>
            <div class="fw-semibold">${escapeHtml(tab.name)}</div>
          </td>
          <td class="text-center">${tab.fields_count}</td>
          <td class="text-center">${tab.boxes_count}</td>
          <td class="text-center">${tab.items_count}</td>
          <td class="text-center">${tab.has_allowed_values ? "✅" : "—"}</td>
          <td class="text-center">
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-primary" data-action="preview">Просмотр</button>
              <button type="button" class="btn btn-success" data-action="import">Импортировать</button>
            </div>
          </td>
        </tr>`
    )
    .join("");
}

function setEmptyState(message) {
  const container = document.getElementById("parserEmptyState");
  if (!container) return;
  if (!message) {
    container.classList.add("d-none");
    return;
  }
  container.textContent = message;
  container.classList.remove("d-none");
}

async function openPreview(tabName, state) {
  const contentEl = document.getElementById("parsedTabPreviewContent");
  if (contentEl) {
    contentEl.innerHTML = `<div class="text-muted">Загрузка...</div>`;
  }
  try {
    let detail = state.detailsCache.get(tabName);
    if (!detail) {
      detail = await fetchParsedTabDetail(tabName);
      state.detailsCache.set(tabName, detail);
    }
    renderPreview(detail);
    const modalEl = document.getElementById("parsedTabPreviewModal");
    if (modalEl) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  } catch (err) {
    console.error("Не удалось получить файл", err);
    showTopAlert(err?.message || "Не удалось загрузить файл", "danger");
  }
}

function renderPreview(detail) {
  const contentEl = document.getElementById("parsedTabPreviewContent");
  if (!contentEl) return;

  const allowedEntries = Object.entries(detail.allowed_values || {});
  const posStatus = detail.enable_pos ? "включён" : "выключен";
  const allowedHtml = allowedEntries.length
    ? `<div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th style="width:200px">Поле</th>
              <th>Разрешённые значения</th>
            </tr>
          </thead>
          <tbody>
            ${allowedEntries
              .map(
                ([field, values]) => `
                  <tr>
                    <td>${escapeHtml(field)}</td>
                    <td>
                      ${(values || [])
                        .slice(0, 10)
                        .map((val) => `<span class="badge text-bg-light me-1 mb-1">${escapeHtml(String(val))}</span>`)
                        .join("") || "<span class='text-muted'>—</span>"}
                    </td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="text-muted">Нет ограничений по значениям</div>`;

  const boxes = detail.boxes || [];
  const boxesHtml = boxes.length
    ? `<div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Ящик</th>
              <th style="width:120px" class="text-center">Айтемов</th>
            </tr>
          </thead>
          <tbody>
            ${boxes
              .map(
                (box) => `
                  <tr>
                    <td>${escapeHtml(box.name || "—")}</td>
                    <td class="text-center">${box.items?.length || 0}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    : `<div class="text-muted">Нет ящиков</div>`;

  const sampleBox = boxes.find((box) => (box.items || []).length) || boxes[0];
  const sampleItems = sampleBox?.items?.slice(0, 5) || [];
  const sampleHtml = sampleItems.length
    ? sampleItems
        .map((item, idx) => {
          const rows = Object.entries(item).slice(0, 6);
          return `
            <div class="border rounded p-2 mb-2">
              <div class="fw-semibold mb-2">#${idx + 1}</div>
              ${rows
                .map(
                  ([key, value]) => `
                    <div class="d-flex justify-content-between small">
                      <span class="text-muted">${escapeHtml(key)}:</span>
                      <span class="ms-2">${escapeHtml(String(value ?? ""))}</span>
                    </div>`
                )
                .join("")}
            </div>`;
        })
        .join("")
    : `<div class="text-muted">Нет данных для предпросмотра айтемов</div>`;

  contentEl.innerHTML = `
    <div class="mb-3">
      <h5 class="mb-1">${escapeHtml(detail.name || "Без названия")}</h5>
      <div class="text-muted small">POS: ${escapeHtml(posStatus)} · Поля (${detail.fields?.length || 0}): ${
        detail.fields?.map((field) => escapeHtml(field)).join(", ") || "—"
      }</div>
    </div>
    <div class="mb-4">
      <h6>Разрешённые значения</h6>
      ${allowedHtml}
    </div>
    <div class="mb-4">
      <h6>Ящики</h6>
      ${boxesHtml}
    </div>
    <div>
      <h6>Пример айтемов</h6>
      ${sampleHtml}
      ${
        sampleBox && sampleBox.items && sampleBox.items.length > sampleItems.length
          ? `<div class="text-muted small">Показаны первые ${sampleItems.length} из ${sampleBox.items.length} айтемов ящика «${escapeHtml(
              sampleBox.name || "—"
            )}»</div>`
          : ""
      }
    </div>
  `;
}

async function handleImport(tabName, button, state) {
  if (!window.confirm(`Импортировать вкладку «${tabName}»?`)) {
    return;
  }
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Импорт...";
  }
  try {
    const result = await importParsedTab(tabName);
    showTopAlert(
      `Вкладка «${tabName}» импортирована (${result.boxes_created} боксов, ${result.items_created} айтемов)`,
      "success"
    );
  } catch (err) {
    console.error("Импорт не удался", err);
    showTopAlert(err?.message || "Не удалось импортировать вкладку", "danger");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function handleParserSubmit(event, state) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = document.getElementById("parserSubmitBtn");
  const statusEl = document.getElementById("parserFormStatus");

  const spreadsheetId = document.getElementById("parserSpreadsheetId")?.value.trim();
  const worksheetName = document.getElementById("parserWorksheetName")?.value.trim();
  const boxColumn = document.getElementById("parserBoxColumn")?.value.trim();
  const fieldsRaw = document.getElementById("parserFieldsJson")?.value.trim();
  const reservedRaw = document.getElementById("parserReservedJson")?.value.trim();
  const enablePosInput = document.getElementById("parserEnablePos");
  const enablePos = enablePosInput ? enablePosInput.checked : true;

  let fields;
  let reserved = {};
  try {
    fields = parseObject(fieldsRaw, "Поля");
    reserved = reservedRaw ? parseObject(reservedRaw, "Диапазоны") : {};
  } catch (err) {
    showTopAlert(err.message, "warning");
    setFormStatus(statusEl, err.message, "danger");
    return;
  }

  const requiredFields = ["Имя", "Кол-во"];
  const normalizedFieldNames = Object.keys(fields || {}).map((key) => key.trim().toLowerCase());
  const missingRequired = requiredFields.filter(
    (name) => !normalizedFieldNames.includes(name.trim().toLowerCase())
  );
  if (missingRequired.length) {
    const message = `Добавьте обязательные поля: ${missingRequired.join(", ")}`;
    showTopAlert(message, "warning");
    setFormStatus(statusEl, message, "danger");
    return;
  }

  if (!spreadsheetId || !worksheetName || !boxColumn) {
    const message = "Заполни Spreadsheet ID, Worksheet и колонку ящиков";
    showTopAlert(message, "warning");
    setFormStatus(statusEl, message, "danger");
    return;
  }

  submitBtn.disabled = true;
  setFormStatus(statusEl, "Парсер запущен...", "info");
  try {
    const result = await runParserJob({
      spreadsheet_id: spreadsheetId,
      worksheet_name: worksheetName,
      box_column: boxColumn,
      fields,
      reserved_ranges: reserved,
      enable_pos: enablePos,
    });
    setFormStatus(
      statusEl,
      `Готово: файл ${result.file_name} (${result.boxes_count} боксов, ${result.items_count} айтемов, POS: ${
        result.enable_pos ? "вкл" : "выкл"
      })`,
      "success"
    );
    showTopAlert("Парсинг завершён. Файл добавлен в список.", "success");
    await loadParsedTabs(state);
  } catch (err) {
    console.error("Парсер упал", err);
    const message = err?.message || "Не удалось выполнить парсинг";
    setFormStatus(statusEl, message, "danger");
    showTopAlert(message, "danger");
  } finally {
    submitBtn.disabled = false;
    form.classList.remove("was-validated");
  }
}

function parseObject(text, fieldName) {
  if (!text) throw new Error(`Поле "${fieldName}" не заполнено`);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("not object");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Поле "${fieldName}" должно содержать корректный JSON-объект`);
  }
}

function setFormStatus(el, message, type = "info") {
  if (!el) return;
  el.textContent = message || "";
  el.className = `small text-${type} mt-2`;
}

function fillExampleConfig() {
  document.getElementById("parserSpreadsheetId").value = "1BUoLe_K90Di-FoGsNyQH-sg5DVSjxBFjcdotgMcxsYM";
  document.getElementById("parserWorksheetName").value = "HDD";
  document.getElementById("parserBoxColumn").value = "Ящик";
  const enablePosInput = document.getElementById("parserEnablePos");
  if (enablePosInput) enablePosInput.checked = true;
  document.getElementById("parserFieldsJson").value = JSON.stringify(
    {
      "Имя": "Товар",
      "Кол-во": "Шт",
      "Формат": "Фор.",
      "Вендор": "Вендор",
    },
    null,
    2
  );
  document.getElementById("parserReservedJson").value = JSON.stringify(
    {
      "Форм": "D6:D20",
      "Вендор": "G6:G40",
    },
    null,
    2
  );
}
