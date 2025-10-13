import { jsonRequest } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function listSavedViews(entity) {
  return jsonRequest(`/api/views${buildQuery({ entity })}`);
}

export async function createSavedView(payload) {
  return jsonRequest('/api/views', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSavedView(id, payload) {
  return jsonRequest(`/api/views/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteSavedView(id) {
  return jsonRequest(`/api/views/${id}`, {
    method: 'DELETE',
  });
}

export async function getSavedView(id) {
  return jsonRequest(`/api/views/${id}`);
}
