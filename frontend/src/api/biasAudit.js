import { jsonRequest } from './http';

export function runBiasAudit(payload) {
  return jsonRequest('/api/v1/audit/bias/run', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchBiasAuditHistory() {
  return jsonRequest('/api/v1/audit/bias/history');
}

export function deleteBiasAuditRecord(id) {
  return jsonRequest(`/api/v1/audit/bias/history/${id}`, { method: 'DELETE' });
}

export function fetchBiasAuditSchedules() {
  return jsonRequest('/api/v1/audit/bias/schedules');
}

export function createBiasAuditSchedule(payload) {
  return jsonRequest('/api/v1/audit/bias/schedules', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateBiasAuditSchedule(id, payload) {
  return jsonRequest(`/api/v1/audit/bias/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export function deleteBiasAuditSchedule(id) {
  return jsonRequest(`/api/v1/audit/bias/schedules/${id}`, {
    method: 'DELETE'
  });
}
