let dropdownCloserAttached = false;

export function initDropdownAutoClose() {
  if (dropdownCloserAttached || typeof document === "undefined") return;
  dropdownCloserAttached = true;

  activateDropdowns();
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("show.bs.dropdown", handleDropdownShow, true);
}

function activateDropdowns() {
  if (typeof document === "undefined" || typeof bootstrap === "undefined" || !bootstrap.Dropdown) return;
  document.querySelectorAll("[data-bs-toggle='dropdown']").forEach((toggle) => {
    bootstrap.Dropdown.getOrCreateInstance(toggle);
  });
}

function handleDocumentClick(event) {
  if (event.target.closest(".dropdown-menu")) return;
  if (event.target.closest("[data-bs-toggle='dropdown']")) return;
  closeAllDropdowns();
}

function handleDropdownShow(event) {
  const currentToggle = event.target;
  if (!currentToggle || !currentToggle.matches("[data-bs-toggle='dropdown']")) return;
  closeAllDropdowns(currentToggle);
}

function closeAllDropdowns(exceptToggle = null) {
  if (typeof document === "undefined" || typeof bootstrap === "undefined" || !bootstrap.Dropdown) return;
  const toggles = document.querySelectorAll("[data-bs-toggle='dropdown']");
  toggles.forEach((toggle) => {
    if (exceptToggle && toggle === exceptToggle) return;
    const instance = bootstrap.Dropdown.getInstance(toggle);
    if (instance) {
      instance.hide();
    }
  });
}
