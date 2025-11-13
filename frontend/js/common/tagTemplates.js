import { escapeHtml } from "./dom.js";
import { FALLBACK_TAG_COLOR, getReadableTextColor, sanitizeHexColor } from "./colors.js";

function defaultLookup() {
  return null;
}

export function getTagDescriptors(tagIds = [], { tagLookup = defaultLookup } = {}) {
  if (!Array.isArray(tagIds) || !tagIds.length) return [];
  return tagIds
    .map((id) => {
      const tag = tagLookup(Number(id));
      if (!tag) return null;
      const color = sanitizeHexColor(tag.color);
      return {
        id: Number(tag.id),
        name: escapeHtml(tag.name || `#${tag.id}`),
        color,
        readable: getReadableTextColor(color || FALLBACK_TAG_COLOR),
      };
    })
    .filter(Boolean);
}

export function renderTagStrips(tagIds = [], options = {}) {
  const descriptors = getTagDescriptors(tagIds, options);
  const emptyText = options.emptyText ?? "нет";
  if (!descriptors.length) {
    return `<span class="text-muted small">${emptyText}</span>`;
  }

  const strips = descriptors
    .map(({ color, name }) => `<span class="tag-strip" title="${name}" style="background:${color};"></span>`)
    .join("");

  return `<div class="tag-strip-list">${strips}</div>`;
}

export function renderTagFillCell(tagIds = [], options = {}) {
  const descriptors = getTagDescriptors(tagIds, options);
  const emptyText = options.emptyText ?? "нет";
  if (!descriptors.length) {
    return `<span class="tag-fill-empty text-muted small">${emptyText}</span>`;
  }

  const strips = descriptors
    .map(({ color, name }) => `<span class="tag-fill-strip" style="background:${color};" title="${name}"></span>`)
    .join("");

  return `
    <div class="tag-fill-wrapper">
      <div class="tag-fill-strips" aria-hidden="true">${strips}</div>
    </div>
  `.trim();
}

export function buildTagPills(tags = []) {
  if (!Array.isArray(tags) || !tags.length) {
    return `<div class="text-muted small">Тэгов пока нет</div>`;
  }

  return tags
    .map((tag) => {
      const color = sanitizeHexColor(tag.color);
      const readable = getReadableTextColor(color || FALLBACK_TAG_COLOR);
      const darkClass = readable === "#fff" ? "" : " dark-text";
      const label = escapeHtml(tag.name || `#${tag.id}`);
      return `
        <div class="tag-pill${darkClass}" style="background:${color}; border-color:${color};">
          <span class="tag-pill-label">${label}</span>
          <button type="button" class="tag-pill-delete" title="Удалить тэг" data-action="delete-tag" data-tag-id="${tag.id}">&times;</button>
        </div>
      `;
    })
    .join("");
}

export function buildAttachedTagChips(tagIds = [], { tagLookup = defaultLookup, emptyText = "Нет привязанных тэгов", removeAttr = "data-remove-tag-id", } = {}) {
  const descriptors = getTagDescriptors(tagIds, { tagLookup });
  if (!descriptors.length) {
    return `<div class="text-muted small">${emptyText}</div>`;
  }

  return descriptors
    .map(({ id, name, color, readable }) => {
      const darkClass = readable === "#212529" ? " dark-text" : "";
      return `
        <div class="tag-pill${darkClass}" style="background:${color}; border-color:${color}; color:${readable};">
          <span class="tag-pill-label">${name}</span>
          <button type="button" class="tag-pill-delete" title="Отвязать тэг" ${removeAttr}="${id}">&times;</button>
        </div>
      `;
    })
    .join("");
}
