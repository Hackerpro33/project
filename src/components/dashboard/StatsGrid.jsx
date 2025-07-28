
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, BarChart3, Map, TrendingUp, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsGrid({ datasets, visualizations, isLoading }) {
  const stats = [
    {
      title: "Источники данных",
      value: datasets.length,
      icon: Database,
      gradient: "from-emerald-500 to-teal-600",
      change: "+12%",
      description: "Активные наборы данных"
    },
    {
      title: "Визуализации",
      value: visualizations.length,
      icon: BarChart3,
      gradient: "from-blue-500 to-cyan-600",
      change: "+8%",
      description: "Созданные графики"
    },
    {
      title: "Просмотры карт",
      value: visualizations.filter(v => v.type === 'map').length,
      icon: Map,
      gradient: "from-purple-500 to-indigo-600",
      change: "+15%",
      description: "Географические данные"
    },
    {
      title: "Прогнозы",
      value: visualizations.filter(v => v.type === 'forecast').length,
      icon: TrendingUp,
      gradient: "from-orange-500 to-red-600",
      change: "+23%",
      description: "Модели прогнозирования"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={stat.title} className="relative overflow-hidden border-0 bg-white/70 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105">
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.gradient} opacity-10 rounded-full transform translate-x-8 -translate-y-8`} />
          
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className={`p-3 rounded-xl bg-gradient-to-r ${stat.gradient} shadow-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-green-600">
                <Activity className="w-3 h-3" />
                {stat.change}
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              {isLoading ? (
                <>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-slate-900">
                    {stat.value}
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {stat.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {stat.description}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
