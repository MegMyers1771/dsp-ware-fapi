import { createStatus, fetchStatuses } from "../../api.js";
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

  const renderStatusList = (statuses = []) => {
    if (!statusListContainer) return;
    if (!statuses.length) {
      statusListContainer.innerHTML = `<div class="text-muted small">Статусов пока нет</div>`;
      return;
    }
    statusListContainer.innerHTML = statuses
      .map((status) => {
        const color = status.color || DEFAULT_STATUS_COLOR;
        const useDarkText = shouldUseDarkText(color);
        const textColor = useDarkText ? "#212529" : "#fff";
        return `<span class="status-preview-bubble${useDarkText ? " dark-text" : ""}" style="background:${color};color:${textColor};">${escapeHtml(status.name || "Статус")}</span>`;
      })
      .join("");
  };

  const refreshStatuses = async () => {
    if (!statusListContainer) return;
    statusListContainer.innerHTML = `<div class="text-muted small">Загрузка...</div>`;
    try {
      const statuses = await fetchStatuses();
      renderStatusList(statuses || []);
    } catch (err) {
      console.warn("Не удалось загрузить статусы", err);
      statusListContainer.innerHTML = `<div class="text-danger small">Не удалось загрузить статусы</div>`;
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
