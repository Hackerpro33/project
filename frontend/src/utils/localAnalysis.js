const toNumberArray = (values) =>
  (values || [])
    .map((value) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => value !== null);

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const pearsonCorrelation = (seriesA, seriesB) => {
  const length = Math.min(seriesA.length, seriesB.length);
  if (length < 2) return 0;

  const valuesA = seriesA.slice(0, length);
  const valuesB = seriesB.slice(0, length);

  const meanA = average(valuesA);
  const meanB = average(valuesB);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let index = 0; index < length; index += 1) {
    const diffA = valuesA[index] - meanA;
    const diffB = valuesB[index] - meanB;
    numerator += diffA * diffB;
    denomA += diffA ** 2;
    denomB += diffB ** 2;
  }

  if (!denomA || !denomB) return 0;
  return numerator / Math.sqrt(denomA * denomB);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeColumnType = (type) => {
  if (!type) return "string";
  const lower = String(type).toLowerCase();
  if (["int", "integer", "float", "double", "number", "numeric"].includes(lower)) {
    return "number";
  }
  if (["bool", "boolean"].includes(lower)) {
    return "boolean";
  }
  if (lower.includes("date") || lower.includes("time")) {
    return "datetime";
  }
  return "string";
};

const createRowFingerprint = (row, columns) =>
  JSON.stringify(columns.map((column) => (row?.[column] ?? null)));

export function generateForecastReport({ historical, horizon, externalFactors = [] }) {
  const horizonDays = Math.max(1, Math.floor(horizon ?? 7));
  const timeline = Array.isArray(historical) ? historical : [];

  let series = timeline;
  if (!series.length) {
    const base = 100;
    series = Array.from({ length: 30 }, (_, index) => ({
      date: `2024-01-${String(index + 1).padStart(2, "0")}`,
      value: base,
    }));
  }

  const values = series.map((entry) => entry.value).filter((value) => Number.isFinite(value));
  const mean = average(values);
  const lastValue = values.at(-1) ?? mean;
  const lastWeek = values.slice(-7);
  const weeklyTrend = average(
    lastWeek.map((value, index, array) => (index === 0 ? 0 : value - array[index - 1]))
  );
  const volatility = standardDeviation(values) || mean * 0.05;
  const growthBaseline =
    weeklyTrend || (values.length > 1 ? (values.at(-1) - values[0]) / values.length : mean * 0.02);

  const forecastData = [];
  let current = lastValue;
  for (let day = 1; day <= horizonDays; day += 1) {
    const seasonal = Math.sin((day / 7) * 2 * Math.PI) * (volatility * 0.3);
    const adjusted = current + growthBaseline + seasonal;
    current = Math.max(0, adjusted);
    const confidenceBand = Math.max(volatility * 0.5, current * 0.05);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + day);
    forecastData.push({
      date: baseDate.toISOString().split("T")[0],
      predicted_value: Number(current.toFixed(2)),
      confidence_lower: Number(Math.max(0, current - confidenceBand).toFixed(2)),
      confidence_upper: Number((current + confidenceBand).toFixed(2)),
    });
  }

  const optimistic = forecastData.map((entry) => Number((entry.predicted_value * 1.08).toFixed(2)));
  const pessimistic = forecastData.map((entry) => Number((entry.predicted_value * 0.92).toFixed(2)));

  const growthPercent = values.length
    ? ((forecastData.at(-1).predicted_value - values[0]) / Math.max(values[0], 1e-6)) * 100
    : 0;

  const volatilityLevel = (() => {
    const ratio = clamp(volatility / Math.max(mean, 1e-6), 0, 3);
    if (ratio > 0.6) return "высокая";
    if (ratio > 0.3) return "средняя";
    return "низкая";
  })();

  const trendDirection = growthBaseline > 0.5 ? "возрастающий" : growthBaseline < -0.5 ? "убывающий" : "стабильный";
  const confidenceScore = clamp(1 - (volatility / Math.max(mean, 1e-6)) * 0.5, 0.3, 0.95);

  const factorInsights = externalFactors
    .filter((factor) => factor && factor.dataset_name)
    .map((factor) =>
      `Фактор "${factor.column}" из набора "${factor.dataset_name}" учитывается при прогнозе ` +
        `${factor.sampleValues?.length ? `на основе примеров ${factor.sampleValues.join(", ")}` : "как стабилизирующая переменная"}.`
    );

  const summary = {
    predicted_growth_percentage: Number(growthPercent.toFixed(1)),
    key_insights: [
      `Прогноз на ${horizonDays} дн. показывает ${trendDirection} тренд c потенциалом ${growthPercent.toFixed(1)}%.`,
      `Среднее значение ряда ≈ ${mean.toFixed(1)}, использована локальная сезонность и сглаживание шума.`,
      `Уровень волатильности оценивается как ${volatilityLevel}.`,
      ...factorInsights,
    ],
    seasonality_detected: true,
    trend_direction: trendDirection,
    volatility_level: volatilityLevel,
    confidence_score: Number(confidenceScore.toFixed(2)),
    risk_factors: [
      volatilityLevel === "высокая"
        ? "Высокая изменчивость ряда, рекомендуется контролировать экзогенные факторы."
        : "Значительных рисков, связанных с волатильностью, не обнаружено.",
      "Продолжительные отклонения от прогнозной линии требуют ручной проверки источников данных.",
    ],
    recommendations: [
      "Пересматривать прогноз каждые 7 дней для учёта новых данных.",
      "Использовать сценарий пессимистичного прогноза при планировании бюджета безопасности.",
      ...(externalFactors.length ? ["Отслеживать влияние внешних факторов и актуализировать список переменных."] : []),
    ],
  };

  return {
    forecast_data: forecastData,
    scenarios: {
      optimistic,
      pessimistic,
    },
    summary,
  };
}

