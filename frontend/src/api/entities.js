const API_BASE = import.meta.env.VITE_API_BASE || '';
export const Dataset = {
  async list(orderBy = '-created_date') {
    const r = await fetch(`${API_BASE}/api/dataset/list`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
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
