import { escapeHtml } from "../../common/dom.js";

let allowedValueSanitizeRegex;
try {
  allowedValueSanitizeRegex = new RegExp("[^\\p{L}\\d\\-_%!,\\s]", "gu");
} catch {
  allowedValueSanitizeRegex = /[^A-Za-z0-9\-_%!,\s]/g;
}

const tokenizeAllowedValues = (value) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

export function setupFieldControls() {
  const createContainer = document.getElementById("fieldsContainer");
  const editContainer = document.getElementById("editFieldsContainer");

  document.getElementById("addFieldBtn")?.addEventListener("click", () => {
    if (createContainer) addFieldRow(createContainer);
  });

  document.getElementById("editAddFieldBtn")?.addEventListener("click", () => {
    if (editContainer) addFieldRow(editContainer);
  });
}

export function addFieldRow(container, field = {}) {
  if (!container) return;
  const usePills = container?.dataset?.usePills === "1";
  const chipTarget = container?.dataset?.chipTarget || "name";
  const chipOnName = usePills && chipTarget === "name";
  const chipOnAllowed = usePills && chipTarget === "allowed";
  const div = document.createElement("div");
  div.classList.add("field-entry");
  if (field.id !== undefined && field.id !== null) {
    div.dataset.fieldId = String(field.id);
  } else {
    delete div.dataset.fieldId;
  }
  if (field.stable_key) {
    div.dataset.stableKey = field.stable_key;
  } else {
    delete div.dataset.stableKey;
  }
  const allowedValue = Array.isArray(field.allowed_values)
    ? field.allowed_values.join(", ")
    : field.allowed_values || "";

  div.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-5">
        <input class="form-control field-name" placeholder="Название" value="${field.name || ""}">
        ${
          chipOnName
            ? `
        <div class="field-name-pill-wrapper d-none mt-2">
          <span class="field-chip">
            <span class="field-chip-label"></span>
            <button type="button" class="field-chip-remove" aria-label="Удалить поле">&times;</button>
          </span>
        </div>`
            : ""
        }
      </div>
      <div class="col-md-5">
        <input class="form-control field-allowed" placeholder="Допустимые значения (через запятую)" 
          value="${allowedValue}">
        ${
          chipOnAllowed
            ? `
        <div class="field-allowed-pill-wrapper d-none mt-2">
          <div class="field-chip-list"></div>
        </div>`
            : ""
        }
      </div>
      <div class="col-md-2 text-end">
        <div class="d-flex align-items-center justify-content-end gap-2">
          <label class="mb-0 small text-muted">
            <input type="checkbox" class="form-check-input field-strong" ${field.strong ? "checked" : ""}> strong
          </label>
          <button type="button" class="btn btn-sm btn-outline-danger remove-field">✕</button>
        </div>
      </div>
    </div>
  `;

  const removeButton = div.querySelector(".remove-field");
  removeButton?.addEventListener("click", () => div.remove());
  container.appendChild(div);

  if (chipOnName) {
    initializeFieldChip(div, ".field-name", ".field-name-pill-wrapper", field.name || "");
  }
  if (chipOnAllowed) {
    initializeFieldChip(div, ".field-allowed", ".field-allowed-pill-wrapper", allowedValue, {
      sanitizeAllowed: true,
      multiValue: true,
    });
  }

  return div;
}

function initializeFieldChip(row, inputSelector, wrapperSelector, initialValue = "", options = {}) {
  const input = row.querySelector(inputSelector);
  const wrapper = row.querySelector(wrapperSelector);
  if (!input || !wrapper) return;

  const labelEl = wrapper.querySelector(".field-chip-label");
  const chipRemoveBtn = wrapper.querySelector(".field-chip-remove");
  const inlineRemoveBtn = row.querySelector(".remove-field");
  const multiValue = !!options.multiValue;
  const listEl = wrapper.querySelector(".field-chip-list");
  let multiValues = multiValue ? tokenizeAllowedValues(initialValue) : [];

  const toggleInlineRemove = (hidden) => {
    inlineRemoveBtn?.classList.toggle("d-none", hidden);
  };

  const showChip = (value) => {
    if (!labelEl) return;
    labelEl.textContent = value;
    wrapper.classList.remove("d-none");
    input.classList.add("d-none");
    toggleInlineRemove(true);
  };

  const hideChip = () => {
    wrapper.classList.add("d-none");
    input.classList.remove("d-none");
    toggleInlineRemove(false);
    input.focus();
    input.select();
  };

  const sanitizeValue = (value) => {
    if (!options.sanitizeAllowed) return value;
    return value.replace(allowedValueSanitizeRegex, "");
  };

  if (options.sanitizeAllowed) {
    input.addEventListener("input", () => {
      const sanitized = sanitizeValue(input.value);
      if (sanitized !== input.value) input.value = sanitized;
    });
  }

  const updateInputValueFromMulti = () => {
    if (!multiValue) return;
    input.value = multiValues.join(", ");
  };

  const renderMultiChips = () => {
    if (!multiValue || !listEl) return;
    listEl.innerHTML = multiValues
      .map(
        (val, idx) => `
        <span class="field-chip" data-index="${idx}">
          <span class="field-chip-label">${escapeHtml(val)}</span>
          <button type="button" class="field-chip-remove" data-index="${idx}" aria-label="Удалить значение">&times;</button>
        </span>`
      )
      .join("");
    wrapper.classList.toggle("d-none", multiValues.length === 0);
    input.classList.toggle("d-none", multiValues.length > 0);
    toggleInlineRemove(multiValues.length > 0);
  };

  const commitName = () => {
    const sanitizedValue = sanitizeValue(input.value);
    input.value = sanitizedValue;
    if (multiValue) {
      const tokens = tokenizeAllowedValues(sanitizedValue);
      if (!tokens.length) {
        multiValues = [];
        wrapper.classList.add("d-none");
        input.classList.remove("d-none");
        toggleInlineRemove(false);
        return;
      }
      multiValues = tokens;
      updateInputValueFromMulti();
      renderMultiChips();
      return;
    }

    const value = sanitizedValue.trim();
    if (!value) {
      wrapper.classList.add("d-none");
      input.classList.remove("d-none");
      toggleInlineRemove(false);
      return;
    }
    input.value = value;
    showChip(value);
  };

  if (initialValue) {
    if (multiValue) {
      multiValues = tokenizeAllowedValues(sanitizeValue(initialValue));
      updateInputValueFromMulti();
      renderMultiChips();
    } else {
      input.value = initialValue;
      commitName();
    }
  } else {
    wrapper.classList.add("d-none");
    input.classList.remove("d-none");
    toggleInlineRemove(false);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideChip();
    }
  });

  input.addEventListener("blur", () => {
    commitName();
  });

  wrapper.addEventListener("click", (e) => {
    const removeEl = e.target.closest(".field-chip-remove");
    if (multiValue && removeEl) {
      const idx = Number(removeEl.dataset.index);
      if (!Number.isNaN(idx)) {
        multiValues.splice(idx, 1);
        updateInputValueFromMulti();
        renderMultiChips();
      }
      e.stopPropagation();
      return;
    }
    hideChip();
  });

  if (!multiValue) {
    chipRemoveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      row.remove();
    });
  }
}

export function collectFields(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(".field-entry")).map((div) => {
    const name = div.querySelector(".field-name").value.trim();
    const allowedText = div.querySelector(".field-allowed").value.trim();
    const strong = !!div.querySelector(".field-strong").checked;
    const fieldIdRaw = div.dataset.fieldId;
    const stableKey = div.dataset.stableKey || null;
    const fieldId = fieldIdRaw ? Number(fieldIdRaw) : null;

    const allowed_values = allowedText
      ? allowedText.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
      : [];

    return { id: fieldId, stable_key: stableKey, name, allowed_values, allowed_values_raw: allowedText, strong };
  });
}