export function analyzeCorrelation({ features }) {
  const preparedFeatures = (features || [])
    .map((feature) => ({
      ...feature,
      values: toNumberArray(feature.values || []),
    }))
    .filter((feature) => feature.values.length > 1);

  const matrix = preparedFeatures.map((feature) => {
    const correlations = {};
    for (const other of preparedFeatures) {
      const coefficient = pearsonCorrelation(feature.values, other.values);
      correlations[other.label] = Number(coefficient.toFixed(3));
    }
    return { feature: feature.label, correlations };
  });

  const strongest = [];
  for (let i = 0; i < preparedFeatures.length; i += 1) {
    for (let j = i + 1; j < preparedFeatures.length; j += 1) {
      const coeff = pearsonCorrelation(preparedFeatures[i].values, preparedFeatures[j].values);
      strongest.push({
        feature1: preparedFeatures[i].label,
        feature2: preparedFeatures[j].label,
        correlation: Number(coeff.toFixed(3)),
        interpretation:
          Math.abs(coeff) > 0.7
            ? "Сильная взаимосвязь, рекомендуется проанализировать причинность."
            : Math.abs(coeff) > 0.4
            ? "Умеренная связь, возможное влияние при совместном анализе."
            : "Связь слабая, скорее всего влияния нет.",
      });
    }
  }

  strongest.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const topStrongest = strongest.slice(0, 5);

  const insights = [];
  if (!matrix.length) {
    insights.push("Недостаточно числовых данных для построения матрицы корреляций.");
  } else {
    topStrongest.forEach((item) => {
      if (Math.abs(item.correlation) >= 0.7) {
        insights.push(
          `Пара "${item.feature1}" — "${item.feature2}" демонстрирует сильную корреляцию (${item.correlation}). ` +
            "Проверьте влияние зависимостей в моделях."
        );
      }
    });

    if (!insights.length) {
      insights.push("Сильных корреляций не обнаружено, данные сбалансированы.");
    }
  }

  return {
    correlation_matrix: matrix,
    insights,
    strongest_correlations: topStrongest,
  };
}

