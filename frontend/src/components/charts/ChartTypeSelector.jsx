import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  LineChart, 
  ScatterChart,
  TrendingUp,
  Plus,
  Sparkles,
  Box
} from "lucide-react";

export default function ChartTypeSelector({ onSelectType, datasets }) {
  const chartTypes = [
    {
      id: 'line',
      name: 'Линейный график',
      description: 'Идеально для отображения трендов во времени',
      icon: LineChart,
      gradient: 'from-blue-500 to-cyan-600',
      example: 'Тренды продаж, метрики производительности'
    },
    {
      id: 'bar',
      name: 'Столбчатая диаграмма',
      description: 'Сравнение различных категорий',
      icon: BarChart3,
      gradient: 'from-emerald-500 to-teal-600',
      example: 'Доходы по регионам, количество пользователей'
    },
    {
      id: 'scatter',
      name: 'Диаграмма рассеяния',
      description: 'Исследование взаимосвязей между переменными',
      icon: ScatterChart,
      gradient: 'from-purple-500 to-indigo-600',
      example: 'Цена vs качество, корреляционный анализ'
    },
    {
      id: 'area',
      name: 'Диаграмма с областями',
      description: 'Показать совокупные итоги во времени',
      icon: TrendingUp,
      gradient: 'from-orange-500 to-red-600',
      example: 'Многослойные данные, кумулятивный рост'
    },
    {
      id: '3d',
      name: '3D Визуализация',
      description: 'Трехмерное отображение данных',
      icon: Box,
      gradient: 'from-pink-500 to-rose-600',
      example: 'Объемные данные, пространственный анализ'
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Выберите тип графика
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {chartTypes.map((type) => (
              <Card 
                key={type.id}
                className="group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105 cursor-pointer"
                onClick={() => onSelectType(type.id)}
              >
                <CardContent className="p-6 text-center space-y-4">
                  <div className={`w-16 h-16 mx-auto bg-gradient-to-r ${type.gradient} rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}>
                    <type.icon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 heading-text">{type.name}</h3>
                    <p className="text-sm text-slate-600 mb-3 elegant-text">{type.description}</p>
                    <Badge variant="secondary" className="text-xs elegant-text">
                      {type.example}
                    </Badge>
                  </div>
                  <Button 
                    className={`w-full bg-gradient-to-r ${type.gradient} hover:opacity-90 text-white border-0 gap-2 elegant-text`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectType(type.id);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Создать {type.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {datasets.length === 0 && (
        <Card className="border-0 bg-gradient-to-r from-yellow-50 to-orange-50 shadow-lg border border-yellow-200">
          <CardContent className="text-center py-8">
            <h3 className="text-lg font-semibold text-orange-700 mb-2 heading-text">Нет доступных наборов данных</h3>
            <p className="text-orange-600 mb-4 elegant-text">Вам необходимо сначала загрузить набор данных перед созданием графиков.</p>
            <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white elegant-text">
              Загрузить набор данных
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}