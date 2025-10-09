import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrainCircuit, Database, LineChart, Sparkles } from "lucide-react";
import { Dataset, Visualization } from "@/api/entities";
import GlobalForceGraph from "../components/constructor/GlobalForceGraph";
import DashboardBuilder from "../components/constructor/DashboardBuilder";
import AutomatedReportGenerator from "../components/constructor/AutomatedReportGenerator";

export default function Constructor() {
  const [activeMode, setActiveMode] = useState('dashboard');
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReportGenerator, setShowReportGenerator] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const widgetLibrary = useMemo(() => {
    const baseWidgets = [
      {
        id: 'stats',
        type: 'stats',
        title: 'Статистика',
        icon: Database,
        description: 'Быстрые показатели и ключевые цифры',
      },
      {
        id: 'chart',
        type: 'chart',
        title: 'График',
        icon: LineChart,
        description: 'Диаграмма с настраиваемыми параметрами',
      },
    ];

    const datasetWidgets = datasets.map((dataset) => ({
      id: `dataset-${dataset.id}`,
      type: 'dataset',
      title: dataset.name,
      icon: Database,
      datasetId: dataset.id,
      description: dataset.description,
      rowCount: dataset.row_count,
      tags: dataset.tags,
    }));

    const visualizationWidgets = visualizations.map((viz) => ({
      id: `visualization-${viz.id}`,
      type: 'visualization',
      title: viz.title,
      icon: LineChart,
      datasetId: viz.dataset_id,
      visualizationId: viz.id,
      chartType: viz.type,
      summary: viz.summary,
      tags: viz.tags,
    }));

    return [...baseWidgets, ...datasetWidgets, ...visualizationWidgets];
  }, [datasets, visualizations]);

  const handleDashboardSave = useCallback(() => {
    // Заготовка для будущей интеграции с бэкендом сохранения дашбордов
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.list('-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      setError('Не удалось загрузить данные для конструктора. Попробуйте обновить страницу или повторить попытку позже.');
    }
    setIsLoading(false);
  };

  if (showReportGenerator) {
    return <AutomatedReportGenerator 
              datasets={datasets} 
              visualizations={visualizations}
              onClose={() => setShowReportGenerator(false)} 
            />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent heading-text">
            Конструктор отчетов и связей
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto elegant-text">
            Создавайте интерактивные дашборды, анализируйте глобальные взаимосвязи или сформируйте автоматический локальный отчёт.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="bg-red-50/80 border-red-200 text-red-800">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Mode Selector */}
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-center gap-2 flex-wrap">
              <Button 
                onClick={() => setActiveMode('dashboard')} 
                variant={activeMode === 'dashboard' ? 'default' : 'ghost'} 
                className="gap-2"
              >
                <Layout className="w-4 h-4" />
                Дашборд-конструктор
              </Button>
              <Button
                onClick={() => setActiveMode('connections')}
                variant={activeMode === 'connections' ? 'default' : 'ghost'}
                className="gap-2"
              >
                <BrainCircuit className="w-4 h-4" />
                Анализ связей
              </Button>
              <Button
                onClick={() => setShowReportGenerator(true)}
                variant={'ghost'}
                className="gap-2 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
              >
                <Sparkles className="w-4 h-4" />
                Сводный локальный отчёт
              </Button>
            </div>
          </CardContent>
        </Card>

        {activeMode === 'dashboard' && (
          <DashboardBuilder
            datasets={datasets}
            visualizations={visualizations}
            availableWidgets={widgetLibrary}
            onSave={handleDashboardSave}
            isLoading={isLoading}
          />
        )}

        {activeMode === 'connections' && (
          <GlobalForceGraph onClose={() => setActiveMode('dashboard')} />
        )}
      </div>
    </div>
  );
}