import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Globe, Compass, Save } from "lucide-react";

import MapConfigurator from "../components/maps/MapConfigurator";
import MapView from "../components/maps/MapView";
import MapGallery from "../components/maps/MapGallery";

export default function Maps() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [currentMapConfig, setCurrentMapConfig] = useState(null);

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

  const handleSaveMap = async (config) => {
    try {
      await Visualization.create({
        title: config.title,
        type: 'map',
        dataset_id: config.dataset_id,
        config: config
      });
      await loadData();
      setShowBuilder(false);
      setCurrentMapConfig(null);
    } catch (error) {
      console.error("Ошибка сохранения карты:", error);
    }
  };

  const handleEditMap = (viz) => {
    setCurrentMapConfig(viz.config);
    setShowBuilder(true);
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

        {showBuilder ? (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <MapConfigurator 
                datasets={datasets}
                onSave={handleSaveMap}
                onCancel={() => setShowBuilder(false)}
                initialConfig={currentMapConfig}
              />
            </div>
            <div className="lg:col-span-2">
              <MapView />
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <Button 
                onClick={() => setShowBuilder(true)}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-8 py-3 text-lg font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 gap-2"
              >
                <MapIcon className="w-5 h-5" />
                Создать новую карту
              </Button>
            </div>
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