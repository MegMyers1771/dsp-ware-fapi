import { fetchIssues, fetchStatuses } from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";
import { sanitizeHexColor, getReadableTextColor } from "../../common/colors.js";
import { createPaginationController } from "../../common/pagination.js";
import { downloadIssuesXlsx } from "../../api.js";

const HISTORY_PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
const DEFAULT_HISTORY_PAGE_SIZE = 5;

export async function bootstrapHistoryPage() {
  const tableBody = document.querySelector("#issueHistoryTable tbody");
  const emptyEl = document.getElementById("issueHistoryEmpty");
  const reloadBtn = document.getElementById("issueHistoryReload");
  const downloadBtn = document.getElementById("issueHistoryDownload");
  const filterForm = document.getElementById("issueHistoryFilters");
  const filterControls = {
    status: document.getElementById("historyFilterStatus"),
    responsible: document.getElementById("historyFilterResponsible"),
    serial: document.getElementById("historyFilterSerial"),
    invoice: document.getElementById("historyFilterInvoice"),
    item: document.getElementById("historyFilterItem"),
    tab: document.getElementById("historyFilterTab"),
    box: document.getElementById("historyFilterBox"),
    createdFrom: document.getElementById("historyFilterCreatedFrom"),
    createdTo: document.getElementById("historyFilterCreatedTo"),
  };
  const pagination = createPaginationController({
    elements: {
      container: document.getElementById("historyPagination"),
      prevBtn: document.getElementById("historyPrevPage"),
      nextBtn: document.getElementById("historyNextPage"),
      pageLabel: document.getElementById("historyPageCurrent"),
      totalLabel: document.getElementById("historyPageTotal"),
      rangeLabel: document.getElementById("historyPageRange"),
      totalCountLabel: document.getElementById("historyTotalCount"),
      pageSizeSelect: document.getElementById("historyPageSize"),
    },
    defaultPageSize: DEFAULT_HISTORY_PAGE_SIZE,
    pageSizeOptions: HISTORY_PAGE_SIZE_OPTIONS,
    onChange: ({ page, perPage }) => loadHistory(state.filters, { page, perPage }),
  });
  const state = { filters: {}, statuses: [], pagination };
  if (!tableBody || !emptyEl) return;

  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  };

  const normalizeSnapshot = (snapshot) => {
    if (snapshot && typeof snapshot === "object") return snapshot;
    if (typeof snapshot === "string") {
      try {
        const parsed = JSON.parse(snapshot);
        return typeof parsed === "object" && parsed ? parsed : { value: parsed };
      } catch {
        return { value: snapshot };
      }
    }
    return {};
  };

  const renderEntries = (entries = []) => {
    if (!entries.length) {
      const hasFilters = Object.keys(state.filters || {}).length > 0;
      emptyEl.textContent = hasFilters ? "Ничего не найдено по фильтрам" : "История пустая";
      emptyEl.classList.remove("d-none");
      tableBody.innerHTML = "";
      return;
    }
    emptyEl.classList.add("d-none");
    tableBody.innerHTML = entries
      .map((entry) => {
        const snapshot = normalizeSnapshot(entry.item_snapshot);
        const statusColor = sanitizeHexColor(entry.status_color);
        const readable = getReadableTextColor(statusColor);
        const statusHtml = `<span class="badge rounded-pill" style="background:${escapeHtml(
          statusColor
        )}; color:${escapeHtml(readable)}; border:1px solid ${escapeHtml(statusColor)};">${escapeHtml(
          entry.status_name || "Статус"
        )}</span>`;
        const details = [snapshot.tab_name ? `Вкладка: ${snapshot.tab_name}` : null, snapshot.box_name ? `Ящик: ${snapshot.box_name}` : null]
          .filter(Boolean)
          .join(" · ");
        return `
          <tr>
            <td>${escapeHtml(entry.id)}</td>
            <td>${statusHtml}</td>
            <td>${escapeHtml(entry.responsible_user_name || "—")}</td>
            <td>${escapeHtml(entry.serial_number || "—")}</td>
            <td>${escapeHtml(entry.invoice_number || "—")}</td>
            <td>
              <div class="fw-semibold">${escapeHtml(snapshot.item_name || snapshot.value || "—")}</div>
              ${details ? `<div class="text-muted small">${escapeHtml(details)}</div>` : ""}
            </td>
            <td>${escapeHtml(formatDate(entry.created_at))}</td>
          </tr>
        `;
      })
      .join("");
  };

  const readFilters = () => {
    const raw = {
      status_id: filterControls.status?.value || "",
      responsible: filterControls.responsible?.value.trim() || "",
      serial: filterControls.serial?.value.trim() || "",
      invoice: filterControls.invoice?.value.trim() || "",
      item: filterControls.item?.value.trim() || "",
      tab: filterControls.tab?.value.trim() || "",
      box: filterControls.box?.value.trim() || "",
      created_from: filterControls.createdFrom?.value || "",
      created_to: filterControls.createdTo?.value || "",
    };

    return Object.entries(raw).reduce((acc, [key, value]) => {
      if (!value) return acc;
      if (key === "status_id") {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) acc.status_id = num;
        return acc;
      }
      if (key === "created_from" || key === "created_to") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          acc[key] = date.toISOString();
        }
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
  };

  const populateStatuses = async () => {
    if (!filterControls.status) return;
    try {
      const statuses = await fetchStatuses();
      state.statuses = statuses || [];
      filterControls.status.innerHTML = `<option value="">Все</option>`;
      (state.statuses || []).forEach((status) => {
        const option = document.createElement("option");
        option.value = String(status.id);
        option.textContent = status.name || `Статус #${status.id}`;
        option.style.backgroundColor = sanitizeHexColor(status.color);
        option.style.color = getReadableTextColor(sanitizeHexColor(status.color));
        filterControls.status.appendChild(option);
      });
    } catch (err) {
      console.warn("Не удалось загрузить статусы для фильтра", err);
    }
  };

  const loadHistory = async (filters = state.filters, paginationOverride = {}) => {
    state.filters = filters;
    emptyEl.textContent = "Загрузка...";
    emptyEl.classList.remove("d-none");
    tableBody.innerHTML = "";
    try {
      const page = paginationOverride.page || pagination?.state.page || 1;
      const perPage = paginationOverride.perPage || pagination?.state.perPage || DEFAULT_HISTORY_PAGE_SIZE;
      const { items, total } = await fetchIssues({ ...filters, page, per_page: perPage });
      const totalPages = Math.max(1, Math.ceil((total || 0) / perPage));
      if (total > 0 && items.length === 0 && page > totalPages && pagination) {
        const targetPage = Math.max(1, totalPages);
        await pagination.goToPage(targetPage, { silent: true });
        return loadHistory(filters, { page: targetPage, perPage });
      }
      renderEntries(items || []);
      pagination?.updateUi({
        totalItems: total || 0,
        visibleCount: items?.length || 0,
        page,
        perPage,
      });
    } catch (err) {
      console.error("Не удалось загрузить историю", err);
      emptyEl.textContent = "Не удалось загрузить историю";
      showTopAlert(err?.message || "Не удалось загрузить историю выдачи", "danger");
    }
  };

  reloadBtn?.addEventListener("click", () => loadHistory(state.filters, pagination?.state));
  downloadBtn?.addEventListener("click", async () => {
    if (!downloadBtn) return;
    downloadBtn.setAttribute("disabled", "disabled");
    try {
      const blob = await downloadIssuesXlsx();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "issue_history.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download history failed", err);
      showTopAlert(err?.message || "Не удалось скачать историю", "danger");
    } finally {
      downloadBtn.removeAttribute("disabled");
    }
  });

  filterForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const filters = readFilters();
    if (pagination) {
      await pagination.goToPage(1, { silent: true });
    }
    await loadHistory(filters, { page: pagination?.state.page, perPage: pagination?.state.perPage });
  });

  filterForm?.addEventListener("reset", async (event) => {
    event.preventDefault();
    Object.values(filterControls).forEach((input) => {
      if (input) input.value = "";
    });
    if (pagination) {
      await pagination.goToPage(1, { silent: true });
      await pagination.setPerPage(DEFAULT_HISTORY_PAGE_SIZE, { silent: true });
    }
    await loadHistory({}, { page: pagination?.state.page, perPage: pagination?.state.perPage });
  });

  await populateStatuses();
  await loadHistory({}, pagination?.state);
}
