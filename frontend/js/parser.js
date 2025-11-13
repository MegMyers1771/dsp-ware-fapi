import { bootstrapParserPage } from "./pages/parser/page.js";
import { initDropdownAutoClose } from "./common/dropdownUtils.js";
import { initAuthControls } from "./common/authControls.js";

document.addEventListener("DOMContentLoaded", async () => {
  initDropdownAutoClose();
  await initAuthControls();
  bootstrapParserPage();
});
