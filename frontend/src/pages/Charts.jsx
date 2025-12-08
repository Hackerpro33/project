import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  LineChart,
  ScatterChart,
  TrendingUp,
  Plus,
  Filter,
  Search,
  Tag
} from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import PaginationControls from "@/components/common/PaginationControls";
import SavedViewsManager from "@/components/common/SavedViewsManager";

import ChartBuilder from "../components/charts/ChartBuilder";
import ChartGallery from "../components/charts/ChartGallery";
import ChartTypeSelector from "../components/charts/ChartTypeSelector";
import ChartViewer from "../components/charts/ChartViewer";
import AdvancedChartInsights from "../components/charts/AdvancedChartInsights";
import ChartTemplateLibrary from "../components/charts/ChartTemplateLibrary";

export default function Charts() {
  const { t } = useTranslation();
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedChartType, setSelectedChartType] = useState('line');
  const [editingViz, setEditingViz] = useState(null);
  const [viewingViz, setViewingViz] = useState(null);
  const [activeSegment, setActiveSegment] = useState(null);
  const [visualizationMeta, setVisualizationMeta] = useState({
    totalPages: 0,
    availableFilters: { tags: [], types: [] },
  });
  const [vizSearch, setVizSearch] = useState('');
  const [vizTags, setVizTags] = useState([]);
  const [vizTypes, setVizTypes] = useState([]);
  const [vizPagination, setVizPagination] = useState({ page: 1, pageSize: 9 });
  const [activeTemplate, setActiveTemplate] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list({ orderBy: '-created_date', pageSize: 100 }),
        Visualization.list({
          orderBy: '-created_date',
          page: vizPagination.page,
          pageSize: vizPagination.pageSize,
          search: vizSearch || undefined,
          tags: vizTags.length ? vizTags : undefined,
          types: vizTypes.length ? vizTypes : undefined,
        }),
        Dataset.list("-created_at"),
        Visualization.list("-created_at"),
      ]);
      setDatasets(Array.isArray(datasetsData.items) ? datasetsData.items : datasetsData);
      setVisualizations(Array.isArray(visualizationsData.items) ? visualizationsData.items : []);
      setVisualizationMeta({
        totalPages: visualizationsData.total_pages ?? 0,
        availableFilters: visualizationsData.available_filters ?? { tags: [], types: [] },
      });
      setVizPagination({
        page: visualizationsData.page ?? vizPagination.page,
        pageSize: visualizationsData.page_size ?? vizPagination.pageSize,
      });
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      setVisualizations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadVisualizations = async ({ page, pageSize, search, tags, types } = {}) => {
    const nextPage = page ?? vizPagination.page;
    const nextPageSize = pageSize ?? vizPagination.pageSize;
    const nextSearch = search ?? vizSearch;
    const nextTags = tags ?? vizTags;
    const nextTypes = types ?? vizTypes;
    setIsLoading(true);
    try {
      const response = await Visualization.list({
        orderBy: '-created_date',
        page: nextPage,
        pageSize: nextPageSize,
        search: nextSearch || undefined,
        tags: nextTags.length ? nextTags : undefined,
        types: nextTypes.length ? nextTypes : undefined,
      });
      setVisualizations(Array.isArray(response.items) ? response.items : []);
      setVisualizationMeta({
        totalPages: response.total_pages ?? 0,
        availableFilters: response.available_filters ?? { tags: [], types: [] },
      });
      setVizPagination({
        page: response.page ?? nextPage,
        pageSize: response.page_size ?? nextPageSize,
      });
    } catch (error) {
      console.error('Ошибка загрузки визуализаций:', error);
      setVisualizations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVisualizationSearch = (value) => {
    setVizSearch(value);
    setVizPagination((prev) => ({ ...prev, page: 1 }));
    loadVisualizations({ page: 1, search: value });
  };

  const handleTagToggle = (tag) => {
    setVizTags((prev) => {
      const exists = prev.includes(tag);
      const next = exists ? prev.filter((item) => item !== tag) : [...prev, tag];
      setVizPagination((state) => ({ ...state, page: 1 }));
      loadVisualizations({ page: 1, tags: next });
      return next;
    });
  };

  const handleTypeToggle = (type) => {
    setVizTypes((prev) => {
      const exists = prev.includes(type);
      const next = exists ? prev.filter((item) => item !== type) : [...prev, type];
      setVizPagination((state) => ({ ...state, page: 1 }));
      loadVisualizations({ page: 1, types: next });
      return next;
    });
  };

  const handleVisualizationsPageChange = (page) => {
    setVizPagination((prev) => ({ ...prev, page }));
    loadVisualizations({ page });
  };

  const handleApplyVisualizationView = (view) => {
    const nextTags = view?.filters?.tags ?? [];
    const nextTypes = view?.filters?.types ?? [];
    const nextSearch = view?.search ?? '';
    const nextPageSize = view?.page_size ?? vizPagination.pageSize;
    setVizSearch(nextSearch);
    setVizTags(nextTags);
    setVizTypes(nextTypes);
    setVizPagination({ page: 1, pageSize: nextPageSize });
    loadVisualizations({
      page: 1,
      pageSize: nextPageSize,
      search: nextSearch,
      tags: nextTags,
      types: nextTypes,
    });
  };

  const handleResetVisualizationFilters = () => {
    setVizSearch('');
    setVizTags([]);
    setVizTypes([]);
    setVizPagination((prev) => ({ ...prev, page: 1 }));
    loadVisualizations({ page: 1, search: '', tags: [], types: [] });
  };

  const handleCreateChart = (chartType) => {
    setEditingViz(null);
    setActiveTemplate(null);
    setSelectedChartType(chartType);
    setShowBuilder(true);
  };
  
  const handleEditChart = (viz) => {
    setEditingViz(viz);
    setActiveTemplate(null);
    setSelectedChartType(viz.type);
    setShowBuilder(true);
  }

  const handleCloseBuilder = () => {
    setShowBuilder(false);
    setEditingViz(null);
    setActiveTemplate(null);
  }

  const visualizationViewState = {
    search: vizSearch,
    filters: { tags: vizTags, types: vizTypes },
    orderBy: '-created_date',
    pageSize: vizPagination.pageSize,
  };

  const hasVisualizationFilters =
    Boolean(vizSearch) || vizTags.length > 0 || vizTypes.length > 0;

  const handleApplyTemplate = (template) => {
    setEditingViz(null);
    setActiveTemplate(template);
    setSelectedChartType(template.chartType);
    setShowBuilder(true);
  };

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            {t('charts.title')}
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            {t('charts.subtitle')}
          </p>
        </div>

        {/* Advanced Insights */}
        {!showBuilder && (
          <AdvancedChartInsights
            onSegmentChange={setActiveSegment}
            activeSegment={activeSegment}
          />
        )}

        {/* Chart Type Selector */}
        {!showBuilder && (
          <ChartTypeSelector
            onSelectType={handleCreateChart}
            datasets={datasets}
          />
        )}

        {!showBuilder && (
          <div className="space-y-6">
            <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-lg">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
                    <Input
                      placeholder={t('charts.searchPlaceholder')}
                      value={vizSearch}
                      onChange={(event) => handleVisualizationSearch(event.target.value)}
                      className="bg-white/50 pl-10"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetVisualizationFilters}
                    disabled={!hasVisualizationFilters}
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    {t('charts.clearFilters')}
                  </Button>
                </div>

                {visualizationMeta.availableFilters.tags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('charts.filterTags')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visualizationMeta.availableFilters.tags.map((tag) => {
                        const isActive = vizTags.includes(tag);
                        return (
                          <Button
                            key={tag}
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => handleTagToggle(tag)}
                          >
                            <Tag className="mr-2 h-4 w-4" />
                            {tag}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {visualizationMeta.availableFilters.types.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {t('charts.filterTypes')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visualizationMeta.availableFilters.types.map((type) => {
                        const isActive = vizTypes.includes(type);
                        return (
                          <Button
                            key={type}
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            onClick={() => handleTypeToggle(type)}
                          >
                            {type}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <SavedViewsManager
                    entity="visualization"
                    state={visualizationViewState}
                    onApplyView={handleApplyVisualizationView}
                  />
                </div>
              </CardContent>
            </Card>

            <ChartTemplateLibrary onApplyTemplate={handleApplyTemplate} />
          </div>
        )}

        {/* Chart Builder */}
        {showBuilder && (
          <ChartBuilder
            chartType={selectedChartType}
            datasets={datasets}
            onClose={handleCloseBuilder}
            onSave={() => loadVisualizations({ page: 1 })}
            existingViz={editingViz}
            templatePreset={activeTemplate}
          />
        )}

        {/* Chart Gallery */}
        {!showBuilder && (
          <ChartGallery
            visualizations={visualizations}
            datasets={datasets}
            isLoading={isLoading}
            onEdit={handleEditChart}
            onView={(viz) => setViewingViz(viz)}
            activeSegment={activeSegment}
          />
        )}

        {!showBuilder && visualizationMeta.totalPages > 1 && (
          <PaginationControls
            page={vizPagination.page}
            totalPages={visualizationMeta.totalPages}
            onPageChange={handleVisualizationsPageChange}
            isDisabled={isLoading}
          />
        )}
        
        {/* Chart Viewer Modal */}
        {viewingViz && (
          <ChartViewer
            visualization={viewingViz}
            datasets={datasets}
            onClose={() => setViewingViz(null)}
          />
        )}
      </PageContainer>
    );
}