export function buildNetworkGraph({ datasetName, columns, rows, graphType }) {
  const numericColumns = (columns || []).filter((column) => column.type === "number");
  const nodes = numericColumns.map((column) => ({ id: column.name, group: column.type }));

  const columnSeries = Object.fromEntries(
    numericColumns.map((column) => [column.name, toNumberArray(rows.map((row) => row?.[column.name]))])
  );

  const links = [];
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = i + 1; j < numericColumns.length; j += 1) {
      const columnA = numericColumns[i].name;
      const columnB = numericColumns[j].name;
      const coeff = pearsonCorrelation(columnSeries[columnA], columnSeries[columnB]);
      if (Math.abs(coeff) >= 0.3) {
        links.push({
          source: columnA,
          target: columnB,
          value: Number(Math.abs(coeff).toFixed(3)),
        });
      }
    }
  }

  const insights = [];
  if (!links.length) {
    insights.push("Связи с коэффициентом выше 0.3 не обнаружены — показатели независимы.");
  } else {
    const strongest = [...links].sort((a, b) => b.value - a.value)[0];
    if (strongest) {
      insights.push(
        `Наиболее выраженная связь: "${strongest.source}" и "${strongest.target}" (корреляция ${strongest.value}).`
      );
    }
    if (graphType === "social") {
      insights.push("Интерпретируйте узлы как акторов: высокие связи — потенциальные центры влияния.");
    } else if (graphType === "geo") {
      insights.push("Параметры с высокой корреляцией могут указывать на общую географическую динамику.");
    }
  }

  const unused = numericColumns.filter(
    (column) => !links.some((link) => link.source === column.name || link.target === column.name)
  );
  if (unused.length) {
    insights.push(`Столбцы без связей: ${unused.map((column) => column.name).join(", ")}. Их можно анализировать отдельно.`);
  }

  return {
    nodes,
    links,
    insights,
  };
}

function valuesAreEquivalent(a, b) {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }

  const numberA = typeof a === "number" ? a : Number(a);
  const numberB = typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) {
    return numberA === numberB;
  }

  return String(a) === String(b);
}

function buildCellComparison({ leftRows, rightRows, columns }) {
  const totalRows = Math.max(leftRows.length, rightRows.length);
  const resultRows = [];

  for (let index = 0; index < totalRows; index += 1) {
    const leftRow = leftRows[index]?.raw ?? null;
    const rightRow = rightRows[index]?.raw ?? null;

    const cells = columns.map((column) => {
      const leftValue = leftRow ? leftRow[column] : undefined;
      const rightValue = rightRow ? rightRow[column] : undefined;
      const matches = valuesAreEquivalent(leftValue, rightValue);

      return {
        column,
        left_value: leftValue ?? null,
        right_value: rightValue ?? null,
        status: matches ? "match" : "mismatch",
        color: matches ? "green" : "red",
      };
    });

    resultRows.push({
      row_index: index,
      left_present: Boolean(leftRow),
      right_present: Boolean(rightRow),
      cells,
    });
  }

  return {
    columns,
    legend: {
      match: { color: "green", description: "Совпадение значений" },
      mismatch: { color: "red", description: "Расхождение значений" },
    },
    rows: resultRows,
  };
}

