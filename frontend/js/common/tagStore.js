// Simple in-memory cache for tags shared between pages.
export function createTagStore(fetchFn) {
  if (typeof fetchFn !== "function") {
    throw new Error("createTagStore expects a fetch function");
  }

  let cache = [];
  let tagsById = new Map();
  let loaded = false;

  const normalize = (tags) => {
    cache = Array.isArray(tags) ? tags : [];
    tagsById = new Map(cache.map((tag) => [Number(tag.id), tag]));
    loaded = true;
    return cache;
  };

  return {
    async refresh(force = false) {
      if (loaded && !force) return cache;
      const tags = await fetchFn();
      return normalize(tags);
    },
    getAll() {
      return cache;
    },
    getById(id) {
      return tagsById.get(Number(id));
    },
    getByIds(ids = []) {
      if (!Array.isArray(ids) || !ids.length) return [];
      return ids
        .map((id) => tagsById.get(Number(id)))
        .filter(Boolean);
    },
    clear() {
      cache = [];
      tagsById.clear();
      loaded = false;
    },
    isLoaded() {
      return loaded;
    },
  };
}
