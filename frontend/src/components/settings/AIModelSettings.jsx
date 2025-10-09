import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Cpu,
  Settings,
  CheckCircle,
  AlertCircle,
  Activity,
  Sliders,
  Gauge,
} from "lucide-react";

const LOCAL_MODULES = [
  {
    id: "forecast",
    name: "Прогнозирование",
    description: "Локальный движок временных рядов с сезонной и трендовой составляющими.",
    recommendedWindow: 30,
  },
  {
    id: "correlation",
    name: "Корреляционный анализ",
    description: "Построение матриц корреляций и отбор сильных связей без сети.",
    recommendedWindow: 50,
  },
  {
    id: "reports",
    name: "Отчётность",
    description: "Генерация сводных PDF отчётов на базе локальных шаблонов.",
    recommendedWindow: 0,
  },
];

const PERFORMANCE_PRESETS = [
  { id: "balanced", label: "Сбалансированный", description: "Оптимальное соотношение скорости и качества." },
  { id: "fast", label: "Быстрый", description: "Минимальные задержки, подходит для черновых расчётов." },
  { id: "accurate", label: "Точный", description: "Максимальная детализация и проверка результатов." },
];

export default function AIModelSettings() {
  const [enabledModules, setEnabledModules] = useState(new Set(LOCAL_MODULES.map((module) => module.id)));
  const [performancePreset, setPerformancePreset] = useState("balanced");
  const [customWindow, setCustomWindow] = useState(45);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationLogs, setCalibrationLogs] = useState([]);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const toggleModule = (id) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCalibration = () => {
    if (isCalibrating) return;
    setIsCalibrating(true);
    setCalibrationProgress(0);
    setCalibrationLogs(["Запуск калибровки локальных алгоритмов..."]);

    const steps = [
      "Анализ исторических метрик и проверка границ значений",
      "Настройка шага сглаживания и порогов корреляции",
      "Валидация отчётных шаблонов и проверка формулировок",
      "Калибровка завершена успешно",
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex += 1;
      setCalibrationProgress((prev) => Math.min(prev + 25, 100));
      setCalibrationLogs((prev) => [...prev, steps[Math.min(stepIndex, steps.length - 1)]]);
      if (stepIndex >= steps.length - 1) {
        clearInterval(interval);
        setIsCalibrating(false);
      }
    }, 600);
  };

  const handlePresetChange = (value) => {
    setPerformancePreset(value);
    setCalibrationLogs((prev) => [
      ...prev,
      `Выбран режим: ${PERFORMANCE_PRESETS.find((preset) => preset.id === value)?.label || value}`,
    ]);
  };

  return (
    <div className="grid gap-6">
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Cpu className="w-5 h-5 text-purple-500" />
            Локальные алгоритмы анализа данных
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-slate-600">
            Включайте и настраивайте модули, которые работают полностью в вашей инфраструктуре. Ни один из алгоритмов не требует подключений к облачным сервисам.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {LOCAL_MODULES.map((module) => (
              <Card key={module.id} className={`border ${enabledModules.has(module.id) ? "border-emerald-300" : "border-slate-200"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-500" />
                    {module.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p>{module.description}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={enabledModules.has(module.id) ? "default" : "outline"} onClick={() => toggleModule(module.id)}>
                      {enabledModules.has(module.id) ? "Включено" : "Выключено"}
                    </Button>
                    <Badge variant="outline">Окно: {module.recommendedWindow || "авто"}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Режим производительности
              </Label>
              <Select value={performancePreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите режим" />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{preset.label}</span>
                        <span className="text-xs text-slate-500">{preset.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700 flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Пользовательское окно сглаживания (дней)
              </Label>
              <Input
                type="number"
                min={7}
                max={180}
                value={customWindow}
                onChange={(event) => setCustomWindow(Number(event.target.value))}
              />
              <p className="text-xs text-slate-500">
                Используется для прогнозов и корреляционного анализа при включённом пользовательском режиме.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Activity className="w-5 h-5 text-blue-500" />
            Калибровка и диагностика
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {isCalibrating ? (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              )}
              <div>
                <p className="font-medium text-slate-800">
                  {isCalibrating ? "Выполняется калибровка" : "Алгоритмы готовы к работе"}
                </p>
                <p className="text-xs text-slate-500">
                  Последние параметры: режим {PERFORMANCE_PRESETS.find((preset) => preset.id === performancePreset)?.label.toLowerCase()} • окно {customWindow} дней
                </p>
              </div>
            </div>
            <Button onClick={handleCalibration} disabled={isCalibrating}>
              {isCalibrating ? "Калибровка..." : "Запустить калибровку"}
            </Button>
          </div>

          <Progress value={calibrationProgress} className="h-2" />

          <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50/60 text-xs text-slate-600">
            {calibrationLogs.length === 0 ? (
              <p>История калибровок появится после запуска процедуры.</p>
            ) : (
              calibrationLogs.map((log, index) => <div key={index}>{log}</div>)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
