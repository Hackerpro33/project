import { jsonRequest } from './http'

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value)
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function listTaskHistory(params = {}) {
  return jsonRequest(`/api/tasks/history${buildQuery(params)}`)
}

export function getTaskHistoryEntry(taskId) {
  if (!taskId) {
    throw new Error('taskId is required')
  }
  return jsonRequest(`/api/tasks/history/${taskId}`)
}

export function retryTask(taskId) {
  if (!taskId) {
    throw new Error('taskId is required')
  }
  return jsonRequest(`/api/tasks/history/${taskId}/retry`, { method: 'POST' })
}

export function previewDataset(fileId, options = {}) {
  if (!fileId) {
    throw new Error('fileId is required')
  }
  return jsonRequest(`/api/upload/${encodeURIComponent(fileId)}/preview${buildQuery(options)}`)
}

export default {
  listTaskHistory,
  getTaskHistoryEntry,
  retryTask,
  previewDataset,
}
