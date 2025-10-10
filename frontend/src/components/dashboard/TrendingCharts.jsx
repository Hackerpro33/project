import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity } from "lucide-react";

export default function TrendingCharts({ data }) {
  const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const totalValue = data.reduce((sum, point) => sum + (point.value || 0), 0);
  const totalGrowth = data.reduce((sum, point) => sum + (point.growth || 0), 0);
  const averageValue = data.length ? totalValue / data.length : 0;
  const averageGrowth = data.length ? totalGrowth / data.length : 0;
  const firstPoint = data[0] || {};
  const lastPoint = data[data.length - 1] || {};
  const growthMomentum = (lastPoint.value || 0) - (firstPoint.value || 0);
  const stabilityIndex = data.length > 1
    ? Math.max(0, 100 - (Math.abs(growthMomentum) / Math.max(lastPoint.value || 1, 1)) * 35)
    : 100;

  const summaryMetrics = [
    {
      value: `${numberFormatter.format(averageValue)}`,
      label: "Средняя нагрузка",
      description: "обработка данных за период",
    },
    {
      value: `${numberFormatter.format(averageGrowth)}`,
      label: "Средний рост",
      description: "увеличение метрик день к дню",
    },
    {
      value: `${numberFormatter.format(growthMomentum)} ед.`,
      label: "Импульс",
      description: "изменение от начала периода",
    },
    {
      value: `${numberFormatter.format(stabilityIndex)}%`,
      label: "Индекс стабильности",
      description: "колебания процессов обработки",
    },
  ];

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Activity className="w-5 h-5 text-green-500" />
          Growth Trends
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Data Processing</span>
              <div className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs font-medium">+24%</span>
              </div>
            </div>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fill="url(#gradientGreen)" 
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Локальные прогнозы</span>
              <div className="flex items-center gap-1 text-blue-600">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs font-medium">+31%</span>
              </div>
            </div>
            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="gradientBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="growth" 
                    stroke="#0EA5E9" 
                    strokeWidth={2}
                    fill="url(#gradientBlue)" 
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          {summaryMetrics.map((metric) => (
            <div key={metric.label} className="rounded-xl bg-slate-50/70 p-3 text-center">
              <div className="text-xl font-semibold text-slate-900">{metric.value}</div>
              <div className="text-xs font-medium text-slate-600">{metric.label}</div>
              <div className="mt-1 text-[11px] text-slate-500">{metric.description}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}