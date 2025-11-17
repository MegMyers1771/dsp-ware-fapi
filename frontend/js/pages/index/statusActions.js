import { createStatus, deleteStatus, fetchStatuses } from "../../api.js";
import { showTopAlert } from "../../common/alerts.js";
import { escapeHtml } from "../../common/dom.js";

const DEFAULT_STATUS_COLOR = "#198754";

const hexToRgb = (hex) => {
  const normalized = hex?.replace("#", "");
  if (!normalized || (normalized.length !== 6 && normalized.length !== 3)) return { r: 25, g: 135, b: 84 };
  const fullHex = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const intVal = parseInt(fullHex, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};

const shouldUseDarkText = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65;
};

export function initStatusActions({ onStatusCreated } = {}) {
  const modalEl = document.getElementById("createStatusModal");
  const toggleBtn = document.getElementById("dropdown-create-status");
  const formEl = document.getElementById("createStatusForm");
  const nameInput = document.getElementById("statusName");
  const colorInput = document.getElementById("statusColor");
  const statusListContainer = document.getElementById("statusListContainer");

  let cachedStatuses = [];

  const buildStatusBubble = (status) => {
    const color = status.color || DEFAULT_STATUS_COLOR;
    const useDarkText = shouldUseDarkText(color);
    const textColor = useDarkText ? "#212529" : "#fff";
    const label = escapeHtml(status.name || "Статус");
    const usageCount = Number(status.usage_count) || 0;
    const usageHint =
      status.can_delete !== false
        ? `<button type="button" class="status-delete-btn" title="Удалить статус" data-action="delete-status" data-status-id="${status.id}" data-status-name="${label}">&times;</button>`
        : `<span class="status-bubble-hint" title="Статус используется в истории выдач">${usageCount === 1 ? "1 выдача" : `${usageCount} выдач`}</span>`;

    return `
      <div class="status-preview-bubble${useDarkText ? " dark-text" : ""}" style="background:${color};color:${textColor};">
        <span class="status-bubble-label">${label}</span>
        ${usageHint}
      </div>
    `;
  };

  const renderStatusList = (statuses = []) => {
    if (!statusListContainer) return;
    if (!statuses.length) {
      statusListContainer.innerHTML = `<div class="text-muted small">Статусов пока нет</div>`;
      return;
    }
    statusListContainer.innerHTML = statuses.map((status) => buildStatusBubble(status)).join("");
  };

  const refreshStatuses = async () => {
    if (!statusListContainer) return;
    statusListContainer.innerHTML = `<div class="text-muted small">Загрузка...</div>`;
    try {
      cachedStatuses = (await fetchStatuses()) || [];
      renderStatusList(cachedStatuses);
    } catch (err) {
      console.warn("Не удалось загрузить статусы", err);
      statusListContainer.innerHTML = `<div class="text-danger small">Не удалось загрузить статусы</div>`;
    }
  };

  const getStatusById = (statusId) =>
    cachedStatuses.find((status) => Number(status.id) === Number(statusId));

  const handleDeleteStatus = async (statusId, triggerEl) => {
    const status = getStatusById(statusId);
    const displayName = status?.name || `#${statusId}`;
    if (!window.confirm(`Удалить статус «${displayName}»?`)) {
      return;
    }
    triggerEl?.setAttribute("disabled", "disabled");
    try {
      await deleteStatus(statusId);
      showTopAlert(`Статус «${displayName}» удалён`, "success");
      await refreshStatuses();
    } catch (err) {
      console.error("Не удалось удалить статус", err);
      showTopAlert(err?.message || "Не удалось удалить статус", "danger");
    } finally {
      triggerEl?.removeAttribute("disabled");
    }
  };

  const resetForm = () => {
    if (nameInput) nameInput.value = "";
    if (colorInput) colorInput.value = DEFAULT_STATUS_COLOR;
  };

  toggleBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!modalEl) {
      showTopAlert("Модалка создания статуса не найдена", "danger");
      return;
    }
    resetForm();
    refreshStatuses();
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    setTimeout(() => nameInput?.focus(), 150);
  });

  renderStatusList([]);
  statusListContainer?.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("[data-action='delete-status']");
    if (!deleteBtn) return;
    event.preventDefault();
    const statusId = Number(deleteBtn.dataset.statusId);
    if (!Number.isInteger(statusId) || statusId <= 0) return;
    handleDeleteStatus(statusId, deleteBtn);
  });
  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim();
    const color = colorInput?.value || DEFAULT_STATUS_COLOR;
    if (!name) {
      showTopAlert("Введите название статуса", "danger");
      return;
    }
    try {
      await createStatus({ name, color });
      showTopAlert("Статус создан", "success");
      onStatusCreated?.();
      if (nameInput) {
        nameInput.value = "";
      }
      refreshStatuses();
      setTimeout(() => nameInput?.focus(), 50);
    } catch (err) {
      console.error("Не удалось создать статус", err);
      showTopAlert(err?.message || "Не удалось создать статус", "danger");
    }
  });
}
