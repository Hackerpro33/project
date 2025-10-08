import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Globe, Compass, Settings, Plus } from "lucide-react";

import MapConfigurator from "../components/maps/MapConfigurator";
import MapView from "../components/maps/MapView";
import MapGallery from "../components/maps/MapGallery";

export default function Maps() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [mapData, setMapData] = useState([]);
  const [currentMapConfig, setCurrentMapConfig] = useState({
    title: 'Образец данных на карте',
    dataset_id: 'sample',
    lat_column: 'latitude',
    lon_column: 'longitude',
    value_column: 'value',
    overlay_type: 'none'
  });
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.filter({ type: 'map' }, '-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных карты:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const datasetId = currentMapConfig?.dataset_id;
    if (!datasetId || datasetId === 'sample') {
      setMapData([]);
      return;
    }

    const datasetFromState = datasets.find((dataset) => dataset.id === datasetId);
    if (datasetFromState && Array.isArray(datasetFromState.sample_data) && datasetFromState.sample_data.length > 0) {
      setMapData(datasetFromState.sample_data);
      return;
    }

    let isCancelled = false;

    const fetchDataset = async () => {
      setIsDatasetLoading(true);
      try {
        const dataset = await Dataset.get(datasetId);
        if (!isCancelled) {
          setMapData(dataset.sample_data || []);
          setDatasets((prev) => prev.map((item) => (item.id === datasetId ? { ...item, ...dataset } : item)));
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Не удалось загрузить данные набора для карты:', error);
          setMapData([]);
        }
      } finally {
        if (!isCancelled) {
          setIsDatasetLoading(false);
        }
      }
    };

    fetchDataset();

    return () => {
      isCancelled = true;
    };
  }, [currentMapConfig?.dataset_id, datasets]);

  const handleSaveMap = async (config) => {
    try {
      await Visualization.create({
        title: config.title,
        type: 'map',
        dataset_id: config.dataset_id,
        config: config
      });
      await loadData();
      setShowConfigurator(false);
      setCurrentMapConfig(config);
      if (config.dataset_id) {
        setMapData([]);
      }
    } catch (error) {
      console.error("Ошибка сохранения карты:", error);
    }
  };

  const handleEditMap = (viz) => {
    setCurrentMapConfig(viz.config);
    setMapData([]);
    setShowConfigurator(true);
  };

  const handleCreateNewMap = () => {
    setCurrentMapConfig({
      title: '',
      dataset_id: '',
      lat_column: '',
      lon_column: '',
      value_column: '',
      overlay_type: 'none'
    });
    setMapData([]);
    setShowConfigurator(true);
  };

  const handleConfigChange = (nextConfig) => {
    setCurrentMapConfig(nextConfig);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Географические инсайты
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Визуализируйте географические данные на интерактивной карте. Откройте пространственные закономерности и тенденции.
          </p>
        </div>

        {/* Main Content */}
        {showConfigurator ? (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <MapConfigurator
                datasets={datasets}
                onSave={handleSaveMap}
                onCancel={() => setShowConfigurator(false)}
                initialConfig={currentMapConfig}
                onConfigChange={handleConfigChange}
              />
            </div>
            <div className="lg:col-span-2">
              <div className="relative">
                {isDatasetLoading && (
                  <div className="absolute top-4 left-4 z-[1000] rounded-lg bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                    Загрузка данных набора...
                  </div>
                )}
                <MapView config={currentMapConfig} data={mapData} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Action Buttons */}
            <div className="flex justify-center gap-4 flex-wrap">
              <Button 
                onClick={handleCreateNewMap}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 text-base font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 gap-2"
              >
                <Plus className="w-5 h-5" />
                Создать новую карту
              </Button>
              <Button 
                onClick={() => setShowConfigurator(true)}
                variant="outline"
                className="px-6 py-3 text-base font-medium border-2 hover:bg-slate-50 gap-2"
              >
                <Settings className="w-5 h-5" />
                Настроить карту
              </Button>
            </div>

            {/* Interactive Map Display */}
            <div className="grid lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3">
                <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
                  <CardHeader className="border-b border-slate-200">
                    <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                      <Globe className="w-5 h-5 text-purple-500" />
                      Интерактивная карта
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 relative">
                    {isDatasetLoading && (
                      <div className="absolute top-4 left-4 z-[1000] rounded-lg bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                        Загрузка данных набора...
                      </div>
                    )}
                    <MapView config={currentMapConfig} data={mapData} />
                  </CardContent>
                </Card>
              </div>

              {/* Map Info Panel */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                      <MapIcon className="w-5 h-5 text-blue-500" />
                      Информация о карте
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2">Текущая конфигурация:</h4>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>Источник данных:</span>
                          <span className="font-medium">
                            {currentMapConfig.dataset_id === 'sample' ? 'Образцы' : datasets.find(d => d.id === currentMapConfig.dataset_id)?.name || 'Не выбран'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Широта:</span>
                          <span className="font-medium">{currentMapConfig.lat_column || 'latitude'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Долгота:</span>
                          <span className="font-medium">{currentMapConfig.lon_column || 'longitude'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Значения:</span>
                          <span className="font-medium">{currentMapConfig.value_column || 'value'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-2">Возможности карты:</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>• Интерактивное масштабирование</li>
                        <li>• Детальная информация о точках</li>
                        <li>• Цветовое кодирование значений</li>
                        <li>• Наложение прогнозных данных</li>
                        <li>• Корреляционный анализ</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-lg border border-purple-200">
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                        <Compass className="w-6 h-6 text-white" />
                      </div>
                      <h4 className="font-semibold text-purple-800 mb-2">Исследуйте данные</h4>
                      <p className="text-sm text-purple-700">
                        Нажмите на точки карты, чтобы увидеть детальную информацию и скрытые паттерны в ваших данных.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Saved Maps Gallery */}
            <MapGallery 
              visualizations={visualizations}
              isLoading={isLoading}
              onEdit={handleEditMap}
            />
          </>
        )}
      </div>
    </div>
  );
}