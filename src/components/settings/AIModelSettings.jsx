import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Brain, 
  Download, 
  Upload, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  Cpu,
  HardDrive,
  Zap,
  Globe
} from "lucide-react";

export default function AIModelSettings() {
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localModels, setLocalModels] = useState([]);

  const availableModels = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'OpenAI',
      type: 'cloud',
      size: '-',
      status: 'available',
      description: 'Самая мощная модель для сложных задач анализа'
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      type: 'cloud',
      size: '-',
      status: 'available',
      description: 'Быстрая модель для большинства задач'
    },
    {
      id: 'llama-2-7b',
      name: 'Llama 2 7B',
      provider: 'Meta',
      type: 'local',
      size: '3.8 GB',
      status: 'not_downloaded',
      description: 'Эффективная локальная модель'
    },
    {
      id: 'llama-2-13b',
      name: 'Llama 2 13B',
      provider: 'Meta',
      type: 'local',
      size: '7.2 GB',
      status: 'not_downloaded',
      description: 'Более мощная локальная модель'
    },
    {
      id: 'code-llama-7b',
      name: 'Code Llama 7B',
      provider: 'Meta',
      type: 'local',
      size: '4.1 GB',
      status: 'not_downloaded',
      description: 'Специализированная модель для кода'
    }
  ];

  const handleDownloadModel = async (modelId) => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    // Симуляция загрузки модели
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          setLocalModels(prev => [...prev, modelId]);
          return 100;
        }
        return prev + Math.random() * 10;
      });
    }, 500);
  };

  const getModelIcon = (model) => {
    if (model.type === 'cloud') return <Globe className="w-4 h-4" />;
    if (model.status === 'downloaded') return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <HardDrive className="w-4 h-4" />;
  };

  const getStatusBadge = (model) => {
    switch (model.status) {
      case 'available':
        return <Badge className="bg-green-100 text-green-700">Доступна</Badge>;
      case 'downloaded':
        return <Badge className="bg-blue-100 text-blue-700">Загружена</Badge>;
      case 'not_downloaded':
        return <Badge variant="outline">Не загружена</Badge>;
      default:
        return <Badge variant="secondary">Неизвестно</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            Текущая AI модель
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Выберите активную модель</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите модель" />
              </SelectTrigger>
              <SelectContent>
                {availableModels
                  .filter(m => m.status === 'available' || localModels.includes(m.id))
                  .map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center gap-2">
                        {getModelIcon(model)}
                        <span>{model.name}</span>
                        <Badge variant="outline" className="text-xs">{model.type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">Информация о выбранной модели</span>
            </div>
            {(() => {
              const current = availableModels.find(m => m.id === selectedModel);
              return current ? (
                <p className="text-sm text-blue-700">{current.description}</p>
              ) : (
                <p className="text-sm text-blue-700">Модель не найдена</p>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Available Models */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-500" />
            Доступные модели
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {availableModels.map(model => (
              <div key={model.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  {getModelIcon(model)}
                  <div>
                    <div className="font-medium">{model.name}</div>
                    <div className="text-sm text-slate-500">
                      {model.provider} • {model.type === 'local' ? `${model.size}` : 'Облачная'} • {model.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(model)}
                  {model.type === 'local' && model.status === 'not_downloaded' && (
                    <Button 
                      size="sm" 
                      onClick={() => handleDownloadModel(model.id)}
                      disabled={isDownloading}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Скачать
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {isDownloading && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Загрузка модели...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <Progress value={downloadProgress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Performance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-500" />
            Настройки производительности
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Максимальная длина ответа</Label>
              <Input type="number" defaultValue="2048" placeholder="Токены" />
            </div>
            <div className="space-y-2">
              <Label>Температура (креативность)</Label>
              <Input type="number" step="0.1" min="0" max="2" defaultValue="0.7" />
            </div>
            <div className="space-y-2">
              <Label>Тайм-аут запроса (сек)</Label>
              <Input type="number" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label>Количество потоков (локальные модели)</Label>
              <Input type="number" defaultValue="4" min="1" max="16" />
            </div>
          </div>
          
          <Button className="w-full">
            <Settings className="w-4 h-4 mr-2" />
            Сохранить настройки
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}