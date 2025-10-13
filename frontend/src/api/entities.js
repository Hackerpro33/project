import { jsonRequest as request } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const Dataset = {
  async list(orderBy = '-created_at') {
    return request(`/api/v1/dataset/list${buildQuery({ order_by: orderBy })}`);
  },

  async get(id) {
    return request(`/api/v1/dataset/${id}`);
  },

  async create(payload) {
    return request('/api/v1/dataset/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/v1/dataset/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/v1/dataset/${id}`, {
      method: 'DELETE',
    });
  },
};

export const DatasetVersions = {
  async list(datasetId) {
    if (!datasetId) {
      throw new Error('datasetId is required');
    }
    return request(`/api/dataset/${datasetId}/versions`);
  },

  async create(datasetId, payload = {}) {
    if (!datasetId) {
      throw new Error('datasetId is required');
    }
    return request(`/api/dataset/${datasetId}/versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async diff(datasetId, currentId, previousId) {
    if (!datasetId || !currentId || !previousId) {
      throw new Error('datasetId, currentId и previousId обязательны');
    }
    return request(`/api/dataset/${datasetId}/versions/${currentId}/diff/${previousId}`);
  },

  async restore(datasetId, versionId) {
    if (!datasetId || !versionId) {
      throw new Error('datasetId и versionId обязательны');
    }
    return request(`/api/dataset/${datasetId}/versions/${versionId}/restore`, {
      method: 'POST',
    });
  },
};

export const Visualization = {
  async list(orderBy = '-created_at') {
    return request(`/api/v1/visualization/list${buildQuery({ order_by: orderBy })}`);
  },

  async filter(filters = {}, orderBy = '-created_at') {
    return request('/api/v1/visualization/filter', {
      method: 'POST',
      body: JSON.stringify({ filters, order_by: orderBy }),
    });
  },

  async get(id) {
    return request(`/api/v1/visualization/${id}`);
  },

  async create(payload) {
    return request('/api/v1/visualization/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/v1/visualization/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/v1/visualization/${id}`, {
      method: 'DELETE',
    });
  },
};

export async function getDatasets() {
  return Dataset.list('-created_at');
}

export async function getVisualizations() {
  return Visualization.list('-created_at');
}
