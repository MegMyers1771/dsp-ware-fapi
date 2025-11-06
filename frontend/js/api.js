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
  await fetch(`${API_URL}/boxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tab_id: tabId, name, description }),
  });
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
      slot_id: null,
      metadata_json,
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

// ---- Tags ----
export async function createTag(tagData) {
  const res = await fetch(`${API_URL}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tagData),
  });
  return await res.json();
}

