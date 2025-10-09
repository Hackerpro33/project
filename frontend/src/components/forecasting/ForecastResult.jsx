
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { ArrowUp, ArrowDown, List, RefreshCw, BarChart, Mail, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

export default function ForecastResult({ result, historicalData, onReset, onSendSummary }) {
  const combinedData = historicalData.map((d) => ({
    date: d.date,
    'Исторические данные': d.value,
  }));

  if (result && result.forecast_data) {
    result.forecast_data.forEach((d, i) => {
      combinedData.push({
        date: d.date,
        'Прогноз': d.predicted_value,
        'Доверит. интервал': [d.confidence_lower, d.confidence_upper],
        'Оптимистичный': result.scenarios?.optimistic?.[i],
        'Пессимистичный': result.scenarios?.pessimistic?.[i]
      });
    });
  }

  const growth = result.summary.predicted_growth_percentage;
  const GrowthIcon = growth > 0 ? ArrowUp : ArrowDown;
  const growthColor = growth > 0 ? "text-emerald-500" : "text-red-500";

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'возрастающий': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'убывающий': return <ArrowDown className="w-4 h-4 text-red-500" />;
      default: return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getVolatilityColor = (level) => {
    switch (level) {
      case 'высокая': return 'text-red-600 bg-red-50';
      case 'средняя': return 'text-orange-600 bg-orange-50';
      default: return 'text-emerald-600 bg-emerald-50';
    }
  };

  return (
    <div className="space-y-8">
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
        <CardHeader className="border-b border-slate-200 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <BarChart className="w-5 h-5 text-orange-500" />
            Результаты прогноза
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={onSendSummary} variant="outline" className="gap-2">
                <Mail className="w-4 h-4" /> Отправить отчет
            </Button>
            <Button onClick={onReset} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" /> Новый прогноз
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(str) => new Date(str).toLocaleDateString('ru-RU', {month: 'short', day: 'numeric'})} />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU')}
                  formatter={(value, name) => [
                    typeof value === 'number' ? value.toFixed(2) : value,
                    name
                  ]}
                />
                <Legend />
                <Line dataKey="Исторические данные" stroke="#64748B" strokeWidth={2} dot={false} />
                <Line dataKey="Прогноз" type="monotone" stroke="#F97316" strokeWidth={3} strokeDasharray="5 5" dot={false} />
                <Area dataKey="Доверит. интервал" name="Доверит. интервал" fill="#FDBA74" stroke={false} fillOpacity={0.3} />
                {result.scenarios?.optimistic && (
                  <Line dataKey="Оптимистичный" stroke="#10B981" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                )}
                {result.scenarios?.pessimistic && (
                  <Line dataKey="Пессимистичный" stroke="#EF4444" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <List className="w-5 h-5 text-blue-500" />
              Основные показатели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center gap-2 p-4 rounded-lg ${growth > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <GrowthIcon className={`w-8 h-8 ${growthColor}`} />
              <div>
                <div className={`text-2xl font-bold ${growthColor}`}>{growth.toFixed(1)}%</div>
                <div className="text-sm font-medium">Прогнозируемый рост</div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium">Направление тренда:</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(result.summary.trend_direction)}
                  <span className="text-sm capitalize">{result.summary.trend_direction}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium">Волатильность:</span>
                <Badge className={getVolatilityColor(result.summary.volatility_level)}>
                  {result.summary.volatility_level}
                </Badge>
              </div>
              
              {result.summary.confidence_score !== undefined && result.summary.confidence_score !== null && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium">Достоверность:</span>
                  <span className="text-sm font-bold text-blue-600">
                    {(result.summary.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              
              {result.summary.seasonality_detected && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">Сезонность обнаружена</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <List className="w-5 h-5 text-blue-500" />
              AI Инсайты
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 list-disc list-inside text-slate-700">
              {result.summary.key_insights.map((insight, index) => (
                <li key={index} className="text-sm">{insight}</li>
              ))}
            </ul>
            
            {result.summary.risk_factors && result.summary.risk_factors.length > 0 && (
              <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-800">Факторы риска:</span>
                </div>
                <ul className="space-y-1 text-xs text-orange-700">
                  {result.summary.risk_factors.map((risk, index) => (
                    <li key={index}>• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              Рекомендации
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.summary.recommendations && result.summary.recommendations.length > 0 ? (
              <ul className="space-y-2 text-sm text-slate-700">
                {result.summary.recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-4 text-slate-500">
                <p className="text-sm">Рекомендации будут сформированы на основе анализа данных</p>
              </div>
            )}
            
            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <h4 className="font-semibold mb-2 text-slate-900">Прогнозные данные</h4>
              <div className="max-h-32 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-1">Дата</th>
                      <th className="text-right p-1">Прогноз</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.forecast_data.slice(0, 10).map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="p-1">{new Date(row.date).toLocaleDateString('ru-RU')}</td>
                        <td className="text-right p-1 font-medium">{row.predicted_value.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
