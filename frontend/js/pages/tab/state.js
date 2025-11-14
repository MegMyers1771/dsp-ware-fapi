import { createTagStore } from "../../common/tagStore.js";
import { fetchTags } from "../../api.js";

export function createTabState(tabId) {
  return {
    tabId: Number(tabId),
    tagStore: createTagStore(fetchTags),
    boxesById: new Map(),
    latestTabsSnapshot: [],
    currentBoxViewBoxId: null,
    currentTabEnablePos: true,
    itemFormMode: getDefaultItemFormMode(),
    searchFilters: {},
    lastSearchQuery: "",
    pendingDeleteTagId: null,
    contexts: {
      attachBox: null,
      attachItem: null,
      issue: null,
    },
    ui: {
      boxViewModalEl: null,
      boxViewModalDialogEl: null,
      boxModalShiftSources: new Map(),
      addItemOffcanvasEl: null,
      addItemOffcanvasInstance: null,
      issueOffcanvasEl: null,
      issueOffcanvasInstance: null,
      issueFormEl: null,
      issueFormController: null,
      tagPillsContainer: null,
      tagOffcanvasInstance: null,
      createTagForm: null,
      tagNameInput: null,
      tagColorInput: null,
      attachBox: {
        modalInstance: null,
        selectEl: null,
        idInput: null,
        submitBtn: null,
        chipsEl: null,
      },
      attachItem: {
        modalInstance: null,
        selectEl: null,
        idInput: null,
        submitBtn: null,
        formEl: null,
        chipsEl: null,
      },
      deleteTagModalInstance: null,
      deleteTagNameEl: null,
      deleteTagBindingsEl: null,
      deleteTagConfirmBtn: null,
    },
  };
}

export function getDefaultItemFormMode() {
  return {
    mode: "create",
    itemId: null,
    boxId: null,
    tagIds: [],
    qty: 1,
    position: 1,
  };
}
