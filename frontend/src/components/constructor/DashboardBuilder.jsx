import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Grip,
  X,
  Eye,
  Save,
  Layout,
  Search,
  RotateCcw,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const STORAGE_KEY = 'dashboard-builder-state';

function SummaryContent({ content }) {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return <p className="text-xs text-slate-500 mt-2">{content}</p>;
  }

  if (Array.isArray(content)) {
    return (
      <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
        {content.slice(0, 3).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }

  if (typeof content === 'object') {
    if (Array.isArray(content.insights) && content.insights.length > 0) {
      return (
        <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
          {content.insights.slice(0, 3).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    const firstValue = Object.values(content).find((value) => typeof value === 'string');
    if (firstValue) {
      return <p className="text-xs text-slate-500 mt-2">{firstValue}</p>;
    }
  }

  return null;
}

const renderTagBadges = (tags) => {
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.slice(0, 4).map((tag) => (
        <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-wide">
          {tag}
        </Badge>
      ))}
    </div>
  );
};

export default function DashboardBuilder({
  datasets = [],
  visualizations = [],
  availableWidgets = [],
  onSave,
  isLoading,
}) {
  const { toast } = useToast();
  const [dashboardName, setDashboardName] = useState('Мой дашборд');
  const [selectedWidgets, setSelectedWidgets] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (parsed?.name) {
        setDashboardName(parsed.name);
      }
      if (Array.isArray(parsed?.widgets)) {
        setSelectedWidgets(parsed.widgets);
      }
    } catch (error) {
      console.warn('Не удалось восстановить сохранённый дашборд из localStorage', error);
    }
  }, []);

  const datasetMap = useMemo(() => {
    const map = new Map();
    datasets.forEach((dataset) => {
      if (dataset?.id) {
        map.set(dataset.id, dataset);
      }
    });
    return map;
  }, [datasets]);

  const visualizationMap = useMemo(() => {
    const map = new Map();
    visualizations.forEach((viz) => {
      if (viz?.id) {
        map.set(viz.id, viz);
      }
    });
    return map;
  }, [visualizations]);

  const filteredWidgets = useMemo(() => {
    if (!librarySearch.trim()) {
      return availableWidgets;
    }

    const query = librarySearch.trim().toLowerCase();
    return availableWidgets.filter((widget) => {
      const haystack = [
        widget.title,
        widget.type,
        ...(Array.isArray(widget.tags) ? widget.tags : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [availableWidgets, librarySearch]);

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
      sourceId: widget.id,
      x: 0,
      y: 0,
      width: 4,
      height: 3,
    };
    setSelectedWidgets((prev) => [...prev, newWidget]);
  };

  const removeWidget = (widgetId) => {
    setSelectedWidgets((prev) => prev.filter((w) => w.id !== widgetId));
  };

  const handleSave = () => {
    const trimmedName = dashboardName.trim() || 'Без названия';

    if (selectedWidgets.length === 0) {
      toast({
        title: 'Добавьте виджеты',
        description: 'Чтобы сохранить дашборд, добавьте на холст хотя бы один элемент.',
        variant: 'destructive',
      });
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ name: trimmedName, widgets: selectedWidgets })
        );
      } catch (error) {
        console.warn('Не удалось сохранить дашборд в localStorage', error);
      }
    }

    setDashboardName(trimmedName);
    toast({
      title: 'Дашборд сохранён',
      description: 'Конфигурация сохранена локально. Можно вернуться к редактированию в любое время.',
    });

    onSave?.({ name: trimmedName, widgets: selectedWidgets });
  };

  const handlePreview = () => {
    toast({
      title: 'Предпросмотр в разработке',
      description: 'Сборка интерактивного предпросмотра появится в следующей версии.',
    });
  };

  const handleClear = () => {
    setSelectedWidgets([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    toast({
      title: 'Холст очищен',
      description: 'Все виджеты удалены из текущего дашборда.',
    });
  };

  const renderWidget = (widget) => {
    const IconComponent = widget.icon || Layout;
    const datasetInfo = widget.datasetId ? datasetMap.get(widget.datasetId) : undefined;
    const visualizationInfo = widget.visualizationId
      ? visualizationMap.get(widget.visualizationId)
      : undefined;

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
      case 'dataset': {
        const columnsCount = datasetInfo?.columns?.length;
        const tags = datasetInfo?.tags?.length ? datasetInfo.tags : widget.tags;
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <IconComponent className="w-6 h-6 text-blue-600 mt-1" />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {datasetInfo?.name || widget.title}
                </div>
                {(datasetInfo?.description || widget.description) && (
                  <p className="text-xs text-slate-500">
                    {datasetInfo?.description || widget.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {datasetInfo?.row_count && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {datasetInfo.row_count.toLocaleString('ru-RU')} записей
                    </Badge>
                  )}
                  {typeof columnsCount === 'number' && columnsCount > 0 && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                      {columnsCount} колонок
                    </Badge>
                  )}
                </div>
                {renderTagBadges(tags)}
              </div>
            </div>
          </div>
        );
      }
      case 'visualization': {
        const chartType = widget.chartType || visualizationInfo?.type;
        const tags = visualizationInfo?.tags?.length ? visualizationInfo.tags : widget.tags;
        const summary = widget.summary || visualizationInfo?.summary;
        const relatedDataset = widget.datasetId
          ? datasetMap.get(widget.datasetId)
          : visualizationInfo?.dataset_id
            ? datasetMap.get(visualizationInfo.dataset_id)
            : undefined;

        return (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <IconComponent className="w-6 h-6 text-emerald-600 mt-1" />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {visualizationInfo?.title || widget.title}
                </div>
                {chartType && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-emerald-700 border-emerald-200">
                    {chartType}
                  </Badge>
                )}
                {relatedDataset?.name && (
                  <p className="text-xs text-slate-500">
                    Основано на наборе: <span className="font-medium text-slate-700">{relatedDataset.name}</span>
                  </p>
                )}
                <SummaryContent content={summary} />
                {renderTagBadges(tags)}
              </div>
            </div>
          </div>
        );
      }
      default:
        return (
          <div className="h-32 bg-slate-50 rounded-lg p-4 flex items-center justify-center">
            <span className="text-slate-500">Виджет {widget.title}</span>
          </div>
        );
    }
  };

  const isCanvasEmpty = selectedWidgets.length === 0;

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
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Поиск виджетов"
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-3">
              {isLoading && (
                <>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-white/60">
                      <Skeleton className="h-4 w-1/3 mb-2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </>
              )}

              {!isLoading && filteredWidgets.length === 0 && (
                <div className="p-4 border rounded-lg text-sm text-slate-500 bg-slate-50">
                  Ничего не найдено. Попробуйте изменить запрос поиска или загрузите новые данные.
                </div>
              )}

              {!isLoading &&
                filteredWidgets.map((widget) => {
                  const IconComponent = widget.icon || Layout;
                  const details = [];
                  if (widget.type === 'dataset' && widget.rowCount) {
                    details.push(`${widget.rowCount.toLocaleString('ru-RU')} записей`);
                  }
                  if (widget.type === 'visualization' && widget.chartType) {
                    details.push(`Тип: ${widget.chartType}`);
                  }

                  return (
                    <div
                      key={widget.id}
                      className="p-3 border rounded-lg bg-white/60 hover:bg-blue-50/60 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => addWidget(widget)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start gap-3">
                          <IconComponent className="w-5 h-5 text-slate-600 mt-1" />
                          <div className="space-y-1">
                            <div className="font-medium text-sm text-slate-800">{widget.title}</div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-400">
                              {widget.type}
                            </div>
                            {widget.description && (
                              <p className="text-xs text-slate-500">
                                {widget.description}
                              </p>
                            )}
                            {details.length > 0 && (
                              <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                                {details.map((detail) => (
                                  <span key={detail}>{detail}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
            </div>
          </ScrollArea>

          <div className="pt-4 border-t">
            <div className="space-y-2 text-xs text-slate-500">
              <div className="text-sm font-medium text-slate-700">Доступные данные</div>
              <div className="flex flex-col gap-1">
                <span>{datasets.length} наборов данных</span>
                <span>{visualizations.length} визуализаций</span>
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <Input
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                className="text-lg font-bold border-0 shadow-none focus-visible:ring-0"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handlePreview}
                >
                  <Eye className="w-4 h-4" />
                  Предпросмотр
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleClear}
                  disabled={isCanvasEmpty}
                >
                  <RotateCcw className="w-4 h-4" />
                  Очистить холст
                </Button>
                <Button size="sm" className="gap-2" onClick={handleSave}>
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
              <Badge variant="secondary" className="ml-2 bg-blue-50 text-blue-700">
                {selectedWidgets.length} элементов
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isCanvasEmpty ? (
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
                              className={`relative group transition-shadow ${
                                snapshot.isDragging ? 'shadow-lg shadow-blue-100' : ''
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
