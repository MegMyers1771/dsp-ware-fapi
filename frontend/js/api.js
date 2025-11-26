import { getAuthToken } from "./common/authStore.js";
import { notifyApiRequestEnd, notifyApiRequestStart } from "./common/apiSpinner.js";

const globalConfig =
  typeof window !== "undefined" && window.__APP_CONFIG ? window.__APP_CONFIG : {};

// export const API_URL = globalConfig.API_URL || (typeof window !== "undefined" ? window.location.origin : null) || "http://127.0.0.1:7878";
export const API_URL = window.location.origin || globalConfig.API_URL;

function buildHeaders(headers = {}, body) {
  const result = { ...headers };
  if (body && !(body instanceof FormData) && !result["Content-Type"]) {
    result["Content-Type"] = "application/json";
  }
  const token = getAuthToken();
  if (token) {
    result["Authorization"] = `Bearer ${token}`;
  }
  return result;
}

async function authFetch(url, { headers, body, ...rest } = {}) {
  notifyApiRequestStart();
  try {
    const response = await fetch(url, {
      ...rest,
      headers: buildHeaders(headers, body),
      body,
    });
    notifyApiRequestEnd(response?.status);
    return response;
  } catch (err) {
    notifyApiRequestEnd();
    throw err;
  }
}


export async function getItemsByBox(boxId) {
  const res = await authFetch(`${API_URL}/items/${boxId}`);
  if (!res.ok) {
    throw new Error("Не удалось получить список айтемов");
  }
  return await res.json();
}

export async function fetchSyncWorkerStatus() {
  const res = await authFetch(`${API_URL}/system/sync-worker`);
  if (!res.ok) throw new Error("Не удалось получить статус воркера синхронизации");
  return await res.json();
}

// ---- Tabs ----
export async function fetchTabs() {
  const res = await authFetch(`${API_URL}/tabs`);
  if (!res.ok) throw new Error("Не удалось загрузить вкладки");
  return await res.json();
}

export async function createTab(tabData) {
  const res = await authFetch(`${API_URL}/tabs`, {
    method: "POST",
    body: JSON.stringify(tabData),
  });

  if (res.status === 400) {
    let payload;
    try {
      payload = await res.json();
    } catch (err) {
      payload = null;
    }
    const message = payload?.detail || "Не удалось создать вкладку";
    throw new Error(message);
  }

  if (!res.ok) {
    const fallback = await res.text();
    throw new Error(fallback || "Ошибка при создании вкладки");
  }

  return await res.json();
}

