import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  LineChart, 
  ScatterChart,
  TrendingUp,
  Plus,
  Filter
} from "lucide-react";

import ChartBuilder from "../components/charts/ChartBuilder";
import ChartGallery from "../components/charts/ChartGallery";
import ChartTypeSelector from "../components/charts/ChartTypeSelector";

export default function Charts() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedChartType, setSelectedChartType] = useState('line');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.filter({ type: ['line', 'bar', 'scatter', 'area'] }, '-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
    setIsLoading(false);
  };

  const handleCreateChart = (chartType) => {
    setSelectedChartType(chartType);
    setShowBuilder(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Конструктор графиков
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Создавайте красивые интерактивные графики из ваших данных. Выберите из множества типов диаграмм и настройте под свои потребности.
          </p>
        </div>

        {/* Chart Type Selector */}
        {!showBuilder && (
          <ChartTypeSelector 
            onSelectType={handleCreateChart}
            datasets={datasets}
          />
        )}

        {/* Chart Builder */}
        {showBuilder && (
          <ChartBuilder 
            chartType={selectedChartType}
            datasets={datasets}
            onClose={() => setShowBuilder(false)}
            onSave={loadData}
          />
        )}

        {/* Chart Gallery */}
        {!showBuilder && (
          <ChartGallery 
            visualizations={visualizations}
            isLoading={isLoading}
            onEdit={(viz) => {
              setSelectedChartType(viz.type);
              setShowBuilder(true);
            }}
          />
        )}
      </div>
    </div>
  );
}