
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Visualization } from "@/api/entities";
import {
  ArrowLeft,
  Save,
  Eye,
  Settings,
  BarChart3,
  LineChart as LineChartIcon, // Renamed to avoid conflict with recharts LineChart
  ScatterChart as ScatterChartIcon, // Renamed to avoid conflict with recharts ScatterChart (though not directly imported)
  TrendingUp
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ChartBuilder({ chartType, datasets, onClose, onSave }) {
  const [config, setConfig] = useState({
    title: '',
    dataset_id: '',
    x_axis: '',
    y_axis: '',
    color: '#3B82F6'
  });

  const [selectedDataset, setSelectedDataset] = useState(null);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ ...prev, dataset_id: datasetId }));
  };

  const handleSave = async () => {
    if (!config.title || !config.dataset_id || !config.x_axis || !config.y_axis) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await Visualization.create({
        title: config.title,
        type: chartType,
        dataset_id: config.dataset_id,
        x_axis: config.x_axis,
        y_axis: config.y_axis,
        config: {
          color: config.color
        }
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving visualization:', error);
    }
  };

  const getChartIcon = () => {
    const icons = {
      line: LineChartIcon,
      bar: BarChart3,
      scatter: ScatterChartIcon,
      area: TrendingUp
    };
    return icons[chartType] || BarChart3;
  };

  const ChartIcon = getChartIcon();

  // Sample data for preview
  const sampleData = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 600 },
    { name: 'Apr', value: 800 },
    { name: 'May', value: 700 },
    { name: 'Jun', value: 900 }
  ];

  const renderChart = () => {
    const chartProps = {
      width: '100%',
      height: 300,
      data: sampleData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={config.color} strokeWidth={3} />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill={config.color} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="value" stroke={config.color} fill={config.color} fillOpacity={0.3} />
          </AreaChart>
        );
      case 'scatter': // Added scatter chart rendering
        return (
          <ScatterChart {...chartProps}>
            <CartesianGrid />
            <XAxis type="number" dataKey="value" name="Value" />
            <YAxis type="category" dataKey="name" name="Month" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name="Sample Data" data={sampleData} fill={config.color} />
          </ScatterChart>
        );
      default:
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={config.color} strokeWidth={3} />
          </LineChart>
        );
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <ChartIcon className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-slate-900">
                  {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart Builder
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Chart Title</Label>
            <Input
              id="title"
              placeholder="Enter chart title"
              value={config.title}
              onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset">Dataset</Label>
            <Select onValueChange={handleDatasetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map(dataset => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDataset && selectedDataset.columns && (
            <>
              <div className="space-y-2">
                <Label htmlFor="x-axis">X-Axis</Label>
                <Select onValueChange={(value) => setConfig(prev => ({ ...prev, x_axis: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select X-axis column" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedDataset.columns.map(column => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name} ({column.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="y-axis">Y-Axis</Label>
                <Select onValueChange={(value) => setConfig(prev => ({ ...prev, y_axis: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Y-axis column" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedDataset.columns.filter(col => col.type === 'number').map(column => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name} ({column.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">Chart Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={config.color}
                onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))}
                className="w-16 h-10"
              />
              <Input
                value={config.color}
                onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))}
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-6">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 gap-2">
              <Save className="w-4 h-4" />
              Save Chart
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Eye className="w-5 h-5 text-purple-500" />
            Live Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900">
                {config.title || `Sample ${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`}
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
            <div className="text-center text-sm text-slate-500">
              This is a preview with sample data. Your actual chart will use data from the selected dataset.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
