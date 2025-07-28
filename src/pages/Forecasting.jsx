
import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { InvokeLLM, SendEmail } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Sparkles, BrainCircuit, BarChart3, Mail, Map } from "lucide-react";
import ForecastSetup from "../components/forecasting/ForecastSetup";
import ForecastResult from "../components/forecasting/ForecastResult";
import CorrelationMatrix from "../components/forecasting/CorrelationMatrix";
import MapView from "../components/maps/MapView";
import MapConfigurator from "../components/maps/MapConfigurator";

const forecastSchema = {
  type: "object",
  properties: {
    forecast_data: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", format: "date" },
          predicted_value: { type: "number" },
          confidence_lower: { type: "number" },
          confidence_upper: { type: "number" }
        },
        required: ["date", "predicted_value"]
      }
    },
    summary: {
      type: "object",
      properties: {
        predicted_growth_percentage: { type: "number" },
        key_insights: { type: "array", items: { type: "string" } },
        seasonality_detected: { type: "boolean" },
        trend_direction: { type: "string", enum: ["возрастающий", "убывающий", "стабильный"] },
        volatility_level: { type: "string", enum: ["низкая", "средняя", "высокая"] },
        confidence_score: { type: "number" },
        risk_factors: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } }
      },
      required: ["predicted_growth_percentage", "key_insights"]
    }
  },
  required: ["forecast_data", "summary"]
};

