import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Calendar,
  BarChart,
  Eye,
  Download,
  Tag,
  Sparkles,
  Users,
} from "lucide-react";
import { format } from "date-fns";

export default function DatasetCard({ dataset, onPreview }) {
  const getColumnTypeColor = (type) => {
    const colors = {
      string: "bg-blue-100 text-blue-700",
      number: "bg-emerald-100 text-emerald-700",
      date: "bg-purple-100 text-purple-700",
      boolean: "bg-orange-100 text-orange-700"
    };
    return colors[type] || "bg-gray-100 text-gray-700";
  };

  const createdDateCandidate = dataset.created_date || dataset.created_at;
  let createdLabel = "—";
  if (createdDateCandidate) {
    const parsed = typeof createdDateCandidate === "number"
      ? new Date(createdDateCandidate * 1000)
      : new Date(createdDateCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      createdLabel = format(parsed, "d MMM yyyy");
    }
  }

  const ownersLabel = Array.isArray(dataset.owners)
    ? dataset.owners.filter(Boolean).slice(0, 2).join(", ")
    : "";
  const extraOwners = Array.isArray(dataset.owners) && dataset.owners.length > 2
    ? dataset.owners.length - 2
    : 0;
  const highlightReasons = Array.isArray(dataset.match_reasons)
    ? dataset.match_reasons.slice(0, 3)
    : [];

  return (
    <Card className="group border-0 bg-white/70 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors break-words">
                {dataset.name}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="w-3 h-3" />
                {createdLabel}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {dataset.dataset_type && (
            <Badge variant="outline" className="text-xs uppercase tracking-wide text-blue-600 border-blue-200">
              {dataset.dataset_type}
            </Badge>
          )}
          {ownersLabel && (
            <Badge variant="outline" className="flex items-center gap-1 text-xs text-slate-600 border-slate-200">
              <Users className="w-3 h-3" />
              {ownersLabel}
              {extraOwners > 0 && (
                <span className="text-[10px] text-slate-400">+{extraOwners}</span>
              )}
            </Badge>
          )}
        </div>

        {dataset.auto_summary ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-700 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-indigo-600">
              <Sparkles className="w-4 h-4" />
              Автоописание
            </div>
            <p className="mt-1 line-clamp-3 text-sm text-indigo-700">{dataset.auto_summary}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-600 line-clamp-3">
            {dataset.description || "Описание отсутствует"}
          </p>
        )}

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <BarChart className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{dataset.row_count || 0} строк</span>
            </div>
            <div className="flex items-center gap-1">
              <Database className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{dataset.columns?.length || 0} колонок</span>
            </div>
          </div>
        </div>

        {dataset.columns && dataset.columns.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Типы столбцов
            </div>
            <div className="flex flex-wrap gap-1">
              {dataset.columns.slice(0, 3).map((column, index) => (
                <Badge 
                  key={index}
                  variant="secondary"
                  className={`text-xs ${getColumnTypeColor(column.type)}`}
                >
                  {column.type}
                </Badge>
              ))}
              {dataset.columns.length > 3 && (
                <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                  +{dataset.columns.length - 3} ещё
                </Badge>
              )}
            </div>
          </div>
        )}

        {dataset.tags && dataset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dataset.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {highlightReasons.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {highlightReasons.map((reason) => (
              <Badge
                key={reason}
                variant="secondary"
                className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                {reason}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPreview(dataset)}
            className="flex-1 gap-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
          >
            <Eye className="w-4 h-4" />
            Просмотр
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
          >
            <Download className="w-4 h-4" />
            Экспорт
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}