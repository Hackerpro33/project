import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Grip, 
  X, 
  BarChart3, 
  LineChart, 
  Map, 
  TrendingUp,
  Eye,
  Save,
  Layout
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function DashboardBuilder({ datasets, visualizations, onSave, isLoading }) {
  const [dashboardName, setDashboardName] = useState('Мой дашборд');
  const [selectedWidgets, setSelectedWidgets] = useState([]);
  const [availableWidgets] = useState([
    { id: 'stats', type: 'stats', title: 'Статистика', icon: BarChart3 },
    { id: 'chart1', type: 'chart', title: 'График продаж', icon: LineChart },
    { id: 'map1', type: 'map', title: 'Карта регионов', icon: Map },
    { id: 'forecast1', type: 'forecast', title: 'Прогноз трендов', icon: TrendingUp }
  ]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(selectedWidgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSelectedWidgets(items);
  };

  const addWidget = (widget) => {
    const newWidget = {
      ...widget,
      id: `${widget.id}_${Date.now()}`,
      x: 0,
      y: 0,
      width: 4,
      height: 3
    };
    setSelectedWidgets([...selectedWidgets, newWidget]);
  };

  const removeWidget = (widgetId) => {
    setSelectedWidgets(selectedWidgets.filter(w => w.id !== widgetId));
  };

  const renderWidget = (widget) => {
    const IconComponent = widget.icon;
    
    switch (widget.type) {
      case 'stats':
        return (
          <div className="h-32 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-4 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">147</div>
              <div className="text-sm text-blue-700">Всего записей</div>
            </div>
          </div>
        );
      case 'chart':
        return (
          <div className="h-32 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg p-4 flex items-center justify-center">
            <div className="text-center text-emerald-600">
              <IconComponent className="w-12 h-12 mx-auto mb-2" />
              <div className="text-sm">Линейный график</div>
            </div>
          </div>
        );
      case 'map':
        return (
          <div className="h-32 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4 flex items-center justify-center">
            <div className="text-center text-purple-600">
              <IconComponent className="w-12 h-12 mx-auto mb-2" />
              <div className="text-sm">Интерактивная карта</div>
            </div>
          </div>
        );
      case 'forecast':
        return (
          <div className="h-32 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-4 flex items-center justify-center">
            <div className="text-center text-orange-600">
              <IconComponent className="w-12 h-12 mx-auto mb-2" />
              <div className="text-sm">Локальный прогноз</div>
            </div>
          </div>
        );
      default:
        return (
          <div className="h-32 bg-slate-50 rounded-lg p-4 flex items-center justify-center">
            <span className="text-slate-500">Виджет {widget.title}</span>
          </div>
        );
    }
  };

  return (
    <div className="grid lg:grid-cols-4 gap-8">
      {/* Widget Library */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Plus className="w-5 h-5 text-emerald-500" />
            Библиотека виджетов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {availableWidgets.map((widget) => {
            const IconComponent = widget.icon;
            return (
              <div
                key={widget.id}
                className="p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => addWidget(widget)}
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="w-5 h-5 text-slate-600" />
                  <div>
                    <div className="font-medium text-sm">{widget.title}</div>
                    <div className="text-xs text-slate-500 capitalize">{widget.type}</div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="pt-4 border-t">
            <div className="space-y-2">
              <div className="text-sm font-medium text-slate-700">Доступные данные:</div>
              <div className="text-xs text-slate-500">
                {datasets.length} наборов данных<br/>
                {visualizations.length} визуализаций
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Canvas */}
      <div className="lg:col-span-3 space-y-6">
        {/* Dashboard Header */}
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Input
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                className="text-lg font-bold border-0 shadow-none focus-visible:ring-0 flex-1 mr-4"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Предпросмотр
                </Button>
                <Button size="sm" className="gap-2">
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Grid */}
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl min-h-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
              <Layout className="w-5 h-5 text-blue-500" />
              Холст дашборда
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedWidgets.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Layout className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="font-bold text-slate-700 mb-2">Пустой дашборд</h3>
                <p className="text-sm">
                  Выберите виджеты из библиотеки слева, чтобы начать создание дашборда
                </p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="dashboard">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                      {selectedWidgets.map((widget, index) => (
                        <Draggable key={widget.id} draggableId={widget.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`relative group ${
                                snapshot.isDragging ? 'opacity-80' : ''
                              }`}
                            >
                              <Card className="overflow-hidden">
                                <CardHeader className="p-3 bg-slate-50 border-b">
                                  <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium">
                                      {widget.title}
                                    </CardTitle>
                                    <div className="flex items-center gap-1">
                                      <div
                                        {...provided.dragHandleProps}
                                        className="p-1 hover:bg-slate-200 rounded cursor-move"
                                      >
                                        <Grip className="w-3 h-3 text-slate-400" />
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeWidget(widget.id)}
                                        className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                                      >
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="p-4">
                                  {renderWidget(widget)}
                                </CardContent>
                              </Card>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}