
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  LineChart, 
  ScatterChart,
  TrendingUp,
  Edit,
  Star,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart as ReLineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import PDFExporter from "../utils/PDFExporter";

export default function ChartGallery({ visualizations, isLoading, onEdit }) {
  const getChartIcon = (type) => {
    const icons = {
      line: LineChart,
      bar: BarChart3,
      scatter: ScatterChart,
      area: TrendingUp
    };
    return icons[type] || BarChart3;
  };

  const getChartColor = (type) => {
    const colors = {
      line: "from-blue-500 to-cyan-600",
      bar: "from-emerald-500 to-teal-600",
      scatter: "from-purple-500 to-indigo-600",
      area: "from-orange-500 to-red-600"
    };
    return colors[type] || "from-blue-500 to-cyan-600";
  };

  // Sample data for chart previews
  const sampleData = [
    { name: 'A', value: 400 },
    { name: 'B', value: 300 },
    { name: 'C', value: 600 },
    { name: 'D', value: 800 }
  ];

  const renderMiniChart = (type) => {
    switch (type) {
      case 'bar':
        return (
          <BarChart data={sampleData}>
            <Bar dataKey="value" fill="#10B981" />
          </BarChart>
        );
      default:
        return (
          <ReLineChart data={sampleData}>
            <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} />
          </ReLineChart>
        );
    }
  };

  // Translations for chart types
  const typeTranslations = {
    line: "Линейный",
    bar: "Столбчатый", 
    scatter: "Рассеяние",
    area: "С областями"
  };

  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Ваши графики
          </CardTitle>
          {visualizations.length > 0 && (
            <PDFExporter 
              title="Отчет по графикам DataViz Pro" 
              elementId="charts-gallery"
            />
          )}
        </div>
      </CardHeader>
      <CardContent id="charts-gallery">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Card key={i} className="border-0 bg-white/50 shadow-lg animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visualizations.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2 heading-text">Графики ещё не созданы</h3>
            <p className="text-slate-500 elegant-text">Создайте свой первый график для начала визуализации данных</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visualizations.map((viz) => {
              const Icon = getChartIcon(viz.type);
              return (
                <Card key={viz.id} className="group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-gradient-to-r ${getChartColor(viz.type)}`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <Badge variant="secondary" className="text-xs elegant-text">
                          {typeTranslations[viz.type] || viz.type}
                        </Badge>
                      </div>
                      {viz.is_favorite && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                    </div>

                    <h3 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors heading-text break-words">
                      {viz.title}
                    </h3>

                    <div className="h-24 mb-4 bg-slate-50 rounded-lg p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        {renderMiniChart(viz.type)}
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-500 mb-4 elegant-text">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(viz.created_date), "d MMM yyyy")}
                      </div>
                      <span className="text-xs">
                        {viz.x_axis} × {viz.y_axis}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 elegant-text"
                      onClick={() => onEdit(viz)}
                    >
                      <Edit className="w-4 h-4" />
                      Редактировать график
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
