import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Flame, LineChart, PieChart, Table2, ThermometerSnowflake } from "lucide-react";

const TEMPLATES = [
  {
    id: 'line-trend',
    title: 'Трендовая линия',
    description: 'Готовый пресет для временных рядов с автоформатированием осей и подсветкой пиков.',
    icon: LineChart,
    chartType: 'line',
    config: {
      color: '#2563EB',
      filterConfig: { interval: 'last_12_months' },
      meta: { legend: 'top', smoothing: 'monotone' },
    },
    recommended: ['Время', 'Тренд', 'ARIMA'],
  },
  {
    id: 'bar-comparison',
    title: 'Сравнение категорий',
    description: 'Столбчатый график с автоупорядочиванием и отображением процентов от общего.',
    icon: BarChart3,
    chartType: 'bar',
    config: {
      color: '#10B981',
      filterConfig: { sort: 'desc', top: 10 },
      meta: { showPercentage: true },
    },
    recommended: ['Категории', 'ABC-анализ'],
  },
  {
    id: 'pie-share',
    title: 'Доли сегментов',
    description: 'Классическая круговая диаграмма с автоматической генерацией подписей и легенды.',
    icon: PieChart,
    chartType: 'pie',
    config: {
      colorScheme: 'pastel',
      filterConfig: { minShare: 0.03 },
      meta: { innerRadius: 40 },
    },
    recommended: ['Сегментация', 'Маркетинг'],
  },
  {
    id: 'table-summary',
    title: 'Табличное резюме',
    description: 'Структурированная таблица с автоматическими итогами и подсветкой отклонений.',
    icon: Table2,
    chartType: 'table',
    config: {
      meta: { showTotals: true, highlightThreshold: 0.15 },
      filterConfig: { limit: 20 },
    },
    recommended: ['Операционная отчётность'],
  },
  {
    id: 'heatmap-correlation',
    title: 'Тепловая карта',
    description: 'Визуализация корреляций или интенсивности по двум измерениям, доступные подсказки.',
    icon: ThermometerSnowflake,
    chartType: 'heatmap',
    config: {
      colorScheme: 'blueRed',
      meta: { showValues: true },
      filterConfig: { normalize: true },
    },
    recommended: ['Корреляция', 'NPS'],
  },
];

export default function ChartTemplateLibrary({ onApplyTemplate }) {
  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="text-slate-900 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          Быстрые шаблоны графиков
        </CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4 p-6">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <div
              key={template.id}
              className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white shadow-inner p-2">
                  <Icon className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{template.title}</div>
                  <Badge variant="secondary" className="mt-1 bg-blue-100 text-blue-700">
                    {template.chartType.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-slate-600 flex-1 leading-relaxed">
                {template.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {template.recommended.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-wide">
                    {tag}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                className="mt-1 gap-2"
                onClick={() => onApplyTemplate?.(template)}
              >
                Использовать шаблон
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
