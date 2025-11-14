import { deleteTab, fetchTabs } from "../../api.js";
import { escapeHtml } from "../../common/dom.js";
import { renderTagFillCell } from "../../common/tagTemplates.js";

export function createTabsTable(state, { onAttachTag, onEditTab } = {}) {
  async function renderTabs() {
    await maybeEnsureTags(state);
    const tabs = await fetchTabs();
    state.latestTabsSnapshot = tabs || [];

    let tbody = document.getElementById("tabsTableBody");
    const container = document.getElementById("tabsTableContainer") || document.getElementById("tabs-table");
    if (!tbody && container) {
      container.innerHTML = `
        <table id="tabsTable" class="table table-hover table-striped">
          <thead class="table-dark">
            <tr>
              <th style="width:80px">ID</th>
              <th style="width:140px">Tags</th>
              <th>Name</th>
              <th style="width:120px" class="text-center">Boxes</th>
              <th style="width:200px" class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody id="tabsTableBody"></tbody>
        </table>
      `;
      tbody = document.getElementById("tabsTableBody");
    }

    if (!tbody) return;
    tbody.innerHTML = "";

    if (!tabs || !tabs.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Вкладок нет</td></tr>`;
      return;
    }

    tabs.forEach((tab) => {
      const tabUrl = `/static/tab.html?tab_id=${encodeURIComponent(tab.id)}`;
      const tr = document.createElement("tr");
      tr.dataset.tabId = tab.id;
      tr.innerHTML = `
        <td><a class="tab-link" href="${tabUrl}">${escapeHtml(tab.id)}</a></td>
        <td class="tag-fill-cell">${renderTagFillCell(tab.tag_ids, { tagLookup: state.tagStore.getById })}</td>
        <td><a class="tab-link" href="${tabUrl}">${escapeHtml(tab.name)}</a></td>
        <td class="text-center"><a class="tab-link" href="${tabUrl}">${escapeHtml(tab.box_count ?? 0)}</a></td>
        <td class="text-center">
          <div class="btn-group" role="group">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-sm btn-outline-secondary tab-actions-dropdown" type="button" data-bs-toggle="dropdown" aria-expanded="false">•••</button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item attach-tag-btn" type="button">Привязать тэг</button></li>
                <li><button class="dropdown-item edit-tab-btn" type="button">Редактировать</button></li>
                <li><hr class="dropdown-divider"></li>
                <li><button class="dropdown-item text-danger delete-tab-btn" type="button">Удалить</button></li>
              </ul>
            </div>
          </div>
        </td>
      `;

      tr.querySelector(".tab-actions-dropdown")?.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      tr.querySelector(".attach-tag-btn")?.addEventListener("click", (event) => {
        event.stopPropagation();
        onAttachTag?.(tab);
      });

      tr.querySelector(".edit-tab-btn")?.addEventListener("click", (event) => {
        event.stopPropagation();
        onEditTab?.(tab);
      });

      tr.querySelector(".delete-tab-btn")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm(`Удалить вкладку "${tab.name}"?`)) return;
        await deleteTab(tab.id);
        await renderTabs();
      });

      tr.addEventListener("click", () => {
        window.location.href = `/static/tab.html?tab_id=${tab.id}`;
      });

      tbody.appendChild(tr);
    });
  }

  return { render: renderTabs };
}

async function maybeEnsureTags(state) {
  try {
    await state.tagStore.refresh();
  } catch (err) {
    console.error("Не удалось обновить список тэгов", err);
  }
}
