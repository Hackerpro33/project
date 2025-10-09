import React, { useEffect, useRef, useState } from "react";
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
  Globe,
  TrendingUp,
  Target,
  Activity
} from "lucide-react";

export default function AIModelSettings() {
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localModels, setLocalModels] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("financial-insights");
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState("1e-5");
  const [batchSize, setBatchSize] = useState(8);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [trainingLogs, setTrainingLogs] = useState([]);

  const downloadIntervalRef = useRef(null);
  const trainingIntervalRef = useRef(null);

  const availableModels = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      provider: 'OpenAI',
      type: 'cloud',
      size: '-',
      status: 'available',
      description: 'Мощная модель для сложных задач анализа'
    },
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1 Turbo',
      provider: 'OpenAI',
      type: 'cloud',
      size: '-',
      status: 'available',
      description: 'Ускоренная версия GPT-4.1 с повышенной точностью ответов'
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'Anthropic',
      type: 'cloud',
      size: '-',
      status: 'available',
      description: 'Флагманская модель с глубоким пониманием контекста'
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

  const fineTuneDatasets = [
    {
      value: "financial-insights",
      label: "Финансовая аналитика",
      description: "Точные прогнозы и оценка рисков",
    },
    {
      value: "customer-support",
      label: "Поддержка клиентов",
      description: "Улучшенные ответы и тон общения",
    },
    {
      value: "legal-analytics",
      label: "Юридический анализ",
      description: "Глубокое понимание договоров и нормативов",
    },
  ];

  const fineTuneResults = {
    "financial-insights": {
      accuracy: 96.4,
      precision: 94.8,
      recall: 95.9,
      latencyReduction: 14,
      improvement: 4.3,
    },
    "customer-support": {
      accuracy: 95.2,
      precision: 93.6,
      recall: 94.1,
      latencyReduction: 18,
      improvement: 3.7,
    },
    "legal-analytics": {
      accuracy: 97.1,
      precision: 95.5,
      recall: 96.2,
      latencyReduction: 11,
      improvement: 4.9,
    },
  };

  const currentModel = availableModels.find((model) => model.id === selectedModel);

  useEffect(() => {
    return () => {
      if (downloadIntervalRef.current) {
        clearInterval(downloadIntervalRef.current);
      }
      if (trainingIntervalRef.current) {
        clearInterval(trainingIntervalRef.current);
      }
    };
  }, []);

  const handleDownloadModel = async (modelId) => {
    setIsDownloading(true);
    setDownloadProgress(0);

    if (downloadIntervalRef.current) {
      clearInterval(downloadIntervalRef.current);
    }

    downloadIntervalRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(downloadIntervalRef.current);
          downloadIntervalRef.current = null;
          setIsDownloading(false);
          setLocalModels((prevModels) => (
            prevModels.includes(modelId) ? prevModels : [...prevModels, modelId]
          ));
          return 100;
        }

        return Math.min(prev + Math.random() * 10, 100);
      });
    }, 500);
  };

  const handleUploadDataset = () => {
    setTrainingLogs((prevLogs) => [
      ...prevLogs,
      "Загружен пользовательский датасет. Он будет учтен при следующем дообучении.",
    ]);
  };

  const handleStartFineTuning = () => {
    if (isTraining) {
      return;
    }

    if (trainingIntervalRef.current) {
      clearInterval(trainingIntervalRef.current);
    }

    const currentDataset = fineTuneDatasets.find((dataset) => dataset.value === selectedDataset);
    const targetMetrics = fineTuneResults[selectedDataset] ?? {
      accuracy: 94.2,
      precision: 92.6,
      recall: 93.1,
      latencyReduction: 8,
      improvement: 2.8,
    };

    setIsTraining(true);
    setTrainingProgress(0);
    setTrainingMetrics(null);
    setTrainingLogs([
      `Запущено дообучение модели ${currentModel ? currentModel.name : selectedModel}.`,
      `Датасет: ${currentDataset ? currentDataset.label : selectedDataset}.`,
      `Эпох: ${epochs}, размер батча: ${batchSize}, lr: ${learningRate}`,
    ]);

    const steps = [
      "Подготовка и очистка данных",
      "Оптимизация гиперпараметров",
      "Основное обучение на расширенном датасете",
      "Контроль качества и финальное тестирование",
    ];
    let stepIndex = 0;

    trainingIntervalRef.current = setInterval(() => {
      setTrainingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(trainingIntervalRef.current);
          trainingIntervalRef.current = null;
          setIsTraining(false);
          setTrainingLogs((prevLogs) => [
            ...prevLogs,
            "Дообучение завершено. Модель обновлена и готова к использованию.",
          ]);
          setTrainingMetrics(targetMetrics);
          return 100;
        }

        const increment = 5 + Math.random() * 8;
        const nextValue = Math.min(prev + increment, 100);

        if (stepIndex < steps.length && nextValue >= (stepIndex + 1) * 25) {
          const stepMessage = steps[stepIndex];
          stepIndex += 1;
          setTrainingLogs((prevLogs) => [...prevLogs, stepMessage]);
        }

        return nextValue;
      });
    }, 700);
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
              return currentModel ? (
                <p className="text-sm text-blue-700">{currentModel.description}</p>
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

      {/* Fine-tuning */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            Дообучение и повышение точности
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Целевой датасет</Label>
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите датасет" />
                  </SelectTrigger>
                  <SelectContent>
                    {fineTuneDatasets.map((dataset) => (
                      <SelectItem key={dataset.value} value={dataset.value}>
                        <span className="flex flex-col gap-0.5">
                          <span className="font-medium">{dataset.label}</span>
                          <span className="text-xs text-slate-500">{dataset.description}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUploadDataset}
                disabled={isTraining}
              >
                <Upload className="w-4 h-4 mr-2" />
                Загрузить свой датасет
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Эпохи</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={epochs}
                  onChange={(event) => setEpochs(Math.max(1, Number(event.target.value) || 1))}
                />
              </div>
              <div className="space-y-2">
                <Label>Размер батча</Label>
                <Input
                  type="number"
                  min="1"
                  max="64"
                  value={batchSize}
                  onChange={(event) => setBatchSize(Math.max(1, Number(event.target.value) || 1))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Скорость обучения</Label>
                <Input
                  type="text"
                  value={learningRate}
                  onChange={(event) => setLearningRate(event.target.value)}
                  placeholder="1e-5"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              Оптимизируем модель
              <span className="ml-1 font-medium">
                {currentModel?.name || selectedModel}
              </span>
              для более точных ответов.
            </div>
            <Button onClick={handleStartFineTuning} disabled={isTraining}>
              <Cpu className="w-4 h-4 mr-2" />
              {isTraining ? "Дообучение..." : "Запустить дообучение"}
            </Button>
          </div>

          {isTraining && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Процесс дообучения...</span>
                <span>{Math.round(trainingProgress)}%</span>
              </div>
              <Progress value={trainingProgress} className="w-full" />
              <p className="text-xs text-slate-500">
                Модель адаптируется под выбранный сценарий и обновляет веса.
              </p>
            </div>
          )}

          {trainingLogs.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-slate-500 uppercase">Ход обучения</Label>
              <ul className="space-y-1 text-sm text-slate-600">
                {trainingLogs.map((log, index) => (
                  <li key={`${log}-${index}`} className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <span>{log}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trainingMetrics && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-emerald-50 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-600">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Точность</span>
                </div>
                <div className="text-lg font-semibold text-emerald-900">
                  {trainingMetrics.accuracy.toFixed(1)}%
                </div>
                <p className="text-xs text-emerald-700">
                  +{trainingMetrics.improvement.toFixed(1)}% к базовой модели
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-600">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Прецизионность</span>
                </div>
                <div className="text-lg font-semibold text-emerald-900">
                  {trainingMetrics.precision.toFixed(1)}%
                </div>
                <p className="text-xs text-emerald-700">Снижение ошибок в сложных запросах</p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-600">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase">Скорость</span>
                </div>
                <div className="text-lg font-semibold text-emerald-900">
                  -{trainingMetrics.latencyReduction}%
                </div>
                <p className="text-xs text-emerald-700">Сокращение времени отклика модели</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>Для максимального эффекта обновляйте датасеты и запускайте дообучение раз в неделю.</span>
          </div>
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
