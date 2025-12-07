import { bootstrapIndexPage } from "./pages/index/page.js";
import { initDropdownAutoClose } from "./common/dropdownUtils.js";
import { initAuthControls } from "./common/authControls.js";
import { ensureCreationModals } from "./common/sharedModals.js";
import { renderUserDropdown } from "./common/userDropdown.js";

document.addEventListener("DOMContentLoaded", async () => {
  ensureCreationModals();
  renderUserDropdown(document.getElementById("userDropdownPlaceholder"));
  initDropdownAutoClose();
  await initAuthControls();
  bootstrapIndexPage();
});