export function compareTables({ left, right, keyColumns }) {
  const leftColumns = new Map(
    (left?.columns || []).map((column) => [column.name, normalizeColumnType(column.type)])
  );
  const rightColumns = new Map(
    (right?.columns || []).map((column) => [column.name, normalizeColumnType(column.type)])
  );

  const commonColumns = (keyColumns && keyColumns.length
    ? keyColumns.filter((column) => leftColumns.has(column) && rightColumns.has(column))
    : [...leftColumns.keys()].filter((column) => rightColumns.has(column)));

  const matchingColumns = commonColumns.filter(
    (column) => leftColumns.get(column) === rightColumns.get(column)
  );
  const typeMismatches = commonColumns
    .filter((column) => leftColumns.get(column) !== rightColumns.get(column))
    .map((column) => ({
      column,
      left_type: leftColumns.get(column),
      right_type: rightColumns.get(column),
    }));
  const leftOnlyColumns = [...leftColumns.keys()].filter((column) => !rightColumns.has(column));
  const rightOnlyColumns = [...rightColumns.keys()].filter((column) => !leftColumns.has(column));

  const rowsToCompare = matchingColumns.length ? matchingColumns : commonColumns;
  const leftRows = (left?.sample_data || []).map((row) => ({
    raw: row,
    fingerprint: createRowFingerprint(row, rowsToCompare),
  }));
  const rightRows = (right?.sample_data || []).map((row) => ({
    raw: row,
    fingerprint: createRowFingerprint(row, rowsToCompare),
  }));

  const cellComparison = buildCellComparison({
    leftRows,
    rightRows,
    columns: rowsToCompare,
  });

  const leftRowCounts = new Map();
  leftRows.forEach((entry) => {
    leftRowCounts.set(entry.fingerprint, (leftRowCounts.get(entry.fingerprint) ?? 0) + 1);
  });
  const rightRowCounts = new Map();
  rightRows.forEach((entry) => {
    rightRowCounts.set(entry.fingerprint, (rightRowCounts.get(entry.fingerprint) ?? 0) + 1);
  });

  let matchingRowsCount = 0;
  for (const [fingerprint, count] of leftRowCounts.entries()) {
    if (rightRowCounts.has(fingerprint)) {
      matchingRowsCount += Math.min(count, rightRowCounts.get(fingerprint));
    }
  }

  const leftOnlyRows = [];
  for (const [fingerprint, count] of leftRowCounts.entries()) {
    const rightCount = rightRowCounts.get(fingerprint) ?? 0;
    if (count > rightCount) {
      const samples = leftRows
        .filter((entry) => entry.fingerprint === fingerprint)
        .slice(0, 3)
        .map((entry) => entry.raw);
      leftOnlyRows.push({ fingerprint, count: count - rightCount, samples });
    }
  }

  const rightOnlyRows = [];
  for (const [fingerprint, count] of rightRowCounts.entries()) {
    const leftCount = leftRowCounts.get(fingerprint) ?? 0;
    if (count > leftCount) {
      const samples = rightRows
        .filter((entry) => entry.fingerprint === fingerprint)
        .slice(0, 3)
        .map((entry) => entry.raw);
      rightOnlyRows.push({ fingerprint, count: count - leftCount, samples });
    }
  }

  const insights = [];
  if (!commonColumns.length) {
    insights.push("Таблицы не имеют общих столбцов — автоматическое сравнение невозможно.");
  } else {
    insights.push(
      `Совпадающих столбцов: ${matchingColumns.length} из ${commonColumns.length}.` +
        (typeMismatches.length
          ? ` Для ${typeMismatches.length} столбцов обнаружены различия типов данных.`
          : " Типы данных идентичны для общих столбцов.")
    );

    if (rowsToCompare.length) {
      insights.push(
        `По общим столбцам найдено ${matchingRowsCount} совпадающих строк из ${
          Math.max(leftRows.length, rightRows.length)
        } проверенных.`
      );
    }

    if (leftOnlyColumns.length) {
      insights.push(`У первой таблицы есть уникальные столбцы: ${leftOnlyColumns.join(", ")}.`);
    }
    if (rightOnlyColumns.length) {
      insights.push(`У второй таблицы есть уникальные столбцы: ${rightOnlyColumns.join(", ")}.`);
    }
  }

  return {
    column_comparison: {
      matching_columns: matchingColumns,
      type_mismatches: typeMismatches,
      left_only: leftOnlyColumns,
      right_only: rightOnlyColumns,
    },
    row_comparison: {
      compared_columns: rowsToCompare,
      matching_rows: matchingRowsCount,
      left_only_rows: leftOnlyRows,
      right_only_rows: rightOnlyRows,
      left_sampled_total: leftRows.length,
      right_sampled_total: rightRows.length,
    },
    cell_comparison: cellComparison,
    insights,
  };
}

