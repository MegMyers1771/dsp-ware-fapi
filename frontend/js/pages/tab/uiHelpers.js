export function setupBoxTableScrollSync(container) {
  const wrapper = container.querySelector(".box-table-scroll");
  const topScroller = wrapper?.querySelector(".box-table-scroll-top");
  const spacer = wrapper?.querySelector(".box-table-scroll-spacer");
  const contentScroller = wrapper?.querySelector(".box-table-scroll-content");
  const table = contentScroller?.querySelector("table");
  if (!wrapper || !topScroller || !spacer || !contentScroller || !table) return;

  let syncingFromTop = false;
  let syncingFromContent = false;

  const syncWidths = () => {
    const needsScroll = table.scrollWidth > contentScroller.clientWidth + 2;
    wrapper.classList.toggle("box-table-scroll-active", needsScroll);
    spacer.style.width = `${table.scrollWidth}px`;
    if (!needsScroll) {
      topScroller.scrollLeft = 0;
    }
  };

  topScroller.addEventListener("scroll", () => {
    if (syncingFromTop) return;
    syncingFromContent = true;
    contentScroller.scrollLeft = topScroller.scrollLeft;
    syncingFromContent = false;
  });

  contentScroller.addEventListener("scroll", () => {
    if (syncingFromContent) return;
    syncingFromTop = true;
    topScroller.scrollLeft = contentScroller.scrollLeft;
    syncingFromTop = false;
  });

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(syncWidths);
    observer.observe(table);
    observer.observe(contentScroller);
    observer.observe(wrapper);
  } else {
    window.addEventListener("resize", syncWidths);
  }

  syncWidths();
}

export function toggleBoxModalShift(state, enable, direction = "right", source = direction ?? "default") {
  const dialogEl = state.ui.boxViewModalDialogEl || document.getElementById("boxViewModalDialog");
  const modalEl = state.ui.boxViewModalEl || document.getElementById("boxViewModal");
  if (!dialogEl || !modalEl) return;

  if (!state.ui.boxModalShiftSources) {
    state.ui.boxModalShiftSources = new Map();
  }
  const shifts = state.ui.boxModalShiftSources;

  if (source == null) {
    shifts.clear();
  } else if (enable) {
    const resolved = direction === "left" ? "left" : "right";
    shifts.set(source, resolved);
  } else {
    shifts.delete(source);
  }

  const activeDirections = Array.from(shifts.values());
  const currentDirection = activeDirections[activeDirections.length - 1] || null;

  dialogEl.classList.remove("shifted-left", "shifted-right");
  if (currentDirection === "left") {
    dialogEl.classList.add("shifted-left");
  } else if (currentDirection === "right") {
    dialogEl.classList.add("shifted-right");
  }

  if (shifts.size) {
    modalEl.classList.add("stacked");
  } else {
    modalEl.classList.remove("stacked");
  }
}

export function setupBoxModalResizeToggle(state) {
  if (state.ui.boxViewResizeInitialized) return;
  const toggle = document.getElementById("boxViewExpandToggle");
  if (!toggle) return;
  const dialogEl = state.ui.boxViewModalDialogEl || document.getElementById("boxViewModalDialog");
  const contentEl = document.getElementById("boxViewModalContent");
  const applyState = () => {
    const expanded = Boolean(state.ui.boxViewModalExpanded);
    if (dialogEl) {
      dialogEl.classList.toggle("expanded", expanded);
    }
    if (contentEl) {
      contentEl.classList.toggle("expanded", expanded);
    }
    toggle.setAttribute("aria-pressed", expanded ? "true" : "false");
  };
  toggle.addEventListener("click", () => {
    state.ui.boxViewModalExpanded = !state.ui.boxViewModalExpanded;
    applyState();
  });
  applyState();
  state.ui.boxViewResizeInitialized = true;
}
