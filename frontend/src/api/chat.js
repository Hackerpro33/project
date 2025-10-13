import { jsonRequest } from './http';

export async function fetchAssistantState(userId) {
  return jsonRequest(`/api/v1/chat/state/${encodeURIComponent(userId)}`);
}

export async function sendChatMessage(userId, message) {
  return jsonRequest('/api/v1/chat/message', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, message }),
  });
}

export async function updateAssistantInstructions(userId, instructions) {
  return jsonRequest('/api/v1/chat/instructions', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, instructions }),
  });
}

export async function resetAssistantConversation(userId) {
  return jsonRequest('/api/v1/chat/reset', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}
