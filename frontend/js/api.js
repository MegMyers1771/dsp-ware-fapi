import { getAuthToken } from "./common/authStore.js";

const globalConfig =
  typeof window !== "undefined" && window.__APP_CONFIG ? window.__APP_CONFIG : {};

export const API_URL = globalConfig.API_URL || "http://127.0.0.1:8000";

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
  const response = await fetch(url, {
    ...rest,
    headers: buildHeaders(headers, body),
    body,
  });
  return response;
}


export async function getItemsByBox(boxId) {
  const res = await authFetch(`${API_URL}/items/${boxId}`);
  if (!res.ok) {
    throw new Error("Не удалось получить список айтемов");
  }
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

export async function createBox(tabId, name, description) {
  const res = await authFetch(`${API_URL}/boxes`, {
    method: "POST",
    body: JSON.stringify({ tab_id: tabId, name, description }),
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

// ---- Items ----
export async function addItem(tabId, boxId, name, qty, metadata_json) {
  const res = await authFetch(`${API_URL}/items`, {
    method: "POST",
    body: JSON.stringify({
      name,
      qty,
      tab_id: tabId,
      box_id: boxId,
      metadata_json,
      tag_ids: [],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось добавить айтем");
  }
}

export async function searchItems(tabId, query) {
  const res = await authFetch(
    `${API_URL}/items/search?tab_id=${tabId}&query=${encodeURIComponent(query)}&limit=100`
  );

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
export async function fetchIssues() {
  const res = await authFetch(`${API_URL}/issues`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось загрузить историю выдачи");
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
    throw new Error(text || "Неверный email или пароль");
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
