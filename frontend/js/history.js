import { bootstrapHistoryPage } from "./pages/history/page.js";
import { initDropdownAutoClose } from "./common/dropdownUtils.js";
import { initAuthControls } from "./common/authControls.js";
import { renderUserDropdown } from "./common/userDropdown.js";

document.addEventListener("DOMContentLoaded", async () => {
  renderUserDropdown(document.getElementById("userDropdownPlaceholder"));
  initDropdownAutoClose();
  await initAuthControls();
  await bootstrapHistoryPage();
});
