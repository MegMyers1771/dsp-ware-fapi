import { fetchIssues } from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";

export function bootstrapHistoryPage() {
  const tableBody = document.querySelector("#issueHistoryTable tbody");
  const emptyEl = document.getElementById("issueHistoryEmpty");
  const reloadBtn = document.getElementById("issueHistoryReload");
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
      emptyEl.textContent = "История пустая";
      emptyEl.classList.remove("d-none");
      tableBody.innerHTML = "";
      return;
    }
    emptyEl.classList.add("d-none");
    tableBody.innerHTML = entries
      .map((entry) => {
        const snapshot = normalizeSnapshot(entry.item_snapshot);
        const statusColor = entry.status_color || "#6c757d";
        const statusHtml = `<span class="badge rounded-pill" style="background:${escapeHtml(statusColor)};">${escapeHtml(
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

  const loadHistory = async () => {
    emptyEl.textContent = "Загрузка...";
    emptyEl.classList.remove("d-none");
    tableBody.innerHTML = "";
    try {
      const issues = await fetchIssues();
      renderEntries(issues || []);
    } catch (err) {
      console.error("Не удалось загрузить историю", err);
      emptyEl.textContent = "Не удалось загрузить историю";
      showTopAlert(err?.message || "Не удалось загрузить историю выдачи", "danger");
    }
  };

  reloadBtn?.addEventListener("click", () => loadHistory());
  loadHistory();
}
