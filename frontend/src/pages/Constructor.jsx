import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Component, BrainCircuit, Sparkles, Plus, Layout, Save, Eye } from "lucide-react";
import { Dataset, Visualization } from "@/api/entities";
import GlobalForceGraph from "../components/constructor/GlobalForceGraph";
import DashboardBuilder from "../components/constructor/DashboardBuilder";
import AutomatedReportGenerator from "../components/constructor/AutomatedReportGenerator"; // Import new component

export default function Constructor() {
  const [activeMode, setActiveMode] = useState('dashboard');
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReportGenerator, setShowReportGenerator] = useState(false);

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
            Создавайте интерактивные дашборды, анализируйте глобальные взаимосвязи или сгенерируйте автоматический AI-отчет.
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
               <Button 
                onClick={() => setShowReportGenerator(true)} 
                variant={'ghost'} 
                className="gap-2 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
              >
                <Sparkles className="w-4 h-4" />
                Сводный AI-отчет
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
          <GlobalForceGraph onClose={() => setActiveMode('dashboard')} />
        )}
      </div>
    </div>
  );
}