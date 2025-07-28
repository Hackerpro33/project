
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, BrainCircuit, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox"; // Added Checkbox import

export default function ForecastSetup({ datasets, onGenerate, isLoading, isForecasting }) {
  const [config, setConfig] = useState({
    dataset_id: '',
    date_column: '',
    value_column: '',
    horizon: 30,
    external_factors: [] // Added external_factors to config state
  });
  const [selectedDataset, setSelectedDataset] = useState(null);

  const handleDatasetChange = (datasetId) => {
    // Existing handleDatasetChange logic
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ ...prev, dataset_id: datasetId, date_column: '', value_column: '' }));
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleFactorToggle = (factorName) => {
    setConfig(prev => ({
      ...prev,
      external_factors: prev.external_factors.includes(factorName)
        ? prev.external_factors.filter(f => f !== factorName)
        : [...prev.external_factors, factorName]
    }));
  };

  // Derived state for all numeric columns across all datasets
  const allNumericColumns = datasets.flatMap(d =>
    d.columns
     .filter(c => c.type === 'number')
     .map(c => `${d.name} > ${c.name}`)
  );

  return (
    <Card className="max-w-3xl mx-auto border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <BrainCircuit className="w-5 h-5 text-orange-500" />
          Настройка прогнозирования
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="fc-dataset" className="elegant-text">Основной набор данных</Label> {/* Changed label text */}
          <Select onValueChange={handleDatasetChange} value={config.dataset_id}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите набор временных рядов" />
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
              <Label htmlFor="date-column" className="elegant-text">Столбец даты/времени</Label>
              <Select onValueChange={(value) => handleInputChange('date_column', value)} value={config.date_column}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец с датами" />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataset.columns?.filter(c => c.type === 'date').map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value-column" className="elegant-text">Столбец значений для прогноза</Label>
              <Select onValueChange={(value) => handleInputChange('value_column', value)} value={config.value_column}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец значений" />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataset.columns?.filter(c => c.type === 'number').map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="horizon" className="elegant-text">Горизонт прогнозирования (дни)</Label>
          <Input
            id="horizon"
            type="number"
            value={config.horizon}
            onChange={(e) => handleInputChange('horizon', parseInt(e.target.value))}
            className="elegant-text"
          />
        </div>

        {/* New External Factors section */}
        <div className="space-y-2">
            <Label className="elegant-text">Внешние факторы (из всех таблиц)</Label>
            <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
              {allNumericColumns.map(factor => (
                <div key={factor} className="flex items-center gap-2">
                  <Checkbox
                    id={factor}
                    checked={config.external_factors.includes(factor)}
                    onCheckedChange={() => handleFactorToggle(factor)}
                  />
                  <Label htmlFor={factor} className="elegant-text text-sm">{factor}</Label>
                </div>
              ))}
            </div>
        </div>

        <Button
          onClick={() => onGenerate(config)}
          disabled={isForecasting || isLoading || !config.dataset_id || !config.date_column || !config.value_column}
          className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white gap-2 text-lg py-6 elegant-text"
        >
          {isForecasting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
              Генерация прогноза...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Создать прогноз
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
