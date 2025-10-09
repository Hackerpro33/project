
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarChart3, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeCorrelation } from "@/utils/localAnalysis";

const getCorrelationDescriptor = (value) => {
    const absValue = Math.abs(value);

    if (absValue >= 0.9) return "Практически линейная зависимость";
    if (absValue >= 0.7) return "Сильная взаимосвязь";
    if (absValue >= 0.5) return "Умеренная взаимосвязь";
    if (absValue >= 0.3) return "Слабая взаимосвязь";
    if (absValue > 0) return "Очень слабая взаимосвязь";
    return "Нет корреляции";
};

const getCellPresentation = (value) => {
    const absValue = Math.min(Math.abs(value), 1);
    const hue = value >= 0 ? 160 : 0; // зеленый для положительной, красный для отрицательной
    const saturation = 75;
    const minLightness = 32;
    const maxLightness = 94;
    const lightness = maxLightness - (absValue * (maxLightness - minLightness));
    const backgroundColor = `hsl(${hue} ${saturation}% ${lightness}%)`;
    const textColor = absValue >= 0.6 ? "#fff" : "#0f172a";

    return {
        backgroundColor,
        color: textColor,
        descriptor: getCorrelationDescriptor(value),
    };
};

export default function CorrelationMatrix({ datasets, isLoading, onCorrelationCalculated }) {
    const [selectedDatasets, setSelectedDatasets] = useState([]);
    const [selectedFeatures, setSelectedFeatures] = useState([]);
    const [result, setResult] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [hoveredCell, setHoveredCell] = useState(null);

    const handleDatasetToggle = (datasetId) => {
      setSelectedDatasets(prev => 
        prev.includes(datasetId) 
          ? prev.filter(id => id !== datasetId)
          : [...prev, datasetId]
      );
      setSelectedFeatures([]);
      setResult(null);
    };

    const handleFeatureToggle = (featureId) => {
        setSelectedFeatures(prev =>
            prev.includes(featureId)
                ? prev.filter(f => f !== featureId)
                : [...prev, featureId]
        );
    };

    const handleCalculate = async () => {
        if (selectedFeatures.length < 2) {
            alert("Пожалуйста, выберите как минимум два числовых признака для анализа.");
            return;
        }
        setIsCalculating(true);
        setResult(null);
        try {
            const featureMap = selectedFeatures
              .map((featureId) => {
                const [datasetId, columnName] = featureId.split("::");
                const dataset = datasets.find((d) => d.id === datasetId);
                if (!dataset) return null;
                return {
                    label: `${dataset.name} > ${columnName}`,
                    values: (dataset.sample_data || []).map((row) => row?.[columnName])
                };
              })
              .filter(Boolean);

            const response = analyzeCorrelation({ features: featureMap });
            setResult(response);
            if (onCorrelationCalculated) {
              onCorrelationCalculated(response);
            }
        } catch (error) {
            console.error("Ошибка расчета корреляции:", error);
        }
        setIsCalculating(false);
    };

    const availableFeatures = datasets
      .filter(d => selectedDatasets.includes(d.id))
      .flatMap(d =>
        (d.columns || [])
          .filter(c => c.type === 'number')
          .map(c => ({
            id: `${d.id}::${c.name}`,
            label: `${d.name} > ${c.name}`,
          }))
      );

    return (
        <div className="grid lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Настройка матрицы
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Выберите наборы данных</Label>
                        <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
                            {datasets.map(d => (
                                <div key={d.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`ds-${d.id}`}
                                        checked={selectedDatasets.includes(d.id)}
                                        onCheckedChange={() => handleDatasetToggle(d.id)}
                                    />
                                    <Label htmlFor={`ds-${d.id}`}>{d.name}</Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selectedDatasets.length > 0 && (
                        <div className="space-y-2">
                            <Label>Выберите признаки для анализа</Label>
                            <div className="space-y-2 p-3 border rounded-lg max-h-60 overflow-y-auto">
                                {availableFeatures.map(feature => (
                                    <div key={feature.id} className="flex items-center gap-2">
                                        <Checkbox
                                            id={feature.id}
                                            checked={selectedFeatures.includes(feature.id)}
                                            onCheckedChange={() => handleFeatureToggle(feature.id)}
                                        />
                                        <Label htmlFor={feature.id} className="text-sm">{feature.label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Button onClick={handleCalculate} disabled={isCalculating || selectedFeatures.length < 2} className="w-full gap-2">
                        {isCalculating ? "Рассчитываем..." : "Рассчитать корреляцию"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        Корреляционный анализ (локальный расчёт)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isCalculating && <Skeleton className="w-full h-64" />}
                    {!isCalculating && !result && (
                        <div className="text-center py-16 text-slate-500">Выберите данные и признаки для расчета.</div>
                    )}
                    {result && (
                        <div className="space-y-6">
                            <div className="overflow-x-auto">
                                <TooltipProvider delayDuration={150}>
                                    <table className="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="p-3 border border-slate-200 font-medium align-bottom bg-white/80 sticky left-0 backdrop-blur-sm">Признак</th>
                                                {result.correlation_matrix.map(row => (
                                                    <th
                                                        key={row.feature}
                                                        className="p-3 border border-slate-200 text-[11px] font-semibold text-slate-600 align-bottom"
                                                    >
                                                        <div className="rotate-[-35deg] origin-left whitespace-nowrap">{row.feature}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.correlation_matrix.map(row => (
                                                <tr key={row.feature} className="relative">
                                                    <td className="p-3 border border-slate-200 font-medium bg-slate-50 sticky left-0 backdrop-blur-sm">
                                                        {row.feature}
                                                    </td>
                                                    {Object.keys(row.correlations).map(key => {
                                                        const value = row.correlations[key];
                                                        const { backgroundColor, color, descriptor } = getCellPresentation(value);
                                                        const isHighlighted = hoveredCell && (hoveredCell.row === row.feature || hoveredCell.column === key);

                                                        return (
                                                            <Tooltip key={key}>
                                                                <TooltipTrigger asChild>
                                                                    <td
                                                                        onMouseEnter={() => setHoveredCell({ row: row.feature, column: key })}
                                                                        onMouseLeave={() => setHoveredCell(null)}
                                                                        className={`p-3 border border-slate-200 text-center text-xs font-semibold font-mono transition-shadow duration-200 ${isHighlighted ? "ring-2 ring-indigo-400 shadow-lg" : "shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"}`}
                                                                        style={{ backgroundColor, color }}
                                                                    >
                                                                        {value.toFixed(2)}
                                                                    </td>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                                                    <div className="font-semibold text-slate-900 mb-1">{row.feature} ↔ {key}</div>
                                                                    <p className="text-slate-600">{descriptor}</p>
                                                                    <p className="text-slate-500 mt-1">Коэффициент: {value.toFixed(3)}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </TooltipProvider>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-[auto_1fr] bg-white/60 border border-slate-200 rounded-lg p-4">
                                <div className="text-sm font-semibold text-slate-700">Легенда</div>
                                <div className="space-y-2">
                                    <div className="h-3 w-full bg-gradient-to-r from-red-200 via-slate-100 to-emerald-200 rounded-full relative">
                                        <span className="absolute left-0 -top-5 text-[10px] uppercase tracking-wide text-slate-500">-1</span>
                                        <span className="absolute left-1/2 -translate-x-1/2 -top-5 text-[10px] uppercase tracking-wide text-slate-500">0</span>
                                        <span className="absolute right-0 -top-5 text-[10px] uppercase tracking-wide text-slate-500">+1</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                                        {[
                                            { label: "Практически линейная", color: "bg-emerald-600 text-white" },
                                            { label: "Сильная", color: "bg-emerald-300 text-emerald-900" },
                                            { label: "Умеренная", color: "bg-emerald-100 text-emerald-700" },
                                            { label: "Слабая/нет", color: "bg-slate-100 text-slate-600" },
                                            { label: "Сильная отрицательная", color: "bg-red-300 text-red-900" },
                                            { label: "Практически противоположная", color: "bg-red-500 text-white" }
                                        ].map(item => (
                                            <span key={item.label} className={`px-2 py-1 rounded-full font-medium ${item.color}`}>
                                                {item.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            {result.strongest_correlations && result.strongest_correlations.length > 0 && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <h4 className="font-semibold mb-3 text-blue-900">Наиболее сильные корреляции:</h4>
                                    <div className="space-y-2">
                                        {result.strongest_correlations.map((corr, i) => {
                                            const { backgroundColor, color } = getCellPresentation(corr.correlation);
                                            return (
                                                <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-medium text-sm">{corr.feature1} ↔ {corr.feature2}</span>
                                                        <span
                                                            className="font-bold text-sm px-2 py-1 rounded shadow-sm"
                                                            style={{ backgroundColor, color }}
                                                        >
                                                            {corr.correlation.toFixed(3)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600">{corr.interpretation}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            
                            <div className="bg-slate-50 rounded-lg p-4">
                                <h4 className="font-semibold mb-3 text-slate-900">Ключевые выводы:</h4>
                                <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
                                    {result.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                                </ul>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
