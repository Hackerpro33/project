// Новый entities.js — только обращения к твоему FastAPI backend

// Получить список датасетов
export async function getDatasets() {
  const res = await fetch('/api/dataset/list');
  return res.json();
}

// Получить визуализации (заглушка, до внедрения)
export async function getVisualizations() {
  // Здесь будет реальный API позже
  return [];
}

// Пользовательские функции — позже реализуем через backend

