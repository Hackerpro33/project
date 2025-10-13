import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageContainer from "@/components/layout/PageContainer";
import {
  Dataset,
  DatasetVersions as DatasetVersionsApi,
  getDatasets,
} from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowClockwise,
  Clock,
  Database,
  Diff,
  FileDiff,
  History,
  Plus,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

function VersionSummaryCard({ version, isActive, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(version)}
      className={`text-left rounded-xl border p-4 transition-colors w-full ${
        isActive
          ? "border-blue-400 bg-blue-50/60"
          : "border-slate-200 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          <History className="w-4 h-4" />
          Версия {version.version_number}
        </div>
        <Badge variant="secondary" className="bg-slate-100 text-slate-600">
          {format(new Date(version.created_date), "d MMM yyyy, HH:mm", { locale: ru })}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-600">
        <div className="rounded-lg bg-white/80 border border-slate-200/60 p-2">
          <div className="font-semibold text-slate-700">{version.row_count}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">строк</div>
        </div>
        <div className="rounded-lg bg-white/80 border border-slate-200/60 p-2">
          <div className="font-semibold text-slate-700">
            {version.change_summary?.rows_added ?? 0}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">добавлено</div>
        </div>
        <div className="rounded-lg bg-white/80 border border-slate-200/60 p-2">
          <div className="font-semibold text-slate-700">
            {version.change_summary?.rows_removed ?? 0}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">удалено</div>
        </div>
      </div>
      {version.notes && (
        <p className="mt-3 text-xs text-slate-500 line-clamp-2">{version.notes}</p>
      )}
      {version.author && (
        <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
          Автор: {version.author}
        </p>
      )}
    </button>
  );
}

function MetricsDeltaTable({ metricsDelta }) {
  const entries = useMemo(() => Object.entries(metricsDelta || {}), [metricsDelta]);
  if (!entries.length) {
    return (
      <p className="text-sm text-slate-500">
        Изменений в числовых метриках не обнаружено.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="grid grid-cols-5 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
        <div className="px-3 py-2">Метрика</div>
        <div className="px-3 py-2 text-right">Δ Count</div>
        <div className="px-3 py-2 text-right">Δ Sum</div>
        <div className="px-3 py-2 text-right">Δ Avg</div>
        <div className="px-3 py-2 text-right">Δ Max</div>
      </div>
      {entries.map(([metric, delta]) => (
        <div
          key={metric}
          className="grid grid-cols-5 border-t border-slate-100 text-sm text-slate-600"
        >
          <div className="px-3 py-2 font-medium text-slate-700">{metric}</div>
          <div className="px-3 py-2 text-right">{delta.count?.toFixed?.(2) ?? delta.count}</div>
          <div className="px-3 py-2 text-right">{delta.sum?.toFixed?.(2) ?? delta.sum}</div>
          <div className="px-3 py-2 text-right">{delta.avg?.toFixed?.(2) ?? delta.avg}</div>
          <div className="px-3 py-2 text-right">{delta.max?.toFixed?.(2) ?? delta.max}</div>
        </div>
      ))}
    </div>
  );
}

function ChangesList({ title, icon: Icon, rows, emptyText }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-slate-700">
        <Icon className="w-4 h-4 text-blue-500" />
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <pre
              key={index}
              className="text-xs leading-5 rounded-lg bg-slate-900/90 text-slate-100 p-3 overflow-x-auto"
            >
              {JSON.stringify(row, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

const DATASETS_QUERY_KEY = ["datasets", "ordered", "-created_at"];
const datasetVersionsKey = (datasetId) => ["dataset-versions", datasetId];
const datasetDiffKey = (datasetId, currentId, compareId) => [
  "dataset-diff",
  datasetId,
  currentId,
  compareId,
];

export default function DatasetVersions() {
  const queryClient = useQueryClient();
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [currentVersionId, setCurrentVersionId] = useState(null);
  const [compareWithId, setCompareWithId] = useState(null);
  const [error, setError] = useState(null);
  const [restoreMessage, setRestoreMessage] = useState(null);

  const {
    data: datasets = [],
    isLoading: isLoadingDatasets,
    error: datasetsError,
  } = useQuery({
    queryKey: DATASETS_QUERY_KEY,
    queryFn: async () => {
      const items = await getDatasets({ orderBy: "-created_at" });
      return Array.isArray(items) ? items : [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (datasetsError) {
      console.error("Не удалось загрузить наборы данных", datasetsError);
      setError("Не удалось загрузить список наборов данных");
    }
  }, [datasetsError]);

  useEffect(() => {
    if (datasets.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  useEffect(() => {
    setRestoreMessage(null);
    setError(null);
    setCurrentVersionId(null);
    setCompareWithId(null);
  }, [selectedDatasetId]);

  const selectedDataset = selectedDatasetId
    ? datasets.find((item) => item.id === selectedDatasetId) ?? null
    : null;

  const {
    data: versions = [],
    isLoading: isLoadingVersions,
    error: versionsError,
  } = useQuery({
    queryKey: datasetVersionsKey(selectedDatasetId),
    enabled: Boolean(selectedDatasetId),
    queryFn: async () => {
      const list = await DatasetVersionsApi.list(selectedDatasetId);
      return Array.isArray(list) ? list : [];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (versionsError) {
      console.error("Ошибка загрузки версий", versionsError);
      setError("Не удалось загрузить версии выбранного набора");
    }
  }, [versionsError]);

  useEffect(() => {
    if (!selectedDatasetId) {
      return;
    }

    if (!versions.length) {
      setCurrentVersionId(null);
      setCompareWithId(null);
      return;
    }

    const nextCurrentId = versions.some((item) => item.id === currentVersionId)
      ? currentVersionId
      : versions[0].id;

    setCurrentVersionId((prev) => (prev === nextCurrentId ? prev : nextCurrentId));

    if (versions.length < 2) {
      setCompareWithId(null);
      return;
    }

    setCompareWithId((prev) => {
      if (
        prev &&
        prev !== nextCurrentId &&
        versions.some((item) => item.id === prev)
      ) {
        return prev;
      }
      const fallback = versions.find((item) => item.id !== nextCurrentId);
      return fallback ? fallback.id : null;
    });
  }, [versions, selectedDatasetId, currentVersionId]);

  const {
    data: diff = null,
    isLoading: isLoadingDiff,
    error: diffError,
  } = useQuery({
    queryKey: datasetDiffKey(
      selectedDatasetId,
      currentVersionId,
      compareWithId
    ),
    enabled: Boolean(selectedDatasetId && currentVersionId && compareWithId),
    queryFn: async () => {
      if (!selectedDatasetId || !currentVersionId || !compareWithId) {
        return null;
      }
      return DatasetVersionsApi.diff(
        selectedDatasetId,
        currentVersionId,
        compareWithId
      );
    },
  });

  useEffect(() => {
    if (diffError) {
      console.error("Не удалось получить diff версий", diffError);
      setError("Ошибка при расчёте различий между версиями");
    }
  }, [diffError]);

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDatasetId) {
        throw new Error("datasetId is required");
      }
      return DatasetVersionsApi.create(selectedDatasetId, {
        notes: "Снимок создан вручную из интерфейса",
        author: "web-user",
      });
    },
    onSuccess: () => {
      if (selectedDatasetId) {
        queryClient.invalidateQueries({
          queryKey: datasetVersionsKey(selectedDatasetId),
        });
        queryClient.invalidateQueries({
          queryKey: ["dataset-diff", selectedDatasetId],
        });
      }
      setRestoreMessage(null);
    },
    onError: (err) => {
      console.error("Не удалось создать снимок", err);
      setError("Не удалось создать новую версию. Попробуйте позже.");
    },
  });

  const restoreVersionMutation = useMutation({
    mutationFn: async ({ versionId }) => {
      if (!selectedDatasetId) {
        throw new Error("datasetId is required");
      }
      await DatasetVersionsApi.restore(selectedDatasetId, versionId);
      const refreshedDataset = await Dataset.get(selectedDatasetId);
      return { refreshedDataset };
    },
    onSuccess: ({ refreshedDataset }, variables) => {
      queryClient.setQueryData(DATASETS_QUERY_KEY, (current) => {
        if (!Array.isArray(current)) {
          return current;
        }
        const next = current.map((item) =>
          item.id === refreshedDataset.id ? refreshedDataset : item
        );
        if (next.some((item) => item.id === refreshedDataset.id)) {
          return next;
        }
        return [...next, refreshedDataset];
      });

      if (selectedDatasetId) {
        queryClient.invalidateQueries({
          queryKey: datasetVersionsKey(selectedDatasetId),
        });
        queryClient.invalidateQueries({
          queryKey: ["dataset-diff", selectedDatasetId],
        });
      }

      setRestoreMessage(
        `Данные набора обновлены до версии ${variables.versionNumber}.`
      );
    },
    onError: (err) => {
      console.error("Не удалось восстановить версию", err);
      setError("Не удалось восстановить выбранную версию. Попробуйте позже.");
    },
  });

  const handleCreateSnapshot = () => {
    if (!selectedDatasetId) {
      return;
    }
    setError(null);
    setRestoreMessage(null);
    createSnapshotMutation.mutate();
  };

  const handleDatasetChange = (value) => {
    setSelectedDatasetId(value);
    setError(null);
    setRestoreMessage(null);
  };

  const currentVersion = versions.find((item) => item.id === currentVersionId) || null;
  const compareVersion = versions.find((item) => item.id === compareWithId) || null;

  const handleRestoreVersion = () => {
    if (!selectedDataset || !currentVersion) {
      return;
    }

    setError(null);
    setRestoreMessage(null);
    restoreVersionMutation.mutate({
      versionId: currentVersion.id,
      versionNumber: currentVersion.version_number,
    });
  };

  const isCreatingSnapshot = createSnapshotMutation.isPending;
  const isRestoring = restoreVersionMutation.isPending;

  return (
    <PageContainer className="space-y-8">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
          Сравнение версий наборов данных
        </h1>
        <p className="text-slate-600 text-lg max-w-2xl mx-auto">
          Отслеживайте изменения структуры, строк и ключевых метрик. Снимайте версии и получайте автообновляемое резюме различий.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Database className="w-5 h-5 text-blue-500" />
              Наборы данных
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {isLoadingDatasets ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Select
                value={selectedDataset?.id || ""}
                onValueChange={handleDatasetChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите набор данных" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              onClick={handleCreateSnapshot}
              disabled={!selectedDataset || isCreatingSnapshot}
              className="w-full gap-2"
            >
              {isCreatingSnapshot ? (
                <ArrowClockwise className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Создать снимок версии
            </Button>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Доступные версии
              </h3>
              {isLoadingVersions ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 w-full" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  У набора пока нет сохранённых версий. Создайте первый снимок, чтобы начать историю изменений.
                </p>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <VersionSummaryCard
                      key={version.id}
                      version={version}
                      isActive={version.id === currentVersionId}
                      onSelect={(item) => setCurrentVersionId(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <FileDiff className="w-5 h-5 text-purple-500" />
              Сравнение версий
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {restoreMessage && (
              <Alert className="bg-emerald-50 border-emerald-200 text-emerald-700">
                <AlertDescription>{restoreMessage}</AlertDescription>
              </Alert>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Текущая версия
                </label>
                <Select
                  value={currentVersionId || ""}
                  onValueChange={setCurrentVersionId}
                  disabled={versions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите версию" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        Версия {version.version_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Сравнить с версией
                </label>
                <Select
                  value={compareWithId || ""}
                  onValueChange={setCompareWithId}
                  disabled={versions.length < 2}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите версию" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions
                      .filter((version) => version.id !== currentVersionId)
                      .map((version) => (
                        <SelectItem key={version.id} value={version.id}>
                          Версия {version.version_number}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                variant="outline"
                className="gap-2"
                disabled={!currentVersion || isRestoring}
                onClick={handleRestoreVersion}
              >
                {isRestoring ? (
                  <ArrowClockwise className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Восстановить версию в данных
              </Button>
              {compareVersion && (
                <p className="text-xs text-slate-500">
                  Сравнивается с версией {compareVersion.version_number}.
                </p>
              )}
            </div>

            {!currentVersionId || !compareWithId ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                Выберите две версии, чтобы увидеть различия.
              </div>
            ) : isLoadingDiff ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : diff ? (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="border border-blue-100 bg-blue-50/50">
                    <CardContent className="p-4 space-y-2 text-sm text-slate-700">
                      <div className="flex items-center gap-2 text-blue-700 font-semibold">
                        <Clock className="w-4 h-4" />
                        Текущая версия: {diff.current_version.version_number}
                      </div>
                      <div>
                        Строк: {diff.current_version.row_count}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          Добавлено: {diff.current_version.change_summary?.rows_added ?? 0}
                        </Badge>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                          Удалено: {diff.current_version.change_summary?.rows_removed ?? 0}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 bg-slate-50/50">
                    <CardContent className="p-4 space-y-2 text-sm text-slate-700">
                      <div className="flex items-center gap-2 text-slate-700 font-semibold">
                        <Clock className="w-4 h-4" />
                        Базовая версия: {diff.previous_version.version_number}
                      </div>
                      <div>
                        Строк: {diff.previous_version.row_count}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <Badge variant="secondary" className="bg-slate-200 text-slate-600">
                          Добавлено: {diff.previous_version.change_summary?.rows_added ?? 0}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-200 text-slate-600">
                          Удалено: {diff.previous_version.change_summary?.rows_removed ?? 0}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
                    <Sparkles className="w-4 h-4" />
                    Автоматическое резюме
                  </div>
                  <ul className="list-disc list-inside text-sm text-emerald-700 space-y-1">
                    {(diff.highlights ?? []).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Метрики и агрегаты
                  </h3>
                  <MetricsDeltaTable metricsDelta={diff.metrics_delta} />
                </div>

                <ScrollArea className="h-80 rounded-xl border border-slate-200 p-4">
                  <div className="space-y-6">
                    <ChangesList
                      title="Добавленные строки"
                      icon={Plus}
                      rows={diff.added_rows ?? []}
                      emptyText="Нет новых строк"
                    />
                    <Separator />
                    <ChangesList
                      title="Удалённые строки"
                      icon={ArrowClockwise}
                      rows={diff.removed_rows ?? []}
                      emptyText="Нет удалённых строк"
                    />
                    <Separator />
                    <ChangesList
                      title="Изменённые строки"
                      icon={Diff}
                      rows={diff.changed_rows ?? []}
                      emptyText="Нет обновлённых строк"
                    />
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <Alert className="bg-slate-50 border-slate-200 text-slate-600">
                <AlertDescription>
                  Для выбранных версий пока нет рассчитанных различий. Попробуйте выбрать другую комбинацию.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
