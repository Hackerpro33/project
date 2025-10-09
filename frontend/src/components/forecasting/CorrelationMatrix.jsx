
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarChart3, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeCorrelation } from "@/utils/localAnalysis";

export default function CorrelationMatrix({ datasets, isLoading, onCorrelationCalculated }) {
    const [selectedDatasets, setSelectedDatasets] = useState([]);
    const [selectedFeatures, setSelectedFeatures] = useState([]);
    const [result, setResult] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);

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

    const getCellColor = (value) => {
        if (value === 1) return "bg-blue-500 text-white";
        const intensity = Math.abs(value);
        if (value > 0) {
            if (intensity > 0.7) return "bg-emerald-500 text-white";
            if (intensity > 0.4) return "bg-emerald-300 text-emerald-900";
            return "bg-emerald-100 text-emerald-700";
        } else {
            if (intensity > 0.7) return "bg-red-500 text-white";
            if (intensity > 0.4) return "bg-red-300 text-red-900";
            return "bg-red-100 text-red-700";
        }
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
                                <table className="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="p-3 border border-slate-200 font-medium">Признак</th>
                                            {result.correlation_matrix.map(row => 
                                                <th key={row.feature} className="p-3 border border-slate-200 text-xs font-medium transform -rotate-45 w-20">
                                                    {row.feature}
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.correlation_matrix.map(row => (
                                            <tr key={row.feature}>
                                                <td className="p-3 border border-slate-200 font-medium bg-slate-50">{row.feature}</td>
                                                {Object.keys(row.correlations).map(key => (
                                                    <td key={key} className={`p-3 border border-slate-200 text-center text-xs font-mono font-bold ${getCellColor(row.correlations[key])}`}>
                                                        {row.correlations[key].toFixed(2)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {result.strongest_correlations && result.strongest_correlations.length > 0 && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <h4 className="font-semibold mb-3 text-blue-900">Наиболее сильные корреляции:</h4>
                                    <div className="space-y-2">
                                        {result.strongest_correlations.map((corr, i) => (
                                            <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="font-medium text-sm">{corr.feature1} ↔ {corr.feature2}</span>
                                                    <span className={`font-bold text-sm px-2 py-1 rounded ${getCellColor(corr.correlation)}`}>
                                                        {corr.correlation.toFixed(3)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-600">{corr.interpretation}</p>
                                            </div>
                                        ))}
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
