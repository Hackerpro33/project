const API_BASE = import.meta.env.VITE_API_BASE || '';

function sortByOrder(items, orderBy) {
  if (!Array.isArray(items) || !orderBy) {
    return Array.isArray(items) ? [...items] : [];
  }
  const direction = orderBy.startsWith('-') ? -1 : 1;
  const field = orderBy.replace(/^[-+]/, '') || orderBy;
  return [...items].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];
    if (av === bv) return 0;
    if (av == null) return 1 * direction;
    if (bv == null) return -1 * direction;
    if (typeof av === 'number' && typeof bv === 'number') {
      return av > bv ? direction : -direction;
    }
    return String(av).localeCompare(String(bv)) * direction;
  });
}

export const Dataset = {
  async list(orderBy = '-created_date') {
    const r = await fetch(`${API_BASE}/api/dataset/list`);
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    return sortByOrder(data, orderBy);
  },
  async create(payload) {
    const r = await fetch(`${API_BASE}/api/dataset/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};
export async function getDatasets() { return Dataset.list('-created_date'); }

export const Visualization = {
  async list(orderBy = '-created_at') {
    const r = await fetch(`${API_BASE}/api/visualization/list`);
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    return sortByOrder(data, orderBy);
  },
  async filter(criteria = {}, orderBy = '-created_at') {
    const items = await this.list(orderBy);
    const keys = Object.keys(criteria || {});
    if (keys.length === 0) return items;
    return items.filter((item) =>
      keys.every((key) => {
        const expected = criteria[key];
        if (expected == null) return true;
        const value = item?.[key];
        if (Array.isArray(expected)) {
          return expected.includes(value);
        }
        if (typeof expected === 'object' && expected !== null) {
          return Object.entries(expected).every(([subKey, subValue]) => {
            const nested = value && typeof value === 'object' ? value[subKey] : undefined;
            return nested === subValue;
          });
        }
        return value === expected;
      }),
    );
  },
  async create(payload) {
    const r = await fetch(`${API_BASE}/api/visualization/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async update(id, payload) {
    const r = await fetch(`${API_BASE}/api/visualization/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(id) {
    const r = await fetch(`${API_BASE}/api/visualization/${id}`, {
      method: 'DELETE',
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

export async function getVisualizations() {
  return Visualization.list('-created_at');
}
