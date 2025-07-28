import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Component, BrainCircuit, Sparkles, Plus, Layout, Save, Eye } from "lucide-react";
import { Dataset, Visualization } from "@/api/entities";
import GlobalForceGraph from "../components/constructor/GlobalForceGraph";
import DashboardBuilder from "../components/constructor/DashboardBuilder";

export default function Constructor() {
  const [activeMode, setActiveMode] = useState('dashboard');
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.list('-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent heading-text">
            Конструктор отчетов и связей
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto elegant-text">
            Создавайте интерактивные дашборды, объединяйте визуализации и анализируйте глобальные взаимосвязи.
          </p>
        </div>

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
            </div>
          </CardContent>
        </Card>

        {activeMode === 'dashboard' && (
          <DashboardBuilder 
            datasets={datasets}
            visualizations={visualizations}
            onSave={loadData}
            isLoading={isLoading}
          />
        )}

        {activeMode === 'connections' && (
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                <BrainCircuit className="w-5 h-5 text-purple-500" />
                Глобальный анализ связей
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <p className="text-slate-600 elegant-text max-w-2xl">
                  Нажмите кнопку, чтобы сгенерировать комплексный граф, который покажет все взаимосвязи между вашими наборами данных, графиками, картами и прогнозами. Искусственный интеллект проанализирует структуру вашего проекта и предоставит ключевые выводы.
                </p>
                <Button 
                  size="lg"
                  onClick={() => setActiveMode('graph')}
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-8 py-4 text-lg font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 gap-2 elegant-text"
                >
                  <Sparkles className="w-5 h-5" />
                  Проанализировать связи
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeMode === 'graph' && (
          <GlobalForceGraph onClose={() => setActiveMode('connections')} />
        )}
      </div>
    </div>
  );
}