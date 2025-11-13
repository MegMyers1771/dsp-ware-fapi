import { createTagStore } from "../../common/tagStore.js";
import { fetchTags } from "../../api.js";

export function createIndexState() {
  return {
    tagStore: createTagStore(fetchTags),
    latestTabsSnapshot: [],
    attachTabContext: null,
    pendingDeleteTagId: null,
    ui: {
      tagPillsContainer: null,
      tagOffcanvasInstance: null,
      tagNameInput: null,
      tagColorInput: null,
      attachModalInstance: null,
      attachSelectEl: null,
      attachTabIdInput: null,
      attachSubmitBtn: null,
      attachChipsEl: null,
      deleteModalInstance: null,
      deleteNameEl: null,
      deleteBindingsEl: null,
      deleteConfirmBtn: null,
    },
  };
}
