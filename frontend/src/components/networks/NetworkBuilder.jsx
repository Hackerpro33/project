
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Network, Save, ArrowLeft, Sparkles } from "lucide-react";
import NetworkVisualization from "./NetworkVisualization";
import { buildNetworkGraph } from "@/utils/localAnalysis";

export default function NetworkBuilder({ datasets, onSave, onCancel }) {
  const [config, setConfig] = useState({
    title: '',
    dataset_id: '',
    selectedColumns: [],
    nodeSize: 'medium',
    layout: 'force',
    showLabels: true,
    graphType: 'general' // New: general, social, geo
  });
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [generatedGraph, setGeneratedGraph] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ 
      ...prev, 
      dataset_id: datasetId, 
      selectedColumns: [] 
    }));
  };

  const handleColumnToggle = (columnName) => {
    setConfig(prev => ({
      ...prev,
      selectedColumns: prev.selectedColumns.includes(columnName)
        ? prev.selectedColumns.filter(c => c !== columnName)
        : [...prev.selectedColumns, columnName]
    }));
  };

  const handleGenerateGraph = async () => {
    if (!config.dataset_id || config.selectedColumns.length < 2) {
      alert("Выберите набор данных и минимум 2 столбца.");
      return;
    }
    setIsGenerating(true);
    setGeneratedGraph(null);

    const prompts = {
        general: `Постройте общий граф связей для столбцов: ${config.selectedColumns.join(', ')}. Проанализируйте корреляции и создайте узлы и связи.`,
        social: `Проанализируйте данные как социальную сеть. Идентифицируйте ключевых акторов (узлы) и их взаимодействия (связи) на основе столбцов: ${config.selectedColumns.join(', ')}. Рассчитайте центральность узлов.`,
        geo: `Создайте граф пространственных связей. Узлы - это локации, ребра - сила связи между ними (например, корреляция событий). Используйте столбцы: ${config.selectedColumns.join(', ')}.`
    };

    const columnMetadata = selectedDataset?.columns || [];
    const previewRows = selectedDataset?.sample_data?.slice(0, 50) || [];

    try {
        const result = buildNetworkGraph({
            datasetName: selectedDataset?.name || "",
            columns: columnMetadata,
            rows: previewRows,
            graphType: config.graphType,
        });
        setGeneratedGraph(result);
    } catch(e) {
        console.error("Ошибка генерации графа", e);
        alert("Ошибка при генерации графа локальными методами. Пожалуйста, проверьте данные.");
    }
    setIsGenerating(false);
  };

  const handleSave = () => {
    if (!config.title || !config.dataset_id) {
      alert("Пожалуйста, заполните название и выберите набор данных");
      return;
    }
    // Передаем и сгенерированные данные для сохранения
    onSave({ ...config, graphData: generatedGraph });
  };

  const numericColumns = selectedDataset?.columns?.filter(c => c.type === 'number') || [];

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
              <Network className="w-5 h-5 text-cyan-500" />
              Настройка графа связей
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="elegant-text">Название графа</Label>
            <Input
              id="title"
              placeholder="Например: Корреляции продаж"
              value={config.title}
              onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
              className="elegant-text"
            />
          </div>

          <div className="space-y-2">
            <Label className="elegant-text">Набор данных</Label>
            <Select onValueChange={handleDatasetChange}>
              <SelectTrigger className="elegant-text">
                <SelectValue placeholder="Выберите набор данных" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map(dataset => (
                  <SelectItem key={dataset.id} value={dataset.id} className="elegant-text">
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDataset && (
            <>
              <div className="space-y-2">
                <Label className="elegant-text">Тип графа</Label>
                <Select
                  value={config.graphType}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, graphType: value }))}
                >
                  <SelectTrigger className="elegant-text">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general" className="elegant-text">Общий анализ связей</SelectItem>
                    <SelectItem value="social" className="elegant-text">Социальный граф</SelectItem>
                    <SelectItem value="geo" className="elegant-text">Географические корреляции</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="elegant-text">Числовые столбцы для анализа связей</Label>
                <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
                  {numericColumns.map(column => (
                    <div key={column.name} className="flex items-center gap-2">
                      <Checkbox
                        id={column.name}
                        checked={config.selectedColumns.includes(column.name)}
                        onCheckedChange={() => handleColumnToggle(column.name)}
                      />
                      <Label htmlFor={column.name} className="elegant-text">{column.name}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 elegant-text">
                  Выберите минимум 2 числовых столбца для анализа взаимосвязей
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="elegant-text">Размер узлов</Label>
                  <Select 
                    value={config.nodeSize} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, nodeSize: value }))}
                  >
                    <SelectTrigger className="elegant-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small" className="elegant-text">Маленький</SelectItem>
                      <SelectItem value="medium" className="elegant-text">Средний</SelectItem>
                      <SelectItem value="large" className="elegant-text">Большой</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="elegant-text">Тип расположения</Label>
                  <Select 
                    value={config.layout} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, layout: value }))}
                  >
                    <SelectTrigger className="elegant-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="force" className="elegant-text">Силовой</SelectItem>
                      <SelectItem value="circle" className="elegant-text">Круговой</SelectItem>
                      <SelectItem value="grid" className="elegant-text">Сеточный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="showLabels"
                  checked={config.showLabels}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, showLabels: checked }))}
                />
                <Label htmlFor="showLabels" className="elegant-text">Показать подписи узлов</Label>
              </div>
            </>
          )}
          
          <Button 
            onClick={handleGenerateGraph} 
            disabled={isGenerating || !selectedDataset || config.selectedColumns.length < 2} 
            className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 gap-2 elegant-text"
          >
            {isGenerating ? (
                <>
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Генерация...
                </>
            ) : (
                <>
                    <Sparkles className="w-4 h-4" />
                    Сгенерировать граф
                </>
            )}
          </Button>

          <div className="flex gap-3 pt-6">
            <Button variant="outline" onClick={onCancel} className="flex-1 elegant-text">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={!generatedGraph || !config.title} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 gap-2 elegant-text">
              <Save className="w-4 h-4" />
              Сохранить граф
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Предварительный просмотр
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {generatedGraph ? (
            <NetworkVisualization
              config={config}
              graphData={generatedGraph}
              dataset={selectedDataset}
            />
          ) : isGenerating ? (
            <div className="h-96 flex items-center justify-center text-slate-500 elegant-text">
                <div className="text-center">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-50 animate-bounce" />
                    <p>Генерация графа, пожалуйста подождите...</p>
                </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center text-slate-500 elegant-text">
              <div className="text-center">
                <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Выберите данные и сгенерируйте граф</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
