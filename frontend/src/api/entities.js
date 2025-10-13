import { jsonRequest as request } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          search.append(key, entry);
        }
      });
      return;
    }
    if (value === '') return;
    search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const Dataset = {
  async list({
    orderBy = '-created_at',
    page = 1,
    pageSize = 20,
    search,
    tags,
  } = {}) {
    return request(
      `/api/dataset/list${buildQuery({
        order_by: orderBy,
        page,
        page_size: pageSize,
        search,
        tags,
      })}`
    );
  },

  async get(id) {
    return request(`/api/dataset/${id}`);
  },

  async create(payload) {
    return request('/api/dataset/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/dataset/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/dataset/${id}`, {
      method: 'DELETE',
    });
  },
};

export const Visualization = {
  async list({
    orderBy = '-created_at',
    page = 1,
    pageSize = 20,
    search,
    tags,
    types,
  } = {}) {
    return request(
      `/api/visualization/list${buildQuery({
        order_by: orderBy,
        page,
        page_size: pageSize,
        search,
        tags,
        types,
      })}`
    );
  },

  async filter(filters = {}, orderBy = '-created_at') {
    return request('/api/visualization/filter', {
      method: 'POST',
      body: JSON.stringify({ filters, order_by: orderBy }),
    });
  },

  async get(id) {
    return request(`/api/visualization/${id}`);
  },

  async create(payload) {
    return request('/api/visualization/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/visualization/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/visualization/${id}`, {
      method: 'DELETE',
    });
  },
};

export async function getDatasets() {
  const response = await Dataset.list();
  return response.items ?? response;
}

export async function getVisualizations() {
  const response = await Visualization.list();
  return response.items ?? response;
}
