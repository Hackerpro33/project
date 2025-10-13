import { jsonRequest } from './http'

export function exportConfig(format = 'json') {
  return jsonRequest(`/api/config/export?format=${encodeURIComponent(format)}`)
}

export function importConfigPayload({ format = 'json', content }) {
  if (!content) {
    throw new Error('content is required')
  }
  return jsonRequest('/api/config/import', {
    method: 'POST',
    body: JSON.stringify({ format, content }),
  })
}

export default {
  exportConfig,
  importConfig: importConfigPayload,
}
