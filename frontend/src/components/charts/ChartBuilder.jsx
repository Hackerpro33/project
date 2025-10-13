import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Visualization } from "@/api/entities";
import {
  ArrowLeft, Save, Eye, BarChart3, LineChart as LineChartIcon,
  ScatterChart as ScatterChartIcon, TrendingUp, Play, Box,
  Upload, Download, ClipboardCopy
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
} from 'recharts';
import DataRangeSelector from '../settings/DataRangeSelector';
import Chart3D from './Chart3D';

export default function ChartBuilder({ chartType, datasets, onClose, onSave, existingViz, templatePreset }) {
  const { toast } = useToast();
  const [config, setConfig] = useState({
    title: '',
    dataset_id: '',
    x_axis: '',
    y_axis: '',
    z_axis: '',
    color: '#3B82F6',
    filterConfig: {},
    crossDataset: false,
    x_dataset_id: '',
    y_dataset_id: '',
    z_dataset_id: '',
    colorScheme: 'default',
    meta: {},
    chartPresetId: null,
  });

  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedXDataset, setSelectedXDataset] = useState(null);
  const [selectedYDataset, setSelectedYDataset] = useState(null);
  const [selectedZDataset, setSelectedZDataset] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importValue, setImportValue] = useState('');
  const [exportValue, setExportValue] = useState('');
  const isCrossDatasetSupported = !['pie', 'table', 'heatmap'].includes(chartType);

  useEffect(() => {
    if (!isCrossDatasetSupported && config.crossDataset) {
      setConfig((prev) => ({
        ...prev,
        crossDataset: false,
        x_dataset_id: '',
        y_dataset_id: '',
        z_dataset_id: '',
        x_axis: '',
        y_axis: '',
        z_axis: '',
      }));
      setSelectedXDataset(null);
      setSelectedYDataset(null);
      setSelectedZDataset(null);
    }
  }, [isCrossDatasetSupported, config.crossDataset]);

  useEffect(() => {
    if (!existingViz) {
      setImportValue('');
      setExportValue('');
      return;
    }

    const crossDataset = existingViz.config?.crossDataset || false;
    setConfig((prev) => ({
      ...prev,
      title: existingViz.title || '',
      dataset_id: existingViz.dataset_id || '',
      x_axis: existingViz.x_axis || '',
      y_axis: existingViz.y_axis || '',
      z_axis: existingViz.config?.z_axis || '',
      color: existingViz.config?.color || '#3B82F6',
      colorScheme: existingViz.config?.colorScheme || prev.colorScheme,
      filterConfig: existingViz.config?.filterConfig || {},
      crossDataset,
      x_dataset_id: existingViz.config?.x_dataset_id || '',
      y_dataset_id: existingViz.config?.y_dataset_id || '',
      z_dataset_id: existingViz.config?.z_dataset_id || '',
      meta: existingViz.config?.meta || {},
      chartPresetId: existingViz.config?.chartPresetId || null,
    }));

    if (!crossDataset && existingViz.dataset_id) {
      const dataset = datasets.find((d) => d.id === existingViz.dataset_id);
      setSelectedDataset(dataset || null);
    } else if (crossDataset) {
      if (existingViz.config?.x_dataset_id) {
        const xDataset = datasets.find((d) => d.id === existingViz.config.x_dataset_id);
        setSelectedXDataset(xDataset || null);
      }
      if (existingViz.config?.y_dataset_id) {
        const yDataset = datasets.find((d) => d.id === existingViz.config.y_dataset_id);
        setSelectedYDataset(yDataset || null);
      }
      if (existingViz.config?.z_dataset_id) {
        const zDataset = datasets.find((d) => d.id === existingViz.config.z_dataset_id);
        setSelectedZDataset(zDataset || null);
      }
    }

    setImportValue(
      JSON.stringify(
        {
          type: existingViz.type,
          config: existingViz.config || {},
        },
        null,
        2
      )
    );
    setExportValue('');
  }, [existingViz, datasets]);

  useEffect(() => {
    if (!templatePreset) {
      return;
    }
    setConfig((prev) => ({
      ...prev,
      color: templatePreset.config?.color ?? prev.color,
      colorScheme: templatePreset.config?.colorScheme || prev.colorScheme,
      filterConfig: {
        ...prev.filterConfig,
        ...(templatePreset.config?.filterConfig || {}),
      },
      meta: {
        ...prev.meta,
        ...(templatePreset.config?.meta || {}),
      },
      chartPresetId: templatePreset.id,
    }));
    setImportValue(
      JSON.stringify(
        {
          type: templatePreset.chartType,
          config: templatePreset.config,
        },
        null,
        2
      )
    );
    setExportValue('');
    setShowPreview(false);
    setPreviewData(null);
    toast({
      title: 'Шаблон применён',
      description: `Пресет "${templatePreset.title}" загружен в конструктор.`,
    });
  }, [templatePreset, toast]);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ ...prev, dataset_id: datasetId, x_axis: '', y_axis: '', z_axis: '', filterConfig: {} }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleXDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedXDataset(dataset);
    setConfig(prev => ({ ...prev, x_dataset_id: datasetId, x_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleYDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedYDataset(dataset);
    setConfig(prev => ({ ...prev, y_dataset_id: datasetId, y_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleZDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedZDataset(dataset);
    setConfig(prev => ({ ...prev, z_dataset_id: datasetId, z_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleExportConfig = async () => {
    const payload = {
      type: chartType,
      config: {
        ...config,
      },
    };
    const serialized = JSON.stringify(payload, null, 2);
    setExportValue(serialized);
    try {
      await navigator.clipboard.writeText(serialized);
      toast({ title: 'Экспорт готов', description: 'JSON конфигурации скопирован в буфер обмена.' });
    } catch (error) {
      toast({ title: 'Экспорт готов', description: 'Скопируйте JSON вручную из блока ниже.' });
    }
  };

  const handleCopyExport = async () => {
    if (!exportValue) {
      return;
    }
    try {
      await navigator.clipboard.writeText(exportValue);
      toast({ title: 'JSON скопирован', description: 'Конфигурация находится в буфере обмена.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Не удалось скопировать',
        description: 'Скопируйте текст вручную.',
      });
    }
  };

  const handleImportConfig = () => {
    if (!importValue.trim()) {
      toast({
        variant: 'destructive',
        title: 'Пустой JSON',
        description: 'Вставьте конфигурацию в формате JSON.',
      });
      return;
    }

    try {
      const parsed = JSON.parse(importValue);
      const nextConfig = parsed.config || {};
      const nextDatasetId = nextConfig.dataset_id || config.dataset_id;
      const nextChartType = parsed.type || chartType;

      if (nextChartType && nextChartType !== chartType) {
        toast({
          title: 'Импорт частичный',
          description: 'Тип графика в конфигурации отличается. Используются только настройки.',
        });
      }

      if (nextDatasetId) {
        const dataset = datasets.find((d) => d.id === nextDatasetId);
        setSelectedDataset(dataset || null);
      }

      setConfig((prev) => ({
        ...prev,
        ...nextConfig,
        dataset_id: nextDatasetId || prev.dataset_id,
        filterConfig: { ...prev.filterConfig, ...(nextConfig.filterConfig || {}) },
        meta: { ...prev.meta, ...(nextConfig.meta || {}) },
      }));

      if (nextConfig.crossDataset) {
        const xDataset = datasets.find((d) => d.id === nextConfig.x_dataset_id);
        const yDataset = datasets.find((d) => d.id === nextConfig.y_dataset_id);
        const zDataset = datasets.find((d) => d.id === nextConfig.z_dataset_id);
        setSelectedXDataset(xDataset || null);
        setSelectedYDataset(yDataset || null);
        setSelectedZDataset(zDataset || null);
      }

      setShowPreview(false);
      setPreviewData(null);
      toast({ title: 'Конфигурация импортирована', description: 'Настройки графика обновлены.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка импорта',
        description: 'Не удалось разобрать JSON. Проверьте формат.',
      });
    }
  };

  const handleCrossDatasetToggle = (checked) => {
    setConfig(prev => ({ 
      ...prev, 
      crossDataset: checked,
      dataset_id: '',
      x_dataset_id: '',
      y_dataset_id: '',
      z_dataset_id: '',
      x_axis: '',
      y_axis: '',
      z_axis: ''
    }));
    setSelectedDataset(null);
    setSelectedXDataset(null);
    setSelectedYDataset(null);
    setSelectedZDataset(null);
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleGeneratePreview = () => {
    if (config.crossDataset) {
      if (!isCrossDatasetSupported) {
        toast({
          variant: 'destructive',
          title: 'Режим недоступен',
          description: 'Кросс-датасет визуализации поддерживаются только для линейных, столбчатых, точечных и 3D графиков.',
        });
        return;
      }

      if (!config.x_dataset_id || !config.y_dataset_id || !config.x_axis || !config.y_axis) {
        toast({
          variant: 'destructive',
          title: 'Не хватает данных',
          description: 'Выберите наборы данных и поля для осей X и Y.',
        });
        return;
      }

      const xDataset = datasets.find((d) => d.id === config.x_dataset_id);
      const yDataset = datasets.find((d) => d.id === config.y_dataset_id);
      const zDataset =
        chartType === '3d' && config.z_dataset_id && config.z_axis
          ? datasets.find((d) => d.id === config.z_dataset_id)
          : null;

      const combinedData = [];
      const maxLength = Math.max(
        5,
        Math.min(
          xDataset?.sample_data?.length || 0,
          yDataset?.sample_data?.length || 0,
          zDataset?.sample_data?.length || 10
        )
      );

      for (let i = 0; i < maxLength; i++) {
        const point = {};
        point[config.x_axis] = xDataset?.sample_data?.[i]?.[config.x_axis] ?? `X${i + 1}`;
        point[config.y_axis] = yDataset?.sample_data?.[i]?.[config.y_axis] ?? Math.floor(Math.random() * 100) + 10;

        if (chartType === '3d' && zDataset && config.z_axis) {
          point[config.z_axis] = zDataset.sample_data?.[i]?.[config.z_axis] ?? Math.floor(Math.random() * 75) + 15;
        }
        combinedData.push(point);
      }

      setPreviewData(combinedData);
      setShowPreview(true);
      return;
    }

    if (!config.dataset_id) {
      toast({
        variant: 'destructive',
        title: 'Выберите набор данных',
        description: 'Без источника невозможно построить визуализацию.',
      });
      return;
    }

    const dataset = selectedDataset || datasets.find((d) => d.id === config.dataset_id);
    if (!dataset) {
      toast({
        variant: 'destructive',
        title: 'Источник не найден',
        description: 'Выбранный набор данных больше недоступен.',
      });
      return;
    }

    const needsXAxis = chartType !== 'table';
    const needsYAxis = !['table'].includes(chartType);
    const needsZAxis = chartType === '3d' || chartType === 'heatmap';

    if (needsXAxis && !config.x_axis) {
      toast({
        variant: 'destructive',
        title: 'Не указана ось X',
        description: 'Выберите поле для оси X.',
      });
      return;
    }

    if (needsYAxis && !config.y_axis && chartType !== 'pie') {
      toast({
        variant: 'destructive',
        title: 'Не указана ось Y',
        description: 'Выберите поле для оси Y.',
      });
      return;
    }

    if (needsZAxis && !config.z_axis) {
      toast({
        variant: 'destructive',
        title: 'Не указано значение интенсивности',
        description: 'Для тепловых карт и 3D графиков необходимо выбрать ось Z.',
      });
      return;
    }

    let sampleData = Array.isArray(dataset.sample_data) ? [...dataset.sample_data] : [];

    if (sampleData.length === 0) {
      const mockData = [];
      const columns = Array.isArray(dataset.columns) ? dataset.columns : [];

      if (chartType === 'table') {
        for (let i = 0; i < 5; i++) {
          const row = {};
          if (columns.length === 0) {
            row[`Колонка ${i + 1}`] = `Значение ${i + 1}`;
          } else {
            columns.slice(0, 5).forEach((column, index) => {
              if (column.type === 'number') {
                row[column.name] = Math.round(Math.random() * 1000);
              } else if (column.type === 'date') {
                row[column.name] = new Date(2024, 0, i + index + 1).toISOString().split('T')[0];
              } else {
                row[column.name] = `${column.name} ${i + 1}`;
              }
            });
          }
          mockData.push(row);
        }
      } else if (chartType === 'heatmap') {
        for (let i = 0; i < 9; i++) {
          mockData.push({
            [config.x_axis || 'X']: `X${(i % 3) + 1}`,
            [config.y_axis || 'Y']: `Y${Math.floor(i / 3) + 1}`,
            [config.z_axis || 'value']: Math.floor(Math.random() * 100),
          });
        }
      } else if (chartType === 'pie') {
        for (let i = 0; i < 6; i++) {
          mockData.push({
            [config.x_axis || 'Сегмент']: `Сегмент ${i + 1}`,
            [config.y_axis || 'Значение']: Math.floor(Math.random() * 100) + 20,
          });
        }
      } else {
        for (let i = 0; i < 10; i++) {
          const dataPoint = {};
          const xColumn = columns.find((c) => c.name === config.x_axis);
          const yColumn = columns.find((c) => c.name === config.y_axis);

          if (xColumn?.type === 'date') {
            const date = new Date(2024, 0, i + 1);
            dataPoint[config.x_axis] = date.toISOString().split('T')[0];
          } else if (xColumn?.type === 'number') {
            dataPoint[config.x_axis] = i + 1;
          } else {
            dataPoint[config.x_axis] = `Категория ${i + 1}`;
          }

          if (yColumn?.type === 'number') {
            dataPoint[config.y_axis] = Math.floor(Math.random() * 100) + 10;
          } else {
            dataPoint[config.y_axis] = Math.floor(Math.random() * 50) + 5;
          }

          if ((chartType === '3d' || chartType === 'heatmap') && config.z_axis) {
            dataPoint[config.z_axis] = Math.floor(Math.random() * 75) + 15;
          }

          mockData.push(dataPoint);
        }
      }
      sampleData = mockData;
    }

    if (chartType === 'table') {
      setPreviewData(sampleData);
      setShowPreview(true);
      return;
    }

    if (chartType === 'pie') {
      const pieData = sampleData.map((row, index) => ({
        name: row[config.x_axis] ?? `Сегмент ${index + 1}`,
        value: Number(row[config.y_axis] ?? Math.floor(Math.random() * 100) + 10),
      }));
      setPreviewData(pieData);
      setShowPreview(true);
      return;
    }

    if (chartType === 'heatmap') {
      const heatmapData = sampleData.map((row, index) => ({
        x: row[config.x_axis] ?? `X${index + 1}`,
        y: row[config.y_axis] ?? `Y${index + 1}`,
        value: Number(row[config.z_axis] ?? Math.floor(Math.random() * 100)),
      }));
      setPreviewData(heatmapData);
      setShowPreview(true);
      return;
    }

    setPreviewData(sampleData);
    setShowPreview(true);
  };

  const handleSave = async () => {
    if (!config.title) {
      alert('Пожалуйста, введите название графика');
      return;
    }

    let datasetId, xAxis, yAxis;
    
    if (config.crossDataset) {
      if (!config.x_dataset_id || !config.y_dataset_id || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, заполните все обязательные поля для кросс-датасет графика');
        return;
      }
      datasetId = config.x_dataset_id; // Основной датасет для хранения
      xAxis = config.x_axis;
      yAxis = config.y_axis;
    } else {
      if (!config.dataset_id || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
      }
      datasetId = config.dataset_id;
      xAxis = config.x_axis;
      yAxis = config.y_axis;
    }

    const vizData = {
        title: config.title,
        type: chartType,
        dataset_id: datasetId,
        x_axis: xAxis,
        y_axis: yAxis,
        config: {
          color: config.color,
          filterConfig: config.filterConfig,
          z_axis: config.z_axis,
          crossDataset: config.crossDataset,
          x_dataset_id: config.x_dataset_id,
          y_dataset_id: config.y_dataset_id,
          z_dataset_id: config.z_dataset_id,
          colorScheme: config.colorScheme,
          meta: config.meta,
          chartPresetId: config.chartPresetId,
        }
    };
    
    try {
        if (existingViz) {
            await Visualization.update(existingViz.id, vizData);
        } else {
            await Visualization.create(vizData);
        }
        onSave();
        onClose();
    } catch (error) {
        console.error('Error saving visualization:', error);
        alert('Ошибка при сохранении визуализации: ' + error.message);
    }
  };

  const getChartIcon = () => {
    const icons = {
      line: LineChartIcon, bar: BarChart3, scatter: ScatterChartIcon,
      area: TrendingUp, '3d': Box
    };
    return icons[chartType] || BarChart3;
  };

  const ChartIcon = getChartIcon();
  
  const renderChart = () => {
    if (!previewData || previewData.length === 0) return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
        <h4 className="font-bold text-slate-700 mb-2">Нет данных для предпросмотра</h4>
        <p className="text-sm">Пожалуйста, проверьте выбранные столбцы или фильтры.</p>
      </div>
    );

    if (chartType === '3d') {
        return <Chart3D data={previewData} config={config} />;
    }

    const chartProps = { data: previewData, margin: { top: 5, right: 30, left: 20, bottom: 5 } };
    const xAxisType = chartType === 'scatter' ? 'number' : 'category';
    const yAxisType = 'number';
    const pieColors = Array.isArray(config.meta?.palette) && config.meta.palette.length > 0
      ? config.meta.palette
      : ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={config.y_axis} name={config.y_axis} stroke={config.color} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Bar dataKey={config.y_axis} name={config.y_axis} fill={config.color} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey={config.y_axis} name={config.y_axis} stroke={config.color} fill={config.color} fillOpacity={0.3} />
          </AreaChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...chartProps}>
            <CartesianGrid />
            <XAxis type="number" dataKey={config.x_axis} name={config.x_axis} tick={{ fontSize: 12 }} />
            <YAxis type="number" dataKey={config.y_axis} name={config.y_axis} tick={{ fontSize: 12 }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name="Данные" data={previewData} fill={config.color} />
          </ScatterChart>
        );
      case 'pie':
        return (
          <RePieChart {...chartProps}>
            <Tooltip />
            <Legend />
            <Pie
              data={previewData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              label
            >
              {previewData.map((entry, index) => (
                <Cell key={entry.name || index} fill={pieColors[index % pieColors.length]} />
              ))}
            </Pie>
          </RePieChart>
        );
      case 'table': {
        const columns = Array.isArray(selectedDataset?.columns) && selectedDataset.columns.length > 0
          ? selectedDataset.columns
          : Object.keys(previewData[0] || {}).map((name) => ({ name }));
        const visibleColumns = columns.length > 0 ? columns : [{ name: 'значение' }];
        return (
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column.name} className="px-3 py-2 text-left font-semibold text-slate-600">
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="px-3 py-4 text-center text-slate-500">
                      Нет данных для отображения
                    </td>
                  </tr>
                ) : (
                  previewData.slice(0, 15).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {visibleColumns.map((column) => (
                        <td key={column.name} className="px-3 py-2 text-slate-600">
                          {row[column.name] !== undefined ? String(row[column.name]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );
      }
      case 'heatmap': {
        const xCategories = Array.from(new Set(previewData.map((item) => item.x ?? '—')));
        const yCategories = Array.from(new Set(previewData.map((item) => item.y ?? '—')));
        const maxValue = Math.max(...previewData.map((item) => Number(item.value) || 0), 0);
        return (
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left text-slate-500">{config.y_axis || 'Y'}</th>
                  {xCategories.map((x) => (
                    <th key={x} className="px-2 py-2 text-center text-slate-500">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yCategories.map((y) => (
                  <tr key={y} className="border-t">
                    <td className="px-2 py-2 font-semibold text-slate-600">{y}</td>
                    {xCategories.map((x) => {
                      const match = previewData.find((item) => (item.x ?? '—') === x && (item.y ?? '—') === y);
                      const value = match ? Number(match.value) || 0 : 0;
                      const intensity = maxValue > 0 ? value / maxValue : 0;
                      const background = `rgba(37, 99, 235, ${0.2 + intensity * 0.7})`;
                      const color = intensity > 0.6 ? '#fff' : '#0f172a';
                      return (
                        <td
                          key={`${x}-${y}`}
                          className="px-2 py-2 text-center font-medium"
                          style={{ backgroundColor: background, color }}
                        >
                          {value.toFixed(0)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default:
        return <div>Неподдерживаемый тип графика</div>;
    }
  };

  // Определение доступных столбцов в зависимости от режима
  const getXAxisColumns = () => {
    if (config.crossDataset) {
      return selectedXDataset?.columns || [];
    }
    if (!selectedDataset) {
      return [];
    }
    if (chartType === 'scatter') {
      return selectedDataset.columns?.filter((col) => col.type === 'number') || [];
    }
    return selectedDataset.columns || [];
  };

  const getYAxisColumns = () => {
    if (config.crossDataset) {
      return selectedYDataset?.columns?.filter(col => col.type === 'number') || [];
    }
    if (!selectedDataset) {
      return [];
    }
    if (chartType === 'table') {
      return [];
    }
    if (chartType === 'pie') {
      return selectedDataset.columns?.filter((col) => col.type === 'number') || [];
    }
    if (chartType === 'heatmap') {
      return selectedDataset.columns || [];
    }
    return selectedDataset.columns?.filter((col) => col.type === 'number') || [];
  };

  const getZAxisColumns = () => {
    if (config.crossDataset) {
      return selectedZDataset?.columns || [];
    }
    if (!selectedDataset) {
      return [];
    }
    if (chartType === 'heatmap') {
      return selectedDataset.columns?.filter((col) => col.type === 'number') || [];
    }
    return selectedDataset.columns || [];
  };

  const requiresXAxis = chartType !== 'table';
  const requiresYAxis = chartType !== 'table';
  const requiresZAxis = chartType === '3d' || chartType === 'heatmap';

  const baseDatasetReady = config.crossDataset
    ? config.x_dataset_id && config.y_dataset_id
    : config.dataset_id;

  const axesReady =
    (!requiresXAxis || Boolean(config.x_axis)) &&
    (!requiresYAxis || Boolean(config.y_axis)) &&
    (!requiresZAxis || Boolean(config.z_axis));

  const canBuildChart = Boolean(baseDatasetReady && axesReady);

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <ChartIcon className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-slate-900">
                  Конструктор: {chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Название графика</Label>
            <Input id="title" placeholder="Введите название графика" value={config.title} onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))} />
          </div>

          {/* Cross-dataset checkbox */}
          <div className="flex items-center space-x-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Checkbox
              id="crossDataset"
              checked={config.crossDataset}
              onCheckedChange={handleCrossDatasetToggle}
              disabled={!isCrossDatasetSupported}
            />
            <Label
              htmlFor="crossDataset"
              className={`text-sm font-medium ${
                isCrossDatasetSupported ? 'text-blue-900' : 'text-blue-400'
              }`}
            >
              Использовать данные из разных наборов данных
              {!isCrossDatasetSupported && ' (недоступно для выбранного типа)'}
            </Label>
          </div>

          {config.crossDataset ? (
            // Cross-dataset mode
            <>
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
                <h4 className="font-medium text-slate-700">Настройка осей из разных наборов данных</h4>
                
                <div className="space-y-2">
                  <Label>Набор данных для оси X</Label>
                  <Select onValueChange={handleXDatasetChange} value={config.x_dataset_id}>
                    <SelectTrigger><SelectValue placeholder="Выберите набор данных для X" /></SelectTrigger>
                    <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>

                {selectedXDataset && (
                  <div className="space-y-2">
                    <Label>Столбец для оси X</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, x_axis: value }))} value={config.x_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси X" /></SelectTrigger>
                      <SelectContent>{getXAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Набор данных для оси Y</Label>
                  <Select onValueChange={handleYDatasetChange} value={config.y_dataset_id}>
                    <SelectTrigger><SelectValue placeholder="Выберите набор данных для Y" /></SelectTrigger>
                    <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>

                {selectedYDataset && (
                  <div className="space-y-2">
                    <Label>Столбец для оси Y</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, y_axis: value }))} value={config.y_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Y" /></SelectTrigger>
                      <SelectContent>{getYAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}

                {chartType === '3d' && (
                  <>
                    <div className="space-y-2">
                      <Label>Набор данных для оси Z</Label>
                      <Select onValueChange={handleZDatasetChange} value={config.z_dataset_id}>
                        <SelectTrigger><SelectValue placeholder="Выберите набор данных для Z" /></SelectTrigger>
                        <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>

                    {selectedZDataset && (
                      <div className="space-y-2">
                        <Label>Столбец для оси Z</Label>
                        <Select onValueChange={(value) => setConfig(prev => ({ ...prev, z_axis: value }))} value={config.z_axis}>
                          <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Z" /></SelectTrigger>
                          <SelectContent>{getZAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            // Single dataset mode
            <>
              <div className="space-y-2">
                <Label htmlFor="dataset">Набор данных</Label>
                <Select onValueChange={handleDatasetChange} value={config.dataset_id}>
                  <SelectTrigger><SelectValue placeholder="Выберите набор данных" /></SelectTrigger>
                  <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>

              {selectedDataset && (
                <>
                  {chartType !== 'table' && (
                    <div className="space-y-2">
                      <Label htmlFor="x-axis">Ось X</Label>
                      <Select onValueChange={(value) => setConfig(prev => ({ ...prev, x_axis: value }))} value={config.x_axis}>
                        <SelectTrigger><SelectValue placeholder="Выберите столбец для оси X" /></SelectTrigger>
                        <SelectContent>{getXAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {chartType !== 'table' && (
                    <div className="space-y-2">
                      <Label htmlFor="y-axis">{chartType === 'pie' ? 'Значение сегмента' : 'Ось Y'}</Label>
                      <Select onValueChange={(value) => setConfig(prev => ({ ...prev, y_axis: value }))} value={config.y_axis}>
                        <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Y" /></SelectTrigger>
                        <SelectContent>{getYAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {(chartType === '3d' || chartType === 'heatmap') && (
                    <div className="space-y-2">
                      <Label htmlFor="z-axis">{chartType === 'heatmap' ? 'Интенсивность' : 'Ось Z'}</Label>
                      <Select onValueChange={(value) => setConfig(prev => ({ ...prev, z_axis: value }))} value={config.z_axis}>
                        <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Z" /></SelectTrigger>
                        <SelectContent>{getZAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">Цвет графика</Label>
            <div className="flex gap-2">
              <Input id="color" type="color" value={config.color} onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))} className="w-16 h-10 p-1" />
              <Input value={config.color} onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))} className="flex-1" />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Импорт / экспорт конфигурации
                </Label>
                <p className="text-xs text-slate-500">
                  Обменивайтесь настройками графиков через JSON.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleImportConfig}>
                  <Upload className="w-4 h-4" /> Импорт
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleExportConfig}>
                  <Download className="w-4 h-4" /> Экспорт
                </Button>
              </div>
            </div>
            <Textarea
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
              placeholder="Вставьте JSON конфигурации или используйте кнопки для генерации"
              className="min-h-[120px] text-xs"
            />
            {exportValue && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Экспортированный JSON
                  </span>
                  <Button variant="ghost" size="sm" className="gap-1 text-blue-600 hover:text-blue-700" onClick={handleCopyExport}>
                    <ClipboardCopy className="w-4 h-4" /> Копировать
                  </Button>
                </div>
                <pre className="max-h-40 overflow-auto rounded-lg bg-slate-900/90 p-3 text-xs text-slate-100">
                  {exportValue}
                </pre>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200">
            <Button onClick={handleGeneratePreview} disabled={!canBuildChart} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 gap-2 text-white">
              <Play className="w-4 h-4" />Построить график
            </Button>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Отмена</Button>
            <Button onClick={handleSave} disabled={!showPreview} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 gap-2">
              <Save className="w-4 h-4" />{existingViz ? 'Обновить' : 'Сохранить'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-slate-900"><Eye className="w-5 h-5 text-purple-500" />Предпросмотр графика</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-center"><h3 className="text-xl font-bold text-slate-900 h-7">{config.title || "Название графика"}</h3></div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {showPreview && previewData ? (
                  renderChart()
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                    <BarChart3 className="w-16 h-16 opacity-30 mb-4" />
                    <h4 className="font-bold text-slate-700 mb-2">Предпросмотр графика</h4>
                    <p className="text-sm mb-2">Заполните все поля и нажмите "Построить график"</p>
                    {canBuildChart && (<p className="text-xs text-emerald-600">✓ Все поля заполнены, можно построить график</p>)}
                  </div>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
