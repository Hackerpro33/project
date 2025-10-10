const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message;
    try {
      message = await response.text();
    } catch (error) {
      message = response.statusText;
    }
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function fetchAssistantState(userId) {
  return request(`/api/chat/state/${encodeURIComponent(userId)}`);
}

export async function sendChatMessage(userId, message) {
  return request('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, message }),
  });
}

export async function updateAssistantInstructions(userId, instructions) {
  return request('/api/chat/instructions', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, instructions }),
  });
}

export async function resetAssistantConversation(userId) {
  return request('/api/chat/reset', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}
