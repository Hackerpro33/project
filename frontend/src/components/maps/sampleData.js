const samplePoints = [
  {
    lat: 55.7558,
    lon: 37.6173,
    value: 850,
    name: "Москва",
    category: "Мегаполис",
    forecast: 920,
    correlation: 0.88,
    description: "Столица России, центр экономической активности"
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    value: 720,
    name: "Санкт-Петербург",
    category: "Культурный центр",
    forecast: 780,
    correlation: 0.75,
    description: "Северная столица, культурный и образовательный центр"
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    value: 480,
    name: "Екатеринбург",
    category: "Промышленный",
    forecast: 510,
    correlation: 0.82,
    description: "Крупный промышленный центр Урала"
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    value: 520,
    name: "Новосибирск",
    category: "Научный",
    forecast: 580,
    correlation: 0.79,
    description: "Научный центр Сибири"
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    value: 380,
    name: "Красноярск",
    category: "Региональный",
    forecast: 420,
    correlation: 0.71,
    description: "Административный центр Красноярского края"
  },
  {
    lat: 53.2001,
    lon: 50.15,
    value: 450,
    name: "Самара",
    category: "Промышленный",
    forecast: 490,
    correlation: 0.77,
    description: "Авиакосмическая промышленность"
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    value: 410,
    name: "Саратов",
    category: "Образовательный",
    forecast: 440,
    correlation: 0.73,
    description: "Образовательный и научный центр Поволжья"
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    value: 390,
    name: "Ростов-на-Дону",
    category: "Торговый",
    forecast: 430,
    correlation: 0.69,
    description: "Торговые ворота Юга России"
  }
];

export const sampleTimeSeries = [
  // Москва
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q1",
    value: 790,
    name: "Москва",
    category: "Мегаполис"
  },
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q2",
    value: 820,
    name: "Москва",
    category: "Мегаполис"
  },
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q3",
    value: 850,
    name: "Москва",
    category: "Мегаполис"
  },
  // Санкт-Петербург
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q1",
    value: 700,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q2",
    value: 715,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q3",
    value: 720,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  // Екатеринбург
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q1",
    value: 470,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q2",
    value: 465,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q3",
    value: 480,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  // Новосибирск
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q1",
    value: 500,
    name: "Новосибирск",
    category: "Научный"
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q2",
    value: 515,
    name: "Новосибирск",
    category: "Научный"
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q3",
    value: 520,
    name: "Новосибирск",
    category: "Научный"
  },
  // Красноярск
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q1",
    value: 395,
    name: "Красноярск",
    category: "Региональный"
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q2",
    value: 388,
    name: "Красноярск",
    category: "Региональный"
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q3",
    value: 380,
    name: "Красноярск",
    category: "Региональный"
  },
  // Самара
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q1",
    value: 420,
    name: "Самара",
    category: "Промышленный"
  },
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q2",
    value: 435,
    name: "Самара",
    category: "Промышленный"
  },
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q3",
    value: 450,
    name: "Самара",
    category: "Промышленный"
  },
  // Саратов
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q1",
    value: 405,
    name: "Саратов",
    category: "Образовательный"
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q2",
    value: 400,
    name: "Саратов",
    category: "Образовательный"
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q3",
    value: 410,
    name: "Саратов",
    category: "Образовательный"
  },
  // Ростов-на-Дону
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q1",
    value: 370,
    name: "Ростов-на-Дону",
    category: "Торговый"
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q2",
    value: 380,
    name: "Ростов-на-Дону",
    category: "Торговый"
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q3",
    value: 390,
    name: "Ростов-на-Дону",
    category: "Торговый"
  }
];

export default samplePoints;
