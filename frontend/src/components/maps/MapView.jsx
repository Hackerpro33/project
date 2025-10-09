
import React, { useEffect, useMemo } from 'react';
import { MapContainer, Popup, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseCoordinate, parseNumericValue } from "@/utils/mapUtils";
import samplePoints from "./sampleData";

import L from 'leaflet';

function LocalTileLayer() {
  const map = useMap();

  useEffect(() => {
    const gridLayer = L.gridLayer({ tileSize: 256 });

    gridLayer.createTile = () => {
      const tile = document.createElement('canvas');
      tile.width = 256;
      tile.height = 256;

      const ctx = tile.getContext('2d');
      if (!ctx) {
        return tile;
      }

      const gradient = ctx.createLinearGradient(0, 0, 256, 256);
      gradient.addColorStop(0, '#f0f6ff');
      gradient.addColorStop(1, '#e0e9f9');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = '#c7d2fe';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 256; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }

      return tile;
    };

    gridLayer.addTo(map);

    return () => {
      gridLayer.remove();
    };
  }, [map]);

  return null;
}

export default function MapView({ data, config, forecastOverlay, correlationOverlay }) {
  const position = [55.7558, 37.6173]; // Default position (Moscow)

  const pointsToRender = useMemo(() => {
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    if (config?.dataset_id && config.dataset_id !== 'sample') {
      return [];
    }
    return samplePoints;
  }, [data, config?.dataset_id]);

  const shouldShowEmptyState = useMemo(() => {
    if (!config?.dataset_id || config.dataset_id === 'sample') {
      return false;
    }
    return !Array.isArray(data) || data.length === 0;
  }, [config?.dataset_id, data]);

  const firstValidPoint = useMemo(() => {
    return pointsToRender.find((point) => {
      const latValue = config?.lat_column ? parseCoordinate(point[config.lat_column]) : parseCoordinate(point.lat);
      const lonValue = config?.lon_column ? parseCoordinate(point[config.lon_column]) : parseCoordinate(point.lon);
      return latValue !== null && lonValue !== null;
    });
  }, [pointsToRender, config]);

  const mapCenter = firstValidPoint
    ? [
        config?.lat_column ? parseCoordinate(firstValidPoint[config.lat_column]) : parseCoordinate(firstValidPoint.lat),
        config?.lon_column ? parseCoordinate(firstValidPoint[config.lon_column]) : parseCoordinate(firstValidPoint.lon),
      ]
    : (() => {
        if (!pointsToRender.length) {
          return position;
        }
        const fallbackLat = config?.lat_column
          ? parseCoordinate(pointsToRender[0][config.lat_column])
          : parseCoordinate(pointsToRender[0].lat);
        const fallbackLon = config?.lon_column
          ? parseCoordinate(pointsToRender[0][config.lon_column])
          : parseCoordinate(pointsToRender[0].lon);
        if (fallbackLat !== null && fallbackLon !== null) {
          return [fallbackLat, fallbackLon];
        }
        return position;
      })();


  const getMarkerColor = (point) => {
    const rawValue = config?.value_column ? point[config.value_column] : point.value;
    const value = parseNumericValue(rawValue);
    const forecastValue = parseNumericValue(point.forecast);
    const correlationValue = parseNumericValue(point.correlation);

    if (config?.overlay_type === 'forecast' && forecastValue !== null) {
      const intensity = forecastValue / 1000; // Normalize to 0-1
      return `hsl(${120 - intensity * 120}, 70%, 50%)`; // Green to red
    }
    if (config?.overlay_type === 'correlation' && correlationValue !== null) {
      const intensity = Math.abs(correlationValue);
      return `hsl(${correlationValue > 0 ? 240 : 0}, 70%, ${50 + intensity * 30}%)`; // Blue for positive, red for negative
    }

    // Default color based on value
    const intensity = value ? value / 850 : 0; // Normalize based on max sample value
    return `hsl(${240 - intensity * 60}, 70%, ${45 + intensity * 15}%)`; // Blue to purple gradient
  };

  const getMarkerRadius = (point) => {
    const rawValue = config?.value_column ? point[config.value_column] : point.value;
    const value = parseNumericValue(rawValue);
    const baseRadius = 8;
    const forecastValue = parseNumericValue(point.forecast);
    const correlationValue = parseNumericValue(point.correlation);

    if (config?.overlay_type === 'forecast' && forecastValue !== null) {
      return baseRadius + (forecastValue / 100);
    }
    if (config?.overlay_type === 'correlation' && correlationValue !== null) {
      return baseRadius + (Math.abs(correlationValue) * 12);
    }
    return baseRadius + ((value || 0) / 100);
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Мегаполис': 'bg-red-100 text-red-700',
      'Культурный центр': 'bg-purple-100 text-purple-700',
      'Промышленный': 'bg-orange-100 text-orange-700',
      'Научный': 'bg-blue-100 text-blue-700',
      'Региональный': 'bg-green-100 text-green-700',
      'Образовательный': 'bg-indigo-100 text-indigo-700',
      'Торговый': 'bg-yellow-100 text-yellow-700'
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="relative h-[70vh] w-full">
      <MapContainer
        center={mapCenter}
        zoom={pointsToRender.length > 0 ? 5 : 4}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
      >
        <LocalTileLayer />
        {pointsToRender.map((point, index) => {
          const lat = config?.lat_column ? parseCoordinate(point[config.lat_column]) : parseCoordinate(point.lat);
          const lon = config?.lon_column ? parseCoordinate(point[config.lon_column]) : parseCoordinate(point.lon);
          const rawValue = config?.value_column ? point[config.value_column] : point.value;
          const value = parseNumericValue(rawValue);
          const name = point[Object.keys(point).find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('region'))] || `Точка ${index + 1}`;

          if (lat === null || lon === null) {
            return null;
          }

          return (
            <CircleMarker
              key={index}
              center={[lat, lon]}
              radius={getMarkerRadius(point)}
              pathOptions={{ 
                color: getMarkerColor(point), 
                fillColor: getMarkerColor(point), 
                fillOpacity: 0.7,
                weight: 2
              }}
            >
              <Popup>
                <div className="space-y-3 min-w-64">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 heading-text text-lg">
                      {name}
                    </h3>
                    {point.category && (
                      <Badge className={getCategoryColor(point.category)}>
                        {point.category}
                      </Badge>
                    )}
                  </div>
                  
                  {point.description && (
                    <p className="text-sm text-slate-600 elegant-text">
                      {point.description}
                    </p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2">
                    {value !== null && value !== undefined && (
                      <div className="text-center p-2 bg-slate-50 rounded">
                        <div className="text-sm font-semibold text-slate-700">{typeof value === 'number' ? value.toLocaleString() : value}</div>
                        <div className="text-xs text-slate-500">{config?.value_column || 'Значение'}</div>
                      </div>
                    )}
                    
                    {config?.overlay_type === 'forecast' && point.forecast && (
                      <div className="text-center p-2 bg-green-50 rounded">
                        <div className="text-sm font-semibold text-green-700">{point.forecast}</div>
                        <div className="text-xs text-green-600">Прогноз</div>
                      </div>
                    )}
                    
                    {config?.overlay_type === 'correlation' && point.correlation !== undefined && (
                      <div className="text-center p-2 bg-blue-50 rounded">
                        <div className="text-sm font-semibold text-blue-700">{point.correlation.toFixed(2)}</div>
                        <div className="text-xs text-blue-600">Корреляция</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-slate-400 border-t pt-2 elegant-text">
                    Координаты: {lat.toFixed(4)}°, {lon.toFixed(4)}°
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
      {shouldShowEmptyState && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-md">
            Нет данных для отображения. Проверьте выбранные столбцы координат.
          </div>
        </div>
      )}
    </div>
  );
}
