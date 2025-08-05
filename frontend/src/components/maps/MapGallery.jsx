import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Edit, Map, Calendar, Globe } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

export default function MapGallery({ visualizations, isLoading, onEdit }) {
  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Globe className="w-5 h-5 text-purple-500" />
          Ваши карты
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : visualizations.length === 0 ? (
          <div className="text-center py-12">
            <Map className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Карты еще не созданы</h3>
            <p className="text-slate-500">Создайте свою первую карту для визуализации географических данных</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visualizations.map((viz) => (
              <Card key={viz.id} className="group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all">
                <div className="h-24 bg-gradient-to-br from-purple-100 to-indigo-200 rounded-t-xl flex items-center justify-center">
                  <Map className="w-10 h-10 text-purple-500" />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-900 mb-2 group-hover:text-purple-600 transition-colors break-words">
                    {viz.title}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-slate-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(viz.created_date), "MMM d, yyyy")}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600"
                    onClick={() => onEdit(viz)}
                  >
                    <Edit className="w-4 h-4" />
                    Настроить карту
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}