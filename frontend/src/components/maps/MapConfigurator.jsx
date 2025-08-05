
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Save, X, MapPin, RefreshCw } from "lucide-react";

export default function MapConfigurator({ datasets, onSave, onCancel, initialConfig, forecastData, correlationData, isEmbedded }) {
  const [config, setConfig] = useState(initialConfig || {
    title: '',
    dataset_id: '',
    lat_column: '',
    lon_column: '',
    value_column: '',
    overlay_type: 'none' // 'forecast', 'correlation', 'none'
  });
  const [selectedDataset, setSelectedDataset] = useState(null);

  useEffect(() => {
    if (initialConfig && initialConfig.dataset_id) {
      handleDatasetChange(initialConfig.dataset_id);
    }
  }, [initialConfig, datasets]);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    
    // Автоматическое определение координатных столбцов
    const autoDetectCoords = (columns) => {
      const latColumns = columns.filter(c => 
        c.name.toLowerCase().includes('lat') || 
        c.name.toLowerCase().includes('широта') ||
        c.name.toLowerCase().includes('ш')
      );
      const lonColumns = columns.filter(c => 
        c.name.toLowerCase().includes('lon') || 
        c.name.toLowerCase().includes('lng') ||
        c.name.toLowerCase().includes('долгота') ||
        c.name.toLowerCase().includes('д')
      );
      
      return {
        lat: latColumns.length > 0 ? latColumns[0].name : '',
        lon: lonColumns.length > 0 ? lonColumns[0].name : ''
      };
    };

    const coords = autoDetectCoords(dataset.columns || []);
    setConfig(prev => ({ 
      ...prev, 
      dataset_id: datasetId, 
      lat_column: coords.lat, 
      lon_column: coords.lon, 
      value_column: '' 
    }));
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!config.dataset_id || !config.lat_column || !config.lon_column) {
      alert("Пожалуйста, выберите набор данных и столбцы широты/долготы.");
      return;
    }
    onSave(config);
  };

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl h-full">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <Compass className="w-5 h-5 text-purple-500" />
          Настройка карты
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="map-title" className="elegant-text">Название карты</Label>
          <Input 
            id="map-title" 
            placeholder="например, Расположение магазинов" 
            value={config.title} 
            onChange={(e) => handleInputChange('title', e.target.value)}
            className="elegant-text" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-dataset" className="elegant-text">Набор данных</Label>
          <Select onValueChange={handleDatasetChange} value={config.dataset_id}>
            <SelectTrigger>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lat-column" className="elegant-text">Столбец широты</Label>
                <Select onValueChange={(value) => handleInputChange('lat_column', value)} value={config.lat_column}>
                  <SelectTrigger>
                    <SelectValue placeholder="Широта" />
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
              <div className="space-y-2">
                <Label htmlFor="lon-column" className="elegant-text">Столбец долготы</Label>
                <Select onValueChange={(value) => handleInputChange('lon_column', value)} value={config.lon_column}>
                  <SelectTrigger>
                    <SelectValue placeholder="Долгота" />
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="value-column" className="elegant-text">Столбец значений для маркеров (опционально)</Label>
              <Select onValueChange={(value) => handleInputChange('value_column', value)} value={config.value_column}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец значений" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null} className="elegant-text">Без значений</SelectItem>
                  {selectedDataset.columns?.filter(c => c.type === 'number').map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(forecastData || correlationData) && (
              <div className="space-y-2">
                <Label className="elegant-text">Наложение данных</Label>
                <Select onValueChange={(value) => handleInputChange('overlay_type', value)} value={config.overlay_type}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип наложения" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="elegant-text">Без наложения</SelectItem>
                    {forecastData && (
                      <SelectItem value="forecast" className="elegant-text">Данные прогноза</SelectItem>
                    )}
                    {correlationData && (
                      <SelectItem value="correlation" className="elegant-text">Корреляционные данные</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3 pt-6">
          {isEmbedded ? (
            <Button onClick={handleSubmit} className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 gap-2 elegant-text">
              <RefreshCw className="w-4 h-4" /> Обновить карту
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel} className="flex-1 gap-2 elegant-text">
                <X className="w-4 h-4" /> Отмена
              </Button>
              <Button onClick={handleSubmit} className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 gap-2 elegant-text">
                <Save className="w-4 h-4" /> Сохранить карту
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