export function summarizeProjectStructure({ datasets, visualizations }) {
  const datasetUsage = new Map();
  (visualizations || []).forEach((visualization) => {
    const datasetId = visualization.dataset_id;
    if (datasetId) {
      datasetUsage.set(datasetId, (datasetUsage.get(datasetId) ?? 0) + 1);
    }
  });

  const keyDatasets = [...datasetUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([datasetId, count]) => {
      const dataset = (datasets || []).find((item) => item.id === datasetId);
      return dataset ? `${dataset.name} — ${count} визуализаций` : datasetId;
    });

  const unusedDatasets = (datasets || [])
    .filter((dataset) => !datasetUsage.has(dataset.id))
    .map((dataset) => dataset.name);

  const insights = [];
  insights.push(`В проекте используется ${visualizations?.length ?? 0} визуализаций и ${datasets?.length ?? 0} наборов данных.`);
  if (keyDatasets.length) {
    insights.push(`Основная активность строится вокруг: ${keyDatasets.join(", ")}.`);
  }
  if (unusedDatasets.length) {
    insights.push("Есть неиспользуемые наборы данных — их стоит вовлечь в анализ.");
  } else {
    insights.push("Все загруженные наборы данных задействованы в визуализациях.");
  }

  const recommendations = [
    "Проверьте, можно ли объединить часто используемые наборы данных в единый витринный слой.",
    "Добавьте новые связи между визуализациями для комплексного анализа (например, прогноз + корреляция).",
  ];
  if (unusedDatasets.length) {
    recommendations.push("Используйте неактивные наборы данных для экспериментов и проверки гипотез.");
  }

  return {
    insights,
    key_datasets: keyDatasets,
    unused_datasets: unusedDatasets,
    recommendations,
  };
}

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function analyzeDataset(dataset = {}) {
  const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
  const sample = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];

  const normalizedColumns = columns.map((column) => ({
    ...column,
    normalizedType: normalizeColumnType(column.type),
  }));

  const sampleRows = sample.length;
  const totalRows = dataset.row_count ?? sampleRows;
  const totalCells = sampleRows * normalizedColumns.length;

  let filledCells = 0;
  sample.forEach((row) => {
    normalizedColumns.forEach((column) => {
      const value = row?.[column.name];
      if (value !== null && value !== undefined && value !== "") {
        filledCells += 1;
      }
    });
  });

  const completeness = totalCells
    ? Math.round((filledCells / Math.max(totalCells, 1)) * 100)
    : sampleRows
    ? 100
    : 0;

  const numericSummary = normalizedColumns
    .filter((column) => column.normalizedType === "number")
    .map((column) => {
      const values = toNumberArray(sample.map((row) => row?.[column.name]));
      if (!values.length) {
        return { name: column.name, type: column.normalizedType, hasData: false };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = average(values);
      const deviation = standardDeviation(values);

      return {
        name: column.name,
        type: column.normalizedType,
        hasData: true,
        min,
        max,
        mean: Number(mean.toFixed(2)),
        deviation: Number(deviation.toFixed(2)),
        variation: max - min,
        formattedMin: numberFormatter.format(min),
        formattedMax: numberFormatter.format(max),
        formattedMean: numberFormatter.format(mean),
      };
    });

  const duplicates = (() => {
    if (!sampleRows) return 0;
    const keys = normalizedColumns.map((column) => column.name);
    if (!keys.length) return 0;

    const occurrences = new Map();
    sample.forEach((row) => {
      const fingerprint = createRowFingerprint(row, keys);
      occurrences.set(fingerprint, (occurrences.get(fingerprint) ?? 0) + 1);
    });

    let duplicatesCount = 0;
    occurrences.forEach((count) => {
      if (count > 1) {
        duplicatesCount += count - 1;
      }
    });

    return duplicatesCount;
  })();

  const insights = [];

  if (!sampleRows) {
    insights.push(
      "Нет примерочных данных — добавьте выборку, чтобы система могла построить статистику и рекомендации."
    );
  } else {
    insights.push(
      `Предоставленная выборка содержит ${sampleRows} строк при общем объёме ${totalRows || sampleRows}.`
    );

    if (completeness < 70) {
      insights.push(`Заполненность данных около ${completeness}% — рекомендуется проверить источники на пропуски.`);
    } else {
      insights.push(`Заполненность выборки достигает ${completeness}% — критических пропусков не обнаружено.`);
    }

    const numericWithData = numericSummary.filter((column) => column.hasData);
    if (numericWithData.length) {
      const widest = [...numericWithData].sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0))[0];
      if (widest && Number.isFinite(widest.variation) && widest.variation > 0) {
        insights.push(
          `Столбец «${widest.name}» варьируется от ${widest.formattedMin} до ${widest.formattedMax}, среднее значение ${widest.formattedMean}.`
        );
      } else {
        insights.push("Числовые признаки имеют стабильные значения без существенного разброса.");
      }
    } else {
      insights.push("Числовые признаки не обнаружены — используйте категориальные инструменты анализа.");
    }

    if (duplicates > 0) {
      insights.push(
        `В примерочных данных выявлено ${duplicates} повторяющихся строк — рекомендуется очистить их перед моделированием.`
      );
    }
  }

  return {
    totalRows,
    sampleRows,
    completeness,
    duplicates,
    numericSummary,
    insights,
  };
}

