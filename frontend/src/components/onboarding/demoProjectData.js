const now = new Date()

const daysAgo = (days) => {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

export const demoDatasets = [
  {
    id: 'demo-revenue-dataset',
    name: 'Продажи Q-commerce',
    owner: 'demo@local',
    created_date: daysAgo(2),
    row_count: 24500,
    tags: ['ecommerce', 'daily'],
  },
  {
    id: 'demo-marketing-dataset',
    name: 'Маркетинговые кампании',
    owner: 'demo@local',
    created_date: daysAgo(5),
    row_count: 8200,
    tags: ['marketing', 'attribution'],
  },
  {
    id: 'demo-logistics-dataset',
    name: 'Логистика доставок',
    owner: 'demo@local',
    created_date: daysAgo(7),
    row_count: 15600,
    tags: ['operations', 'geo'],
  },
]

export const demoVisualizations = [
  {
    id: 'demo-revenue-visualization',
    name: 'Динамика выручки по неделям',
    created_date: daysAgo(1),
    type: 'line',
    metric: 'revenue',
  },
  {
    id: 'demo-forecast-visualization',
    name: 'Прогноз спроса на следующий квартал',
    created_date: daysAgo(3),
    type: 'forecast',
    metric: 'demand',
  },
  {
    id: 'demo-map-visualization',
    name: 'География заказов',
    created_date: daysAgo(4),
    type: 'map',
    metric: 'orders',
  },
]

export const demoProjectSummary = {
  title: 'Демо-проект «Аналитика доставки»',
  description:
    'Испытайте готовый дашборд с набором данных и визуализациями: продажи, маркетинг и логистика в одном месте.',
}

