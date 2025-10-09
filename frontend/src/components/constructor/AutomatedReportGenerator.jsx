import React, { useState, useEffect } from 'react';
import { buildProjectReport } from "@/utils/localAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles, BrainCircuit, Share2, BarChart3, TrendingUp, AlertTriangle, FileText } from 'lucide-react';
import PDFExporter from '../utils/PDFExporter';

export default function AutomatedReportGenerator({ datasets, visualizations, onClose }) {
    const [report, setReport] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        generateReport();
    }, []);

    const generateReport = async () => {
        setIsLoading(true);

        const datasetsSummary = datasets.map(d => ({ name: d.name, columns: d.columns.length, rows: d.row_count }));
        const visualizationsSummary = visualizations.map(v => ({ title: v.title, type: v.type, dataset: datasets.find(d => d.id === v.dataset_id)?.name }));

        try {
            const result = buildProjectReport({ datasets, visualizations });
            setReport(result);
        } catch (error) {
            console.error("Ошибка генерации отчета:", error);
            setReport({ executive_summary: "Не удалось сформировать локальный отчет." });
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
            <div className="max-w-4xl mx-auto space-y-8" id="ai-report-content">
                <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200">
                        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                            <Sparkles className="w-6 h-6 text-purple-500" />
                            Сводный локальный отчёт
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <PDFExporter title="Сводный_Локальный_Отчет" elementId="ai-report-content" />
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        {isLoading ? (
                            <div className="space-y-6">
                                <Skeleton className="h-8 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-5/6" />
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                            </div>
                        ) : (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-3 heading-text">Краткое резюме</h3>
                                    <p className="text-slate-700 elegant-text">{report.executive_summary}</p>
                                </div>
                                <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                                    <h3 className="text-lg font-bold text-blue-900 mb-3 heading-text">Ключевые выводы</h3>
                                    <ul className="list-disc list-inside space-y-2 text-blue-800 elegant-text">
                                        {report.key_insights?.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                                <div className="p-6 bg-red-50 rounded-xl border border-red-200">
                                    <h3 className="text-lg font-bold text-red-900 mb-3 heading-text flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        Зоны риска
                                    </h3>
                                    <div className="space-y-3">
                                        {report.risk_zones?.map((item, i) => (
                                            <div key={i} className="p-3 bg-white rounded-lg">
                                                <p className="font-semibold text-red-800">{item.area}</p>
                                                <p className="text-sm text-red-700 elegant-text">{item.risk_description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200">
                                    <h3 className="text-lg font-bold text-emerald-900 mb-3 heading-text">Рекомендации</h3>
                                    <ul className="list-disc list-inside space-y-2 text-emerald-800 elegant-text">
                                        {report.recommendations?.map((item, i) => <li key={i}>{item}</li>)}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}