const toDisplayString = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const escapeCsvValue = (value, delimiter) => {
  const raw = toDisplayString(value);
  const escapedQuotes = raw.replace(/"/g, '""');
  const needsEscaping =
    escapedQuotes.includes("\n") ||
    escapedQuotes.includes("\r") ||
    escapedQuotes.includes(delimiter) ||
    /(^\s|\s$)/.test(escapedQuotes);
  return needsEscaping ? `"${escapedQuotes}"` : escapedQuotes;
};

const escapeXmlValue = (value) =>
  toDisplayString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const escapeHtmlValue = (value) =>
  toDisplayString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeIdentifier = (value, fallback) => {
  const base = (value ?? "").toString().trim().replace(/[^a-zA-Z0-9_:-]+/g, "_");
  return base || fallback;
};

const deriveColumns = (dataset = {}) => {
  const declared = Array.isArray(dataset.columns) ? dataset.columns : [];
  if (declared.length) {
    return declared.map((column, index) => ({
      name: column?.name ?? `column_${index + 1}`,
      ...column,
    }));
  }

  const sampleRow = Array.isArray(dataset.sample_data) ? dataset.sample_data[0] : undefined;
  if (sampleRow && typeof sampleRow === "object") {
    return Object.keys(sampleRow).map((name) => ({ name }));
  }

  return [];
};

const buildUniqueFieldMap = (columns = []) => {
  const used = new Set();
  return columns.map((column, index) => {
    const fallback = `field_${index + 1}`;
    const candidate = sanitizeIdentifier(column?.name, fallback);
    let unique = candidate;
    let counter = 1;
    while (used.has(unique)) {
      counter += 1;
      unique = `${candidate}_${counter}`;
    }
    used.add(unique);
    return { original: column?.name ?? fallback, safe: unique };
  });
};

const computePlainTextWidths = (headers, rows) =>
  headers.map((header, columnIndex) => {
    const values = rows.map((row) => row[columnIndex] ?? "");
    const all = [header, ...values];
    return all.reduce((width, value) => Math.max(width, value.length), 0);
  });

const formatGenerators = {
  csv: ({ dataset, options }) => {
    const delimiter = options?.delimiter ?? ",";
    const includeHeaders = options?.includeHeaders !== false;
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const rows = dataset.sample_data || [];

    const lines = [];
    if (includeHeaders && fieldNames.length) {
      lines.push(fieldNames.map((header) => escapeCsvValue(header, delimiter)).join(delimiter));
    }

    rows.forEach((row) => {
      const values = fieldNames.map((header) => escapeCsvValue(row?.[header], delimiter));
      lines.push(values.join(delimiter));
    });

    return lines.join("\\n");
  },
  json: ({ dataset }) => JSON.stringify(dataset.sample_data || [], null, 2),
  xml: ({ dataset }) => {
    const rows = dataset.sample_data || [];
    const fields = buildUniqueFieldMap(deriveColumns(dataset));

    if (!rows.length) {
      return "<dataset />";
    }

    const body = rows
      .map((row) => {
        const cells = fields
          .map((field) => `    <${field.safe}>${escapeXmlValue(row?.[field.original])}</${field.safe}>`)
          .join("\\n");
        return `  <row>\\n${cells}\\n  </row>`;
      })
      .join("\\n");

    return `<dataset>\\n${body}\\n</dataset>`;
  },
  html: ({ dataset }) => {
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const rows = dataset.sample_data || [];
    const headerHtml = fieldNames.map((header) => `<th>${escapeHtmlValue(header)}</th>`).join("");
    const body = rows
      .map(
        (row) =>
          `    <tr>${fieldNames
            .map((header) => `<td>${escapeHtmlValue(row?.[header])}</td>`)
            .join("")}</tr>`
      )
      .join("\\n");

    const bodySection = body ? `\\n${body}\\n  ` : "";

    return `<!DOCTYPE html>\\n<table>\\n  <thead>\\n    <tr>${headerHtml}</tr>\\n  </thead>\\n  <tbody>${bodySection}</tbody>\\n</table>`;
  },
  txt: ({ dataset }) => {
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const headerLabels = fieldNames.map((name) => toDisplayString(name));
    const rows = (dataset.sample_data || []).map((row) =>
      fieldNames.map((header) => toDisplayString(row?.[header]).replace(/[\r\n]+/g, " "))
    );

    if (!fieldNames.length && !rows.length) {
      return "";
    }

    if (!fieldNames.length) {
      return rows.map((row) => row.join(" | ")).join("\\n");
    }

    const widths = computePlainTextWidths(headerLabels, rows);
    const formatRow = (values) =>
      values
        .map((value, index) => value.padEnd(widths[index], " "))
        .join(" | ")
        .trimEnd();

    const divider = widths.map((width) => "-".repeat(width)).join("-+-");
    const lines = [formatRow(headerLabels), divider, ...rows.map((row) => formatRow(row))];
    return lines.join("\\n");
  },
};

formatGenerators.sql = ({ dataset }) => {
  const tableName = dataset.name?.replace(/[^a-zA-Z0-9_]+/g, "_") || "dataset";
  const columns = deriveColumns(dataset);
  const fields = buildUniqueFieldMap(columns);
  const createTable = `CREATE TABLE ${tableName} (\\n${fields
    .map((field, index) => {
      const column = columns[index];
      const type = column?.type === "number" ? "NUMERIC" : "TEXT";
      return `  ${field.safe} ${type}`;
    })
    .join(",\\n")}\\n);`;
  const rows = dataset.sample_data || [];
  const inserts = rows
    .map((row) => {
      const values = fields
        .map((field) => {
          const original = field.original;
          const value = original ? row?.[original] : undefined;
          if (value === null || value === undefined) return "NULL";
          return typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
        })
        .join(", ");
      return `INSERT INTO ${tableName} VALUES (${values});`;
    })
    .join("\\n");
  return `${createTable}\\n\\n${inserts}`;
};

formatGenerators.xlsx = ({ dataset, options }) => formatGenerators.csv({ dataset, options });
formatGenerators.parquet = ({ dataset, options }) => formatGenerators.csv({ dataset, options });

export function convertDataset({ dataset, format, options = {} }) {
  const lowerFormat = (format || "csv").toLowerCase();
  const generator = formatGenerators[lowerFormat] || formatGenerators.csv;
  const converted = generator({ dataset, format: lowerFormat, options });

  const notes = [];
  if (["xlsx", "parquet"].includes(lowerFormat)) {
    notes.push("Формат сгенерирован в виде текстового представления для локальной загрузки.");
  }

  return {
    converted_data: converted,
    format_info: `Файл подготовлен в формате ${lowerFormat.toUpperCase()} на основе локального преобразования.`,
    compatibility_notes: notes,
    file_size_estimate: `${Math.max(1, Math.round(converted.length / 1024))} KB`,
    export_quality: "good",
  };
}

export function buildProjectReport({ datasets, visualizations }) {
  const datasetCount = datasets?.length ?? 0;
  const visualizationCount = visualizations?.length ?? 0;

  const datasetCoverage = (datasets || []).map((dataset) => {
    const name = (dataset?.name || "Набор без названия").trim();
    const columns = dataset?.columns?.length ?? 0;
    const rows = dataset?.row_count ?? dataset?.sample_data?.length ?? 0;
    const hasSample = Array.isArray(dataset?.sample_data) && dataset.sample_data.length > 0;

    return {
      name: name || "Набор без названия",
      columns,
      rows,
      hasSample,
    };
  });

  const visualizationCoverage = (visualizations || []).map((viz) => {
    const title = (viz?.title || "Визуализация").trim() || "Визуализация";
    const type = viz?.type || "visualization";
    const datasetName = datasets?.find((dataset) => dataset.id === viz?.dataset_id)?.name;

    return {
      title,
      type,
      dataset: datasetName,
    };
  });

  const datasetsSummary = datasetCoverage.map(
    ({ name, columns, rows, hasSample }) =>
      `${name} — ${columns} полей, ${rows || "0"} строк${hasSample ? "" : " (нет примеров)"}`
  );

  const visualizationSummary = visualizationCoverage.map((item) => {
    const datasetInfo = item.dataset ? ` для набора «${item.dataset}»` : "";
    return `${item.title} (${item.type}${datasetInfo})`;
  });

  return {
    executive_summary:
      `Локальный анализ проекта показал ${datasetCount} наборов данных и ${visualizationCount} визуализаций. ` +
      `Основной фокус — использование табличных данных для отчётности и мониторинга показателей.`,
    key_insights: [
      datasetCount
        ? `В работе находятся ключевые наборы: ${datasetsSummary.slice(0, 3).join(", ")}.`
        : "Наборы данных ещё не загружены.",
      visualizationCount
        ? `Создано ${visualizationCount} визуализаций, среди них: ${visualizationSummary.slice(0, 3).join(", ")}.`
        : "Визуализации отсутствуют — начните с базового графика или карты.",
      "Все выводы построены локальными эвристиками без обращения к внешним моделям.",
    ],
    dataset_overview: {
      total: datasetCount,
      coverage_summary: datasetCoverage.length
        ? datasetsSummary
        : ["Данные не загружены — добавьте наборы для анализа."],
    },
    visualization_overview: {
      total: visualizationCount,
      highlights: visualizationCoverage.length
        ? visualizationSummary
        : ["Визуализации отсутствуют — создайте первую диаграмму."],
    },
    risk_zones: unusedDatasetsReport(datasets),
    recommendations: [
      "Регулярно обновляйте локальные данные и проверяйте качество источников.",
      "Фиксируйте гипотезы и проверяйте их на новых визуализациях.",
      "Для расширенного анализа добавьте дополнительные числовые признаки и связи между наборами.",
    ],
  };
}

function unusedDatasetsReport(datasets = []) {
  if (!datasets.length) {
    return [
      {
        area: "Данные",
        risk_description: "Отчёт невозможно подготовить без загруженных таблиц.",
      },
    ];
  }

  const issues = datasets
    .filter((dataset) => !dataset.sample_data || dataset.sample_data.length === 0)
    .map((dataset) => ({
      area: dataset.name || "Набор без названия",
      risk_description: "Набор данных загружен без примеров строк — проверьте источник.",
    }));

  if (issues.length) {
    return issues;
  }

  return [
    {
      area: "Использование данных",
      risk_description: "Все наборы данных содержат примеры строк — критических рисков не обнаружено.",
    },
  ];
}

export function summarizeEmailBody(summary) {
  return [
    "Краткое описание локального анализа:",
    summary.executive_summary,
    "\nОсновные выводы:",
    ...(summary.key_insights || []),
    "\nРекомендации:",
    ...(summary.recommendations || []),
  ].join("\n");
}