export async function updateTab(id, tabData) {
  const res = await authFetch(`${API_URL}/tabs/${id}`, {
    method: "PUT",
    body: JSON.stringify(tabData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить вкладку");
  }
}

export async function deleteTab(id) {
  const res = await authFetch(`${API_URL}/tabs/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить вкладку");
  }
}

export async function fetchTabSyncSettings(tabId) {
  const res = await authFetch(`${API_URL}/tabs/${tabId}/sync`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить настройки синхронизации");
  }
  return await res.json();
}

export async function updateTabSyncSettings(tabId, payload) {
  const res = await authFetch(`${API_URL}/tabs/${tabId}/sync`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось сохранить настройки синхронизации");
  }
  return await res.json();
}

// ---- Tab Fields ----
export async function getTabFields(tabId) {
  const res = await authFetch(`${API_URL}/tab_fields/${tabId}`);
  if (!res.ok) throw new Error("Не удалось загрузить поля вкладки");
  return await res.json();
}

export async function createTabField(fieldData) {
  const res = await authFetch(`${API_URL}/tab_fields/`, {
    method: "POST",
    body: JSON.stringify(fieldData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось создать поле вкладки");
  }
  return await res.json();
}

export async function updateTabField(fieldId, fieldData) {
  const res = await authFetch(`${API_URL}/tab_fields/${fieldId}`, {
    method: "PUT",
    body: JSON.stringify(fieldData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить поле вкладки");
  }
  return await res.json();
}

export async function deleteTabField(fieldId) {
  const res = await authFetch(`${API_URL}/tab_fields/${fieldId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить поле вкладки");
  }
  return await res.json().catch(() => ({}));
}

// ---- Boxes ----
export async function getBoxes(tabId) {
  const res = await authFetch(`${API_URL}/boxes/${tabId}`);
  if (!res.ok) throw new Error("Не удалось загрузить ящики");
  return await res.json();
}

export async function createBox(tabId, name, description, capacity = null) {
  const res = await authFetch(`${API_URL}/boxes`, {
    method: "POST",
    body: JSON.stringify({ tab_id: tabId, name, description, capacity }),
  });

  if (res.status === 400) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const message = payload?.detail || "Не удалось создать ящик";
    throw new Error(message);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Ошибка при создании ящика");
  }

  return await res.json();
}

export async function updateBox(boxId, payload) {
  const res = await authFetch(`${API_URL}/boxes/${boxId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить ящик");
  }

  return await res.json();
}

// ---- Items ----
export async function addItem(tabId, boxId, name, qty, metadata_json, serial_number = null) {
  const res = await authFetch(`${API_URL}/items`, {
    method: "POST",
    body: JSON.stringify({
      name,
      qty,
      tab_id: tabId,
      box_id: boxId,
      metadata_json,
      tag_ids: [],
      serial_number,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось добавить айтем");
  }
  return await res.json();
}

export async function searchItems(tabId, query, options = {}) {
  const params = new URLSearchParams({
    tab_id: String(tabId),
    query: String(query),
    limit: "100",
  });
  if (options.tag_id) params.set("tag_id", String(options.tag_id));
  const res = await authFetch(`${API_URL}/items/search?${params.toString()}`);

  if (!res.ok) {
    console.error("Search request failed:", res.status);
    return { results: [], count: 0 };
  }
  
  return await res.json();
}

export async function issueInventoryItem(itemId, payload) {
  const res = await authFetch(`${API_URL}/items/${itemId}/issue`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось выдать айтем");
  }

  return await res.json();
}

export async function deleteItem(itemId) {
  const res = await authFetch(`${API_URL}/items/${itemId}`, { method: "DELETE" });
  return res;
}

export async function updateItem(itemId, payload) {
  const res = await authFetch(`${API_URL}/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить айтем");
  }

  return await res.json();
}

export async function reorderItems(boxId, orderedIds) {
  const res = await authFetch(`${API_URL}/items/reorder`, {
    method: "POST",
    body: JSON.stringify({ box_id: boxId, ordered_ids: orderedIds }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось сохранить порядок айтемов");
  }

  return await res.json();
}

// ---- Parser ----
export async function fetchParsedTabSummaries() {
  const res = await authFetch(`${API_URL}/parser/tabs`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить список вкладок");
  }
  return await res.json();
}

export async function fetchParsedTabDetail(tabName) {
  const res = await authFetch(`${API_URL}/parser/tabs/${encodeURIComponent(tabName)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить файл");
  }
  return await res.json();
}

export async function importParsedTab(tabName) {
  const res = await authFetch(`${API_URL}/parser/tabs/${encodeURIComponent(tabName)}/import`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось импортировать вкладку");
  }
  return await res.json();
}

export async function runParserJob(payload) {
  const res = await authFetch(`${API_URL}/parser/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось выполнить парсинг");
  }
  return await res.json();
}

export async function listParserConfigs() {
  const res = await authFetch(`${API_URL}/parser/configs`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить конфиги");
  }
  return await res.json();
}

export async function getParserConfig(configName) {
  const res = await authFetch(`${API_URL}/parser/configs/${encodeURIComponent(configName)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось получить конфиг");
  }
  return await res.json();
}

export async function createParserConfig(configData) {
  const res = await authFetch(`${API_URL}/parser/configs`, {
    method: "POST",
    body: JSON.stringify(configData),
  });
  if (res.status === 400) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const message = payload?.detail || "Не удалось сохранить конфиг";
    throw new Error(message);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось сохранить конфиг");
  }
  return await res.json();
}

export async function runParserConfig(configName) {
  const res = await authFetch(`${API_URL}/parser/configs/${encodeURIComponent(configName)}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось запустить парсер");
  }
  return await res.json();
}

export async function deleteParserConfig(configName) {
  const res = await authFetch(`${API_URL}/parser/configs/${encodeURIComponent(configName)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить конфиг");
  }
}

export async function fetchParserEnv() {
  const res = await authFetch(`${API_URL}/parser/env`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить настройки парсера");
  }
  return await res.json();
}

export async function updateParserEnv(payload) {
  const res = await authFetch(`${API_URL}/parser/env`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить настройки парсера");
  }
  return await res.json();
}

export async function uploadParserCredentials(payload) {
  const res = await authFetch(`${API_URL}/parser/credentials/upload`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить credentials");
  }
  return await res.json();
}

// ---- Tags ----
export async function createTag(tagData) {
  const res = await authFetch(`${API_URL}/tags`, {
    method: "POST",
    body: JSON.stringify(tagData),
  });

  if (res.status === 400) {
    let payload;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const message = payload?.detail || "Не удалось создать тэг";
    throw new Error(message);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Ошибка при создании тэга");
  }

  return await res.json();
}

export async function fetchTags() {
  const res = await authFetch(`${API_URL}/tags`);
  if (!res.ok) throw new Error("Не удалось получить список тэгов");
  return await res.json();
}

export async function attachTag(tagId, payload) {
  const res = await authFetch(`${API_URL}/tags/${tagId}/attach`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось привязать тэг");
  }
  return await res.json();
}

export async function detachTag(tagId, payload) {
  const res = await authFetch(`${API_URL}/tags/${tagId}/detach`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось отвязать тэг");
  }
  return await res.json();
}

export async function deleteTag(tagId) {
  const res = await authFetch(`${API_URL}/tags/${tagId}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить тэг");
  }
  return await res.json();
}

// ---- Statuses ----
export async function fetchStatuses() {
  const res = await authFetch(`${API_URL}/statuses`);
  if (!res.ok) throw new Error("Не удалось получить статусы");
  return await res.json();
}

export async function createStatus(statusData) {
  const res = await authFetch(`${API_URL}/statuses`, {
    method: "POST",
    body: JSON.stringify(statusData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось создать статус");
  }
  return await res.json();
}

export async function updateStatus(statusId, statusData) {
  const res = await authFetch(`${API_URL}/statuses/${statusId}`, {
    method: "PUT",
    body: JSON.stringify(statusData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить статус");
  }
  return await res.json();
}

export async function deleteStatus(statusId) {
  const res = await authFetch(`${API_URL}/statuses/${statusId}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить статус");
  }
  return await res.json().catch(() => ({}));
}

// ---- Issues ----
export async function fetchIssues(filters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.per_page) params.set("per_page", String(filters.per_page));
  if (filters.status_id) params.set("status_id", String(filters.status_id));
  if (filters.responsible) params.set("responsible", filters.responsible);
  if (filters.serial) params.set("serial", filters.serial);
  if (filters.invoice) params.set("invoice", filters.invoice);
  if (filters.item) params.set("item", filters.item);
  if (filters.tab) params.set("tab", filters.tab);
  if (filters.box) params.set("box", filters.box);
  if (filters.created_from) params.set("created_from", filters.created_from);
  if (filters.created_to) params.set("created_to", filters.created_to);
  const qs = params.toString();
  const res = await authFetch(`${API_URL}/issues${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить историю выдачи");
  }
  const data = await res.json();
  if (Array.isArray(data)) {
    return { items: data, total: data.length };
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = typeof data?.total === "number" ? data.total : items.length;
  return { items, total };
}

export async function downloadIssuesXlsx() {
  const res = await authFetch(`${API_URL}/issues/export`, { method: "GET" });
  if (res.status === 404) {
    throw new Error("Файл истории ещё не создан");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось скачать историю");
  }
  return await res.blob();
}

export async function updateIssueStatus(issueId, statusId) {
  const res = await authFetch(`${API_URL}/issues/${issueId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status_id: statusId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить статус");
  }
  return await res.json();
}

// ---- Auth & Users ----
export async function login(payload) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Неверное имя пользователя или пароль");
  }
  return await res.json();
}

export async function fetchCurrentUser() {
  const res = await authFetch(`${API_URL}/auth/me`);
  if (res.status === 401) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить профиль");
  }
  return await res.json();
}

export async function createUser(userData) {
  const res = await authFetch(`${API_URL}/auth/register`, {
    method: "POST",
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось создать пользователя");
  }
  return await res.json();
}

export async function listUsers() {
  const res = await authFetch(`${API_URL}/users`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось получить список пользователей");
  }
  return await res.json();
}

export async function updateUser(userId, payload) {
  const res = await authFetch(`${API_URL}/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось обновить пользователя");
  }
  return await res.json();
}

export async function deleteUser(userId) {
  const res = await authFetch(`${API_URL}/users/${userId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить пользователя");
  }
  return res;
}
