import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, MapPin, TrendingUp, Activity } from "lucide-react";
import { computeMapAnalytics } from "@/utils/mapAnalytics";
import samplePoints from "./sampleData";

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  if (typeof value === "number") {
    return value.toLocaleString("ru-RU", {
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
    });
  }

  return value;
};

const buildInsights = (analytics) => {
  const insights = [];

  if (analytics.maxPoint && analytics.averageValue !== null) {
    const diff = analytics.maxPoint.value - analytics.averageValue;
    const percent = analytics.averageValue !== 0
      ? (diff / analytics.averageValue) * 100
      : null;
    insights.push(
      `${analytics.maxPoint.name || "Локация"} выделяется на карте со значением ${formatNumber(analytics.maxPoint.value)}${percent !== null ? `, что на ${percent.toFixed(1)}% выше среднего` : ""}.`
    );
  }

  if (analytics.forecast?.hasForecast && analytics.forecast.deltaFromValue !== null) {
    const sign = analytics.forecast.deltaFromValue >= 0 ? "рост" : "снижение";
    insights.push(
      `Прогноз показывает ${sign} в среднем на ${formatNumber(Math.abs(analytics.forecast.deltaFromValue))} относительно текущих значений.`
    );
  }

  if (analytics.correlation?.hasCorrelation && analytics.correlation.strongestPositive) {
    insights.push(
      `Наиболее сильная положительная связь у ${analytics.correlation.strongestPositive.name || "одной из точек"}: ${analytics.correlation.strongestPositive.correlation.toFixed(2)}.`
    );
  }

  if (analytics.categories.length > 1) {
    const topCategory = analytics.categories[0];
    insights.push(
      `Чаще всего встречается категория «${topCategory.name}» — ${topCategory.count} точек.`
    );
  }

  return insights.slice(0, 3);
};

export default function MapAnalyticsPanel({ data, config, datasets, isLoading }) {
  const selectedDataset = useMemo(
    () => datasets?.find((dataset) => dataset.id === config?.dataset_id),
    [datasets, config?.dataset_id]
  );

  const analytics = useMemo(
    () =>
      computeMapAnalytics(data, config, {
        datasetSample: selectedDataset?.sample_data,
        datasetId: config?.dataset_id,
        datasetName:
          selectedDataset?.name ||
          (config?.dataset_id === "sample" || !config?.dataset_id
            ? "Образец данных"
            : ""),
        fallbackSample: samplePoints,
      }),
    [data, config, selectedDataset?.sample_data, selectedDataset?.name]
  );

  const insights = useMemo(() => buildInsights(analytics), [analytics]);

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <BarChart3 className="w-5 h-5 text-emerald-500" />
          Аналитика карты
        </CardTitle>
        {analytics.datasetLabel && (
          <p className="text-sm text-slate-500">
            Источник данных: {analytics.datasetLabel}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : analytics.hasData ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Точек на карте</span>
                  <MapPin className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {analytics.validPoints} <span className="text-sm font-normal text-slate-500">из {analytics.totalPoints}</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Среднее {analytics.valueLabel.toLowerCase()}</span>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatNumber(analytics.averageValue)}
                </div>
              </div>
              {analytics.maxPoint && (
                <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Максимум</span>
                    <Activity className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatNumber(analytics.maxPoint.value)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {analytics.maxPoint.name || "Без названия"}
                  </div>
                </div>
              )}
            </div>

            {analytics.categories.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Распределение категорий</h4>
                <div className="flex flex-wrap gap-2">
                  {analytics.categories.map((category) => (
                    <Badge key={category.name} variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                      {category.name}
                      <span className="ml-2 text-xs text-blue-600">{category.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(analytics.forecast?.hasForecast || analytics.correlation?.hasCorrelation) && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                {analytics.forecast?.hasForecast && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Прогноз</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Среднее значение прогноза: <span className="font-semibold text-slate-900">{formatNumber(analytics.forecast.average)}</span>
                    </div>
                    {analytics.forecast.deltaFromValue !== null && (
                      <div className="text-sm text-slate-600">
                        Отклонение от текущих значений: {formatNumber(analytics.forecast.deltaFromValue)}
                      </div>
                    )}
                  </div>
                )}

                {analytics.forecast?.hasForecast && analytics.forecast.highestGrowthPoint && (
                  <div className="rounded-lg bg-white/70 p-3 text-sm text-slate-600">
                    Локация с наибольшим ростом: <span className="font-semibold text-slate-900">{analytics.forecast.highestGrowthPoint.name || "Без названия"}</span>
                  </div>
                )}

                {analytics.correlation?.hasCorrelation && (
                  <div className="text-sm text-slate-600">
                    Средняя корреляция: <span className="font-semibold text-slate-900">{analytics.correlation.average?.toFixed(2)}</span>
                  </div>
                )}

                {analytics.correlation?.hasCorrelation && (
                  <div className="flex flex-col gap-2 text-sm text-slate-600">
                    {analytics.correlation.strongestPositive && (
                      <div>
                        Сильнейшая положительная связь: <span className="font-semibold text-slate-900">{analytics.correlation.strongestPositive.name || "Без названия"}</span>
                        {" "}
                        ({analytics.correlation.strongestPositive.correlation.toFixed(2)})
                      </div>
                    )}
                    {analytics.correlation.strongestNegative && (
                      <div>
                        Сильнейшая отрицательная связь: <span className="font-semibold text-slate-900">{analytics.correlation.strongestNegative.name || "Без названия"}</span>
                        {" "}
                        ({analytics.correlation.strongestNegative.correlation.toFixed(2)})
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {insights.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <h4 className="text-sm font-semibold text-slate-700">Ключевые наблюдения</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  {insights.map((insight, index) => (
                    <li key={index} className="rounded-lg bg-white/70 p-3 shadow-sm">
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            Недостаточно данных для расчёта аналитики. Выберите набор данных и убедитесь, что указаны корректные столбцы широты, долготы и значения.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
