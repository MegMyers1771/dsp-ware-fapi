export function createPaginationController(options = {}) {
  const {
    elements = {},
    pageSizeOptions = [5, 10, 20, 50],
    defaultPageSize = 20,
    onChange,
  } = options;
  const ui = {
    container: elements.container,
    prevBtn: elements.prevBtn,
    nextBtn: elements.nextBtn,
    pageLabel: elements.pageLabel,
    totalLabel: elements.totalLabel,
    rangeLabel: elements.rangeLabel,
    totalCountLabel: elements.totalCountLabel,
    pageSizeSelect: elements.pageSizeSelect,
  };
  if (!ui.container) return null;

  const state = {
    page: 1,
    perPage: Math.max(Number(defaultPageSize) || 1, 1),
  };

  if (ui.pageSizeSelect && ui.pageSizeSelect.options.length === 0) {
    pageSizeOptions.forEach((size) => {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = size;
      ui.pageSizeSelect.appendChild(option);
    });
  }
  if (ui.pageSizeSelect) {
    ui.pageSizeSelect.value = String(state.perPage);
  }

  const triggerChange = async (opts = {}) => {
    if (typeof onChange !== "function" || opts.silent) return;
    await onChange({ ...state });
  };

  const updateUi = (stats = {}) => {
    const perPage = Math.max(Number(stats.perPage || state.perPage) || 1, 1);
    const totalItems = Math.max(Number(stats.totalItems) || 0, 0);
    const rawPage = Number(stats.page || state.page) || 1;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage) || 1);
    const page = Math.min(Math.max(rawPage, 1), totalPages);
    const visibleCount = Math.max(Number(stats.visibleCount) || 0, 0);
    const startIndex = (page - 1) * perPage;
    const rangeStart = totalItems === 0 ? 0 : startIndex + 1;
    const rangeEnd = totalItems === 0 ? 0 : Math.min(totalItems, startIndex + (visibleCount || perPage));

    state.page = page;
    state.perPage = perPage;

    if (ui.pageLabel) ui.pageLabel.textContent = String(page);
    if (ui.totalLabel) ui.totalLabel.textContent = String(totalPages);
    if (ui.rangeLabel) ui.rangeLabel.textContent = `${rangeStart}-${rangeEnd}`;
    if (ui.totalCountLabel) ui.totalCountLabel.textContent = String(totalItems);
    if (ui.pageSizeSelect && ui.pageSizeSelect.value !== String(perPage)) {
      ui.pageSizeSelect.value = String(perPage);
    }

    if (ui.prevBtn) {
      if (page <= 1 || totalItems === 0) {
        ui.prevBtn.setAttribute("disabled", "disabled");
      } else {
        ui.prevBtn.removeAttribute("disabled");
      }
    }
    if (ui.nextBtn) {
      if (page >= totalPages || totalItems === 0) {
        ui.nextBtn.setAttribute("disabled", "disabled");
      } else {
        ui.nextBtn.removeAttribute("disabled");
      }
    }
  };

  const goToPage = async (nextPage, opts = {}) => {
    const normalized = Math.max(Number(nextPage) || 1, 1);
    if (normalized === state.page && !opts.force) return;
    state.page = normalized;
    await triggerChange(opts);
  };

  const setPerPage = async (value, opts = {}) => {
    const next = Math.max(Number(value) || state.perPage, 1);
    if (next === state.perPage && !opts.force) return;
    state.perPage = next;
    state.page = 1;
    if (ui.pageSizeSelect && ui.pageSizeSelect.value !== String(next)) {
      ui.pageSizeSelect.value = String(next);
    }
    await triggerChange(opts);
  };

  ui.prevBtn?.addEventListener("click", () => {
    if (state.page <= 1) return;
    goToPage(state.page - 1);
  });
  ui.nextBtn?.addEventListener("click", () => {
    goToPage(state.page + 1);
  });
  ui.pageSizeSelect?.addEventListener("change", (event) => {
    setPerPage(event.target.value);
  });

  return { state, updateUi, goToPage, setPerPage };
}
