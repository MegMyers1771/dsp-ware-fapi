export const API_URL = "http://127.0.0.1:8000";


export async function getItemsByBox(boxId) {
  const res = await fetch(`${API_URL}/items/${boxId}`);
  return await res.json();
}

// ---- Tabs ----
export async function fetchTabs() {
  const res = await fetch(`${API_URL}/tabs`);
  return await res.json();
}

export async function createTab(tabData) {
  const res = await fetch(`${API_URL}/tabs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  await fetch(`${API_URL}/tabs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tabData),
  });
}

export async function deleteTab(id) {
  await fetch(`${API_URL}/tabs/${id}`, { method: "DELETE" });
}

// ---- Tab Fields ----
export async function getTabFields(tabId) {
  const res = await fetch(`${API_URL}/tab_fields/${tabId}`);
  return await res.json();
}

// ---- Boxes ----
export async function getBoxes(tabId) {
  const res = await fetch(`${API_URL}/boxes/${tabId}`);
  return await res.json();
}

export async function createBox(tabId, name, description) {
  const res = await fetch(`${API_URL}/boxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
export async function addItem(tabId, boxId, name, metadata_json) {
  await fetch(`${API_URL}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      tab_id: tabId,
      box_id: boxId,
      metadata_json,
      tag_ids: [],
    }),
  });
}

export async function searchItems(tabId, query) {
  const res = await fetch(
    `${API_URL}/items/search?tab_id=${tabId}&query=${encodeURIComponent(query)}&limit=100`
  );

  if (!res.ok) {
    console.error("Search request failed:", res.status);
    return { results: [], count: 0 };
  }
  
  return await res.json();
}

export async function deleteItem(itemId) {
  return await fetch(`${API_URL}/items/${itemId}`, { method: "DELETE" });
}

export async function reorderItems(boxId, orderedIds) {
  const res = await fetch(`${API_URL}/items/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ box_id: boxId, ordered_ids: orderedIds }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось сохранить порядок айтемов");
  }

  return await res.json();
}

// ---- Tags ----
export async function createTag(tagData) {
  const res = await fetch(`${API_URL}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`${API_URL}/tags`);
  if (!res.ok) throw new Error("Не удалось получить список тэгов");
  return await res.json();
}

export async function attachTag(tagId, payload) {
  const res = await fetch(`${API_URL}/tags/${tagId}/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось привязать тэг");
  }
  return await res.json();
}

export async function detachTag(tagId, payload) {
  const res = await fetch(`${API_URL}/tags/${tagId}/detach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось отвязать тэг");
  }
  return await res.json();
}

export async function deleteTag(tagId) {
  const res = await fetch(`${API_URL}/tags/${tagId}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Не удалось удалить тэг");
  }
  return await res.json();
}
