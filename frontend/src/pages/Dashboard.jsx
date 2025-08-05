
import React, { useState, useEffect } from "react";
import { getDatasets, getVisualizations } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  Database, 
  BarChart3, 
  Map, 
  TrendingUp, 
  Plus,
  Activity,
  Eye,
  Calendar,
  Zap
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area } from 'recharts';

import StatsGrid from "../components/dashboard/StatsGrid";
import QuickActions from "../components/dashboard/QuickActions";
import RecentActivity from "../components/dashboard/RecentActivity";
import TrendingCharts from "../components/dashboard/TrendingCharts";

export default function Dashboard() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
   setIsLoading(true);
   try {
    const datasetsData = await getDatasets();
    // const visualizationsData = await getVisualizations(); // если реализуешь
    setDatasets(datasetsData);
    // setVisualizations(visualizationsData);
  } catch (error) {
    console.error('Ошибка загрузки данных:', error);
  }
   setIsLoading(false);
};
     

  const sampleTrendData = [
    { name: 'Jan', value: 400, growth: 240 },
    { name: 'Feb', value: 300, growth: 456 },
    { name: 'Mar', value: 600, growth: 590 },
    { name: 'Apr', value: 800, growth: 780 },
    { name: 'May', value: 700, growth: 890 },
    { name: 'Jun', value: 900, growth: 1200 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 p-8 text-white">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20" />
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                  Панель аналитики
                </h1>
                <p className="text-xl text-slate-300 max-w-2xl leading-relaxed">
                  Превратите ваши данные в полезные инсайты с помощью AI-визуализаций и прогнозирования
                </p>
                <div className="flex items-center gap-6 mt-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <span className="text-slate-300">Обработка в реальном времени</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-300">AI-Ассистент</span>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sampleTrendData.slice(0, 4)}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="url(#gradient)" 
                        strokeWidth={3}
                        dot={false}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#60A5FA" />
                          <stop offset="100%" stopColor="#A78BFA" />
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <StatsGrid 
          datasets={datasets}
          visualizations={visualizations}
          isLoading={isLoading}
        />

        {/* Quick Actions */}
        <QuickActions />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <RecentActivity 
              datasets={datasets}
              visualizations={visualizations}
              isLoading={isLoading}
            />
          </div>

          {/* Trending Charts */}
          <div>
            <TrendingCharts data={sampleTrendData} />
          </div>
        </div>
      </div>
    </div>
  );
}
