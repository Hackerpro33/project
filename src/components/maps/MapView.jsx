import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Placeholder for Leaflet's default icon issue with bundlers
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export default function MapView({ data, config, forecastOverlay, correlationOverlay }) {
  const position = [55.7558, 37.6173]; // Default position (Moscow)

  const samplePoints = [
    { lat: 55.7558, lon: 37.6173, value: 100, name: "Москва", forecast: 120, correlation: 0.85 },
    { lat: 59.9311, lon: 30.3609, value: 250, name: "Санкт-Петербург", forecast: 280, correlation: 0.72 },
    { lat: 56.8431, lon: 60.6454, value: 150, name: "Екатеринбург", forecast: 160, correlation: 0.91 },
  ];

  const pointsToRender = data || samplePoints;
  const mapCenter = pointsToRender.length > 0 ? [pointsToRender[0].lat, pointsToRender[0].lon] : position;

  const getMarkerColor = (point) => {
    if (config?.overlay_type === 'forecast' && point.forecast) {
      const intensity = point.forecast / 300; // Normalize
      return `hsl(${120 - intensity * 120}, 70%, 50%)`; // Green to red
    }
    if (config?.overlay_type === 'correlation' && point.correlation) {
      const intensity = Math.abs(point.correlation);
      return `hsl(${point.correlation > 0 ? 240 : 0}, 70%, ${50 + intensity * 30}%)`; // Blue for positive, red for negative
    }
    return '#8B5CF6'; // Default purple
  };

  const getMarkerRadius = (point) => {
    if (config?.overlay_type === 'forecast' && point.forecast) {
      return 5 + (point.forecast / 50);
    }
    if (config?.overlay_type === 'correlation' && point.correlation) {
      return 5 + (Math.abs(point.correlation) * 15);
    }
    return 5 + (point.value / 50 || 1);
  };

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl h-[60vh] lg:h-full">
      <CardContent className="p-0 h-full">
        <MapContainer 
          center={mapCenter} 
          zoom={5} 
          scrollWheelZoom={true} 
          style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          {pointsToRender.map((point, index) => (
            <CircleMarker 
              key={index} 
              center={[point.lat, point.lon]}
              radius={getMarkerRadius(point)}
              pathOptions={{ 
                color: getMarkerColor(point), 
                fillColor: getMarkerColor(point), 
                fillOpacity: 0.7 
              }}
            >
              <Popup>
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900 heading-text">
                    {point.name || `Точка ${index + 1}`}
                  </h3>
                  {point.value && (
                    <div className="elegant-text">
                      <Badge variant="outline">Значение: {point.value}</Badge>
                    </div>
                  )}
                  {config?.overlay_type === 'forecast' && point.forecast && (
                    <div className="elegant-text">
                      <Badge className="bg-green-100 text-green-700">
                        Прогноз: {point.forecast}
                      </Badge>
                    </div>
                  )}
                  {config?.overlay_type === 'correlation' && point.correlation !== undefined && (
                    <div className="elegant-text">
                      <Badge className={point.correlation > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}>
                        Корреляция: {point.correlation.toFixed(2)}
                      </Badge>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </CardContent>
    </Card>
  );
}