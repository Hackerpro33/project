import { jsonRequest as request } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value
        .filter((item) => item !== undefined && item !== null && item !== '')
        .forEach((item) => {
          search.append(key, item);
        });
      return;
    }

    if (value === '') {
      return;
    }

    search.append(key, value);
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

function hasUsableValue(options, key) {
  if (!Object.prototype.hasOwnProperty.call(options, key)) {
    return false;
  }

  const value = options[key];

  if (Array.isArray(value)) {
    return value.some(
      (item) => item !== undefined && item !== null && item !== '',
    );
  }

  return value !== undefined && value !== null && value !== '';
}

function shouldUseLegacyList(options, keys) {
  return keys.some((key) => hasUsableValue(options, key));
}

export const Dataset = {
  async list(options = {}) {
    const {
      orderBy = '-created_at',
      page = 1,
      pageSize = 20,
      search,
      tags,
    } = options;

    const useLegacyList = shouldUseLegacyList(options, [
      'page',
      'pageSize',
      'search',
      'tags',
    ]);

    const query = useLegacyList
      ? buildQuery({
          order_by: orderBy,
          page,
          page_size: pageSize,
          search,
          tags,
        })
      : buildQuery({ order_by: orderBy });

    const endpoint = useLegacyList ? '/api/dataset/list' : '/api/v1/dataset/list';

    return request(`${endpoint}${query}`);
  },

  async search({
    query,
    tags = [],
    types = [],
    owners = [],
    limit,
    orderBy,
  } = {}) {
    return request(
      `/api/dataset/search${buildQuery({
        query,
        tags,
        dataset_types: types,
        owners,
        limit,
        order_by: orderBy,
      })}`,
    );
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

  async profile(payload) {
    return request('/api/dataset/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async validate(payload) {
    return request('/api/dataset/validate', {
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

  async similar(id, options = {}) {
    return request(
      `/api/dataset/${id}/similar${buildQuery({ limit: options.limit })}`,
    );
  },

  async regenerateSummary(id) {
    return request(`/api/dataset/${id}/auto-summary`, {
      method: 'POST',
    });
  },

  async monitorMetrics(payload) {
    return request('/api/dataset/monitor', {
      method: 'POST',
      body: JSON.stringify(payload),
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
    return request(
      `/api/dataset/${datasetId}/versions/${currentId}/diff/${previousId}`,
    );
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
  async list(options = {}) {
    const {
      orderBy = '-created_at',
      page = 1,
      pageSize = 20,
      search,
      tags,
      types,
    } = options;

    const useLegacyList = shouldUseLegacyList(options, [
      'page',
      'pageSize',
      'search',
      'tags',
      'types',
    ]);

    const query = useLegacyList
      ? buildQuery({
          order_by: orderBy,
          page,
          page_size: pageSize,
          search,
          tags,
          types,
        })
      : buildQuery({ order_by: orderBy });

    const endpoint = useLegacyList
      ? '/api/visualization/list'
      : '/api/v1/visualization/list';

    return request(`${endpoint}${query}`);
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

export async function getDatasets(options) {
  const response = await Dataset.list(options);
  return response?.items ?? response;
}

export async function getVisualizations(options) {
  const response = await Visualization.list(options);
  return response?.items ?? response;
}
