import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

import { Dataset } from "@/api/entities";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Loader2,
  Database,
  BarChart3,
  Download,
  Sparkles,
  Calendar,
  Hash,
  Type,
} from "lucide-react";

function formatDate(value) {
  if (!value) {
    return "—";
  }
  const candidate = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(candidate.getTime()) ? "—" : format(candidate, "d MMM yyyy");
}

function normaliseColumns(columns) {
  if (!Array.isArray(columns)) {
    return [];
  }
  return columns.map((column) => ({
    name: column.name || "—",
    type: column.type || column.dtype || "string",
    description: column.description || "",
  }));
}

function deriveIcon(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("int") || normalized.includes("num")) {
    return Hash;
  }
  if (normalized.includes("date") || normalized.includes("time")) {
    return Calendar;
  }
  return Type;
}

export default function DatasetPreview({ dataset, onClose }) {
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const sampleRows = useMemo(() => {
    if (!Array.isArray(dataset?.sample_data)) {
      return [];
    }
    return dataset.sample_data.slice(0, 10);
  }, [dataset]);

  const profileColumns = useMemo(() => normaliseColumns(profile?.columns), [profile]);
  const datasetColumns = useMemo(() => normaliseColumns(dataset?.columns), [dataset]);

  useEffect(() => {
    if (!dataset?.file_url) {
      setProfile(null);
      setProfileError("");
      return;
    }

    let cancelled = false;
    setIsProfileLoading(true);
    setProfileError("");

    Dataset.profile({ file_url: dataset.file_url })
      .then((response) => {
        if (!cancelled) {
          setProfile(response);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Не удалось получить паспорт набора данных", error);
          setProfile(null);
          setProfileError("Не удалось построить паспорт набора данных.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataset?.file_url]);

  const createdLabel = dataset?.created_date || dataset?.created_at
    ? formatDate(dataset.created_date || dataset.created_at)
    : "—";

  const columnsForView = profileColumns.length > 0 ? profileColumns : datasetColumns;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[80vh] overflow-hidden border-0 bg-white/95 backdrop-blur-xl">
        <DialogHeader className="space-y-2 border-b border-slate-200 pb-4">
          <DialogTitle className="text-2xl font-bold text-slate-900">{dataset?.name || "Набор данных"}</DialogTitle>
          <DialogDescription className="text-slate-600">
            {dataset?.description || "Описание набора данных недоступно."}
          </DialogDescription>
          {dataset?.auto_summary && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-700">
              <div className="flex items-center gap-2 font-semibold text-indigo-600">
                <Sparkles className="h-4 w-4" /> Автоматическое резюме
              </div>
              <p className="mt-1 leading-relaxed">{dataset.auto_summary}</p>
            </div>
          )}
        </DialogHeader>

        <div className="flex h-full flex-col gap-6 overflow-hidden">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
              <div className="text-sm text-blue-700">Строк</div>
              <div className="text-2xl font-semibold text-blue-900">{dataset?.row_count ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
              <div className="text-sm text-emerald-700">Колонок</div>
              <div className="text-2xl font-semibold text-emerald-900">{dataset?.columns?.length ?? 0}</div>
            </div>
            <div className="rounded-xl border border-purple-100 bg-purple-50/80 p-4">
              <div className="text-sm text-purple-700">Создан</div>
              <div className="text-2xl font-semibold text-purple-900">{createdLabel}</div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/80 p-4">
              <div className="text-sm text-orange-700">Тегов</div>
              <div className="text-2xl font-semibold text-orange-900">{dataset?.tags?.length ?? 0}</div>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[2fr,1fr]">
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Database className="h-4 w-4" /> Пример данных
                </div>
                <span className="text-xs text-slate-500">Первые {sampleRows.length || 0} строк</span>
              </div>
              <div className="flex-1 overflow-hidden">
                {sampleRows.length > 0 ? (
                  <ScrollArea className="h-full">
                    <Table className="min-w-full text-sm">
                      <TableHeader>
                        <TableRow>
                          {Object.keys(sampleRows[0]).map((key) => (
                            <TableHead key={key} className="bg-slate-50 text-slate-600">
                              {key}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sampleRows.map((row, rowIndex) => (
                          <TableRow key={rowIndex} className="hover:bg-slate-50">
                            {Object.keys(sampleRows[0]).map((key) => (
                              <TableCell key={key} className="align-top text-slate-700">
                                {String(row[key] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-12 text-sm text-slate-500">
                    Пример данных недоступен.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">Колонки</div>
                <div className="mt-3 space-y-2">
                  {columnsForView.slice(0, 8).map((column) => {
                    const Icon = deriveIcon(column.type);
                    return (
                      <div
                        key={column.name}
                        className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-900">{column.name}</div>
                          {column.description && (
                            <div className="text-xs text-slate-500">{column.description}</div>
                          )}
                        </div>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Icon className="h-3 w-3" />
                          {column.type}
                        </Badge>
                      </div>
                    );
                  })}
                  {columnsForView.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                      Структура колонок недоступна.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-800">Информация</div>
                {isProfileLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Формируем паспорт данных…
                  </div>
                ) : profileError ? (
                  <Alert variant="destructive" className="mt-2">
                    <AlertDescription>{profileError}</AlertDescription>
                  </Alert>
                ) : profile?.row_count ? (
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <div>Обнаружено строк: {profile.row_count.toLocaleString()}</div>
                    {profile.last_updated && (
                      <div>Последнее обновление: {formatDate(profile.last_updated)}</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-500">Паспорт данных не загружен.</div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="flex flex-wrap gap-2">
              {(dataset?.tags || []).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {(!dataset?.tags || dataset.tags.length === 0) && (
                <span className="text-sm text-slate-500">Теги не назначены.</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {dataset?.file_url && (
                <Button asChild variant="outline" className="gap-2">
                  <a href={dataset.file_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> Скачать файл
                  </a>
                </Button>
              )}
              <Link to={createPageUrl("Charts")}>
                <Button className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
                  <BarChart3 className="h-4 w-4" /> Создать визуализацию
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