export default function Forecasting() {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isForecasting, setIsForecasting] = useState(false);
  const [forecastResult, setForecastResult] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [correlationResult, setCorrelationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('forecast');

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await Dataset.list('-created_date');
      setDatasets(data);
    } catch (error) {
      console.error('Ошибка загрузки наборов данных:', error);
    }
    setIsLoading(false);
  };
  
  const handleSendSummary = async () => {
    if (!forecastResult) return;
    
    const subject = `AI-прогноз: Результаты анализа`;
    const body = `
      <h1>Отчет по прогнозу</h1>
      <h2>Ключевые выводы:</h2>
      <ul>
        ${forecastResult.summary.key_insights.map(item => `<li>${item}</li>`).join('')}
      </ul>
      <p><b>Прогнозируемый рост:</b> ${forecastResult.summary.predicted_growth_percentage.toFixed(1)}%</p>
      <p><b>Направление тренда:</b> ${forecastResult.summary.trend_direction}</p>
      <p><b>Уровень волатильности:</b> ${forecastResult.summary.volatility_level}</p>
      <p><b>Оценка достоверности:</b> ${(forecastResult.summary.confidence_score * 100).toFixed(1)}%</p>
      <h3>Рекомендации:</h3>
      <ul>
        ${forecastResult.summary.recommendations?.map(rec => `<li>${rec}</li>`).join('') || '<li>Рекомендации не сформированы</li>'}
      </ul>
      <p>Отчет сгенерирован автоматически платформой DataViz Pro.</p>
    `;
    
    const userEmail = "user@example.com"; 
    
    try {
      await SendEmail({
        to: userEmail,
        subject: subject,
        body: body,
        from_name: "DataViz Pro Аналитика"
      });
      alert(`Отчет отправлен на ${userEmail}`);
    } catch (error) {
      console.error("Ошибка отправки email:", error);
      alert("Не удалось отправить отчет.");
    }
  }

  const handleGenerateForecast = async (config) => {
    setIsForecasting(true);
    setForecastResult(null);

    // Генерация более реалистичных исторических данных
    const generateHistoricalData = (days, baseValue, volatility = 0.1, trend = 0.02) => {
      const data = [];
      let currentValue = baseValue;
      
      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
        
        // Добавляем сезонность (годовой цикл)
        const seasonality = Math.sin((i / 365) * 2 * Math.PI) * baseValue * 0.1;
        
        // Добавляем недельную сезонность
        const weeklySeasonality = Math.sin((i / 7) * 2 * Math.PI) * baseValue * 0.05;
        
        // Случайные флуктуации
        const randomNoise = (Math.random() - 0.5) * baseValue * volatility;
        
        // Тренд
        currentValue = baseValue + (i * trend * baseValue / days) + seasonality + weeklySeasonality + randomNoise;
        
        data.push({
          date: date.toISOString().split('T')[0],
          value: Math.max(0, currentValue)
        });
      }
      return data;
    };

    const mockHistorical = generateHistoricalData(365, 1000, 0.15, 0.05);
    setHistoricalData(mockHistorical);

    try {
      const externalFactorsPrompt = config.external_factors?.length > 0 
        ? `Учтите следующие внешние факторы (экзогенные переменные) при построении прогноза: ${config.external_factors.join(', ')}.`
        : '';
        
      const prompt = `
        Вы — эксперт по анализу временных рядов и машинному обучению с глубокими знаниями в области прогнозирования.
        
        Проанализируйте предоставленные исторические данные за ${mockHistorical.length} дней и создайте детальный прогноз на ${config.horizon} дней вперед.
        
        ДАННЫЕ ДЛЯ АНАЛИЗА:
        - Основной временной ряд: '${config.value_column}' из набора данных с ID ${config.dataset_id}
        - Столбец даты: '${config.date_column}'
        - Последние 30 точек данных: ${JSON.stringify(mockHistorical.slice(-30))}
        - Статистика: мин=${Math.min(...mockHistorical.map(d => d.value)).toFixed(2)}, макс=${Math.max(...mockHistorical.map(d => d.value)).toFixed(2)}, среднее=${(mockHistorical.reduce((a,b) => a + b.value, 0) / mockHistorical.length).toFixed(2)}
        
        ${externalFactorsPrompt}
        
        ТРЕБОВАНИЯ К АНАЛИЗУ:
        1. Определите наличие сезонности (годовая, недельная, месячная)
        2. Выявите основной тренд (возрастающий/убывающий/стабильный)
        3. Оцените уровень волатильности и его влияние на прогноз.
        4. Рассчитайте доверительные интервалы для прогноза с вероятностью 95%.
        5. Определите ключевые факторы риска и дайте практические рекомендации по их митигации.
        6. Проанализируйте влияние указанных внешних факторов на прогнозируемый показатель.
        
        МЕТОДОЛОГИЯ:
        - Используйте ансамбль моделей, включая SARIMAX (для учета внешних факторов), Prophet и градиентный бустинг (например, LightGBM).
        - Примените кросс-валидацию на временных рядах для оценки качества и устойчивости модели.
        - Учтите возможные структурные сдвиги, аномалии и выбросы в данных.
        
        Предоставьте результат в указанном JSON формате с подробным анализом.
      `;

      const result = await InvokeLLM({
        prompt: prompt,
        response_json_schema: forecastSchema
      });
      
      // Сохранение прогноза как визуализации
      await Visualization.create({
        title: `Прогноз: ${config.value_column}`,
        type: 'forecast',
        dataset_id: config.dataset_id,
        config: config,
        x_axis: config.date_column,
        y_axis: config.value_column
      });
      
      setForecastResult(result);

    } catch (error) {
      console.error("Ошибка генерации прогноза:", error);
    }
    setIsForecasting(false);
  };
  
  const handleCorrelationCalculated = (result) => {
    setCorrelationResult(result);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Прогнозирование и анализ
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Предсказывайте будущие тенденции и принимайте решения на основе данных. Наш AI анализирует ваши данные для предоставления точных прогнозов и инсайтов.
          </p>
        </div>
        
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-center gap-2 flex-wrap">
              <Button onClick={() => setActiveTab('forecast')} variant={activeTab === 'forecast' ? 'default' : 'ghost'} className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Прогнозирование
              </Button>
              <Button onClick={() => setActiveTab('correlation')} variant={activeTab === 'correlation' ? 'default' : 'ghost'} className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Матрица корреляций
              </Button>
              <Button 
                onClick={() => setActiveTab('map')} 
                variant={activeTab === 'map' ? 'default' : 'ghost'} 
                className="gap-2"
                disabled={!forecastResult && !correlationResult}
              >
                <Map className="w-4 h-4" />
                Анализ на карте
              </Button>
            </div>
          </CardContent>
        </Card>

        {activeTab === 'forecast' && (
          forecastResult ? (
            <ForecastResult 
              result={forecastResult} 
              historicalData={historicalData}
              onReset={() => setForecastResult(null)} 
              onSendSummary={handleSendSummary}
            />
          ) : (
            <ForecastSetup 
              datasets={datasets}
              onGenerate={handleGenerateForecast}
              isLoading={isLoading}
              isForecasting={isForecasting}
            />
          )
        )}
        
        {activeTab === 'correlation' && (
          <CorrelationMatrix 
            datasets={datasets} 
            isLoading={isLoading}
            onCorrelationCalculated={handleCorrelationCalculated}
          />
        )}

        {activeTab === 'map' && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <MapConfigurator 
                datasets={datasets}
                onSave={() => alert("Сохранение карты из этого режима не поддерживается. Настройте и сохраните карту во вкладке 'Карты'.")}
                onCancel={() => {}}
                initialConfig={{}}
                forecastData={forecastResult}
                correlationData={correlationResult}
              />
            </div>
            <div className="lg:col-span-2">
              <MapView />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
