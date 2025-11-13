import { bootstrapHistoryPage } from "./pages/history/page.js";
import { initDropdownAutoClose } from "./common/dropdownUtils.js";
import { initAuthControls } from "./common/authControls.js";

document.addEventListener("DOMContentLoaded", async () => {
  initDropdownAutoClose();
  await initAuthControls();
  bootstrapHistoryPage();
});
