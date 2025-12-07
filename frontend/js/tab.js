import { bootstrapTabPage } from "./pages/tab/page.js";
import { initDropdownAutoClose } from "./common/dropdownUtils.js";
import { initAuthControls } from "./common/authControls.js";
import { setupFieldControls } from "./pages/index/fields.js";
import { initTabActions } from "./pages/index/tabActions.js";
import { initStatusActions } from "./pages/index/statusActions.js";
import { ensureCreationModals } from "./common/sharedModals.js";
import { renderUserDropdown } from "./common/userDropdown.js";

document.addEventListener("DOMContentLoaded", async () => {
  ensureCreationModals();
  renderUserDropdown(document.getElementById("userDropdownPlaceholder"));
  initDropdownAutoClose();
  await initAuthControls();
  setupFieldControls();
  initTabActions({ onTabsChanged: () => {} });
  initStatusActions();
  bootstrapTabPage();
});
