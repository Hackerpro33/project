import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Save, X, RefreshCw } from "lucide-react";

const LAT_KEYWORDS = ['lat', 'latitude', 'широт', 'широта', 'y_coord', 'y coordinate'];
const LON_KEYWORDS = ['lon', 'lng', 'longitude', 'долгот', 'долгота', 'x_coord', 'x coordinate'];

const DEFAULT_CONFIG = {
  title: '',
  dataset_id: '',
  lat_column: '',
  lon_column: '',
  value_column: '',
  overlay_type: 'none',
};

const parseNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isNumericType = (type) => {
  const normalized = (type || '').toLowerCase();
  return ['number', 'float', 'double', 'decimal', 'integer', 'int', 'long'].includes(normalized);
};

export default function MapConfigurator({
  datasets = [],
  onSave,
  onCancel,
  initialConfig,
  forecastData,
  correlationData,
  isEmbedded,
  onConfigChange,
}) {
  const [config, setConfig] = useState(initialConfig || DEFAULT_CONFIG);
  const [selectedDataset, setSelectedDataset] = useState(null);

  const datasetSamples = useMemo(() => selectedDataset?.sample_data || [], [selectedDataset]);

  const numericColumns = useMemo(() => {
    if (!selectedDataset) return [];
    const rows = datasetSamples;
    return (selectedDataset.columns || []).filter((col) => {
      if (isNumericType(col.type)) {
        return true;
      }
      if (!rows.length) {
        return false;
      }
      const numericValues = rows
        .map((row) => parseNumber(row[col.name]))
        .filter((value) => value !== null);
      if (!numericValues.length) {
        return false;
      }
      return numericValues.length / rows.length >= 0.5;
    });
  }, [selectedDataset, datasetSamples]);

  useEffect(() => {
    const incomingConfig = initialConfig || DEFAULT_CONFIG;
    setConfig((prev) => ({ ...prev, ...incomingConfig }));

    if (incomingConfig.dataset_id) {
      handleDatasetChange(incomingConfig.dataset_id, incomingConfig);
    } else {
      setSelectedDataset(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig, datasets]);

  const emitConfig = (nextConfig) => {
    setConfig((prev) => {
      const prevString = JSON.stringify(prev);
      const nextString = JSON.stringify(nextConfig);
      if (onConfigChange && prevString !== nextString) {
        onConfigChange(nextConfig);
      }
      return nextConfig;
    });
  };

  const detectCoordinateColumns = (dataset, currentConfig = {}) => {
    if (!dataset) {
      return { lat: '', lon: '', value: '' };
    }

    const rows = dataset.sample_data || [];
    const columns = dataset.columns || [];

    const numericCols = columns.filter((col) =>
      isNumericType(col.type) ||
      (rows.length > 0 && rows.some((row) => parseNumber(row[col.name]) !== null))
    );

    const evaluateColumn = (colName, type) => {
      const keywords = type === 'lat' ? LAT_KEYWORDS : LON_KEYWORDS;
      const lowerName = colName.toLowerCase();
      const hasKeyword = keywords.some((kw) => lowerName.includes(kw));
      const rangeCheck = type === 'lat'
        ? (value) => value >= -90 && value <= 90
        : (value) => value >= -180 && value <= 180;

      const values = rows
        .map((row) => parseNumber(row[colName]))
        .filter((value) => value !== null);

      const rangeScore = values.length
        ? values.filter(rangeCheck).length / values.length
        : 0;

      let score = rangeScore;
      if (hasKeyword) {
        score += 1.5;
      }
      if (rangeScore >= 0.9) {
        score += 0.5;
      }
      return score;
    };

    const resolveCoordinate = (type, excludeColumn) => {
      const existing = type === 'lat' ? currentConfig.lat_column : currentConfig.lon_column;
      if (existing) {
        return existing;
      }

      let bestCandidate = '';
      let bestScore = 0;
      numericCols.forEach((col) => {
        if (col.name === excludeColumn) return;
        const score = evaluateColumn(col.name, type);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = col.name;
        }
      });

      if (!bestCandidate && numericCols.length) {
        const fallback = numericCols.find((col) => col.name !== excludeColumn);
        return fallback ? fallback.name : '';
      }

      return bestCandidate;
    };

    const lat = resolveCoordinate('lat');
    const lon = resolveCoordinate('lon', lat);

    const valueColumn = currentConfig.value_column
      ? currentConfig.value_column
      : (() => {
          const candidate = numericCols.find(
            (col) => col.name !== lat && col.name !== lon,
          );
          return candidate ? candidate.name : '';
        })();

    return {
      lat,
      lon,
      value: valueColumn,
    };
  };

  const handleDatasetChange = (datasetId, incomingConfig) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    setSelectedDataset(dataset || null);

    if (!dataset) {
      const resetConfig = {
        ...(incomingConfig || config),
        dataset_id: datasetId,
        lat_column: '',
        lon_column: '',
        value_column: '',
      };
      emitConfig(resetConfig);
      return;
    }

    const nextConfig = {
      ...(incomingConfig || config),
      dataset_id: datasetId,
    };

    if (!nextConfig.title && dataset.name) {
      nextConfig.title = dataset.name;
    }

    const detected = detectCoordinateColumns(dataset, nextConfig);
    const mergedConfig = {
      ...nextConfig,
      lat_column: detected.lat,
      lon_column: detected.lon,
      value_column: detected.value,
    };

    emitConfig(mergedConfig);
  };

  const handleInputChange = (field, value) => {
    const normalizedValue = value === '__none__' ? '' : value;
    const updatedConfig = {
      ...config,
      [field]: normalizedValue,
    };
    emitConfig(updatedConfig);
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
          <Select onValueChange={(value) => handleDatasetChange(value)} value={config.dataset_id || undefined}>
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
                <Select onValueChange={(value) => handleInputChange('lat_column', value)} value={config.lat_column || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Широта" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map(col => (
                      <SelectItem key={col.name} value={col.name} className="elegant-text">
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lon-column" className="elegant-text">Столбец долготы</Label>
                <Select onValueChange={(value) => handleInputChange('lon_column', value)} value={config.lon_column || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Долгота" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map(col => (
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
              <Select onValueChange={(value) => handleInputChange('value_column', value)} value={config.value_column || undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец значений" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="elegant-text">Без значений</SelectItem>
                  {numericColumns.map(col => (
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
