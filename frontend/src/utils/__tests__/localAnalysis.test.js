import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import {
  generateForecastReport,
  analyzeCorrelation,
  buildNetworkGraph,
  compareTables,
  summarizeProjectStructure,
  convertDataset,
  buildProjectReport,
  summarizeEmailBody,
} from "../localAnalysis";

describe("generateForecastReport", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-05-01T00:00:00.000Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("builds a deterministic forecast with scenarios and insights", () => {
    const historical = Array.from({ length: 10 }, (_, index) => ({
      date: `2024-04-${String(index + 1).padStart(2, "0")}`,
      value: 100 + index * 5,
    }));

    const report = generateForecastReport({
      historical,
      horizon: 5,
      externalFactors: [
        {
          dataset_name: "Weather",
          column: "Temperature",
          sampleValues: ["+2°C", "+3°C"],
        },
      ],
    });

    expect(report.forecast_data).toHaveLength(5);
    expect(report.forecast_data[0]).toMatchObject({ date: "2024-05-02" });
    expect(report.scenarios.optimistic).toHaveLength(5);
    expect(report.scenarios.pessimistic).toHaveLength(5);
    expect(report.summary.trend_direction).toBe("возрастающий");
    expect(report.summary.key_insights.some((text) => text.includes("Прогноз на 5 дн."))).toBe(true);
  });

  it("falls back to synthetic history when no data provided", () => {
    const report = generateForecastReport({ historical: [], horizon: 2 });
    expect(report.forecast_data).toHaveLength(2);
    expect(report.summary.key_insights.length).toBeGreaterThan(0);
  });
});

describe("analyzeCorrelation", () => {
  it("builds correlation matrix and highlights strong links", () => {
    const result = analyzeCorrelation({
      features: [
        { label: "Sales", values: [100, 120, 140, 160] },
        { label: "Profit", values: [50, 60, 70, 80] },
        { label: "Noise", values: [5, 7, 6, 8] },
      ],
    });

    expect(result.correlation_matrix).toHaveLength(3);
    expect(result.correlation_matrix[0].correlations).toHaveProperty("Profit");
    expect(result.strongest_correlations[0].feature1).toBe("Sales");
    expect(Math.abs(result.strongest_correlations[0].correlation)).toBeCloseTo(1, 3);
    expect(result.insights.some((text) => text.includes("корреляцию"))).toBe(true);
  });

  it("returns a warning when not enough data", () => {
    const result = analyzeCorrelation({ features: [{ label: "A", values: [1] }] });
    expect(result.insights).toContain(
      "Недостаточно числовых данных для построения матрицы корреляций."
    );
  });
});

describe("buildNetworkGraph", () => {
  it("connects numeric columns above the correlation threshold", () => {
    const columns = [
      { name: "sales", type: "number" },
      { name: "profit", type: "number" },
      { name: "region", type: "string" },
    ];
    const rows = [
      { sales: 10, profit: 2, region: "A" },
      { sales: 20, profit: 4, region: "B" },
      { sales: 30, profit: 6, region: "C" },
    ];

    const result = buildNetworkGraph({
      datasetName: "Demo",
      columns,
      rows,
      graphType: "social",
    });

    expect(result.nodes.map((node) => node.id)).toEqual(["sales", "profit"]);
    expect(result.links).toHaveLength(1);
    expect(result.insights.some((text) => text.includes("центры влияния"))).toBe(true);
  });
});

describe("compareTables", () => {
  it("detects shared structure, mismatched types and row differences", () => {
    const left = {
      columns: [
        { name: "id", type: "number" },
        { name: "city", type: "string" },
        { name: "amount", type: "number" },
      ],
      sample_data: [
        { id: 1, city: "Paris", amount: 120 },
        { id: 2, city: "Berlin", amount: 90 },
      ],
    };

    const right = {
      columns: [
        { name: "id", type: "int" },
        { name: "city", type: "STRING" },
        { name: "amount", type: "text" },
        { name: "status", type: "boolean" },
      ],
      sample_data: [
        { id: 1, city: "Paris", amount: "120", status: true },
        { id: 3, city: "Rome", amount: "70", status: false },
      ],
    };

    const result = compareTables({ left, right });

    expect(result.column_comparison.matching_columns).toEqual(["id", "city"]);
    expect(result.column_comparison.type_mismatches).toEqual([
      { column: "amount", left_type: "number", right_type: "string" },
    ]);
    expect(result.column_comparison.left_only).toEqual([]);
    expect(result.column_comparison.right_only).toEqual(["status"]);

    expect(result.row_comparison.matching_rows).toBe(1);
    expect(result.row_comparison.left_only_rows[0].count).toBe(1);
    expect(result.row_comparison.right_only_rows[0].count).toBe(1);
    expect(result.insights[0]).toContain("Совпадающих столбцов: 2 из 3");
  });
});

describe("summarizeProjectStructure", () => {
  it("detects key and unused datasets", () => {
    const datasets = [
      { id: "d1", name: "Sales" },
      { id: "d2", name: "Marketing" },
    ];
    const visualizations = [
      { id: "v1", dataset_id: "d1" },
      { id: "v2", dataset_id: "d1" },
    ];

    const summary = summarizeProjectStructure({ datasets, visualizations });

    expect(summary.key_datasets).toContain("Sales — 2 визуализаций");
    expect(summary.unused_datasets).toContain("Marketing");
    expect(summary.insights[0]).toContain("визуализаций");
  });
});

describe("convertDataset", () => {
  const dataset = {
    name: "Retail Data",
    columns: [
      { name: "city", type: "string" },
      { name: "sales", type: "number" },
    ],
    sample_data: [
      { city: "Paris", sales: 120 },
      { city: "Berlin", sales: 80 },
    ],
  };

  it("converts to SQL with sanitized identifiers", () => {
    const result = convertDataset({ dataset, format: "sql" });
    expect(result.converted_data).toContain("CREATE TABLE Retail_Data");
    expect(result.converted_data).toContain("INSERT INTO Retail_Data VALUES ('Paris', 120);");
  });

  it("adds compatibility notes for virtual Excel export", () => {
    const result = convertDataset({ dataset, format: "xlsx" });
    expect(result.compatibility_notes).toContain(
      "Формат сгенерирован в виде текстового представления для локальной загрузки."
    );
  });
});

describe("buildProjectReport and summarizeEmailBody", () => {
  it("builds narrative summaries and renders email text", () => {
    const report = buildProjectReport({
      datasets: [
        { name: "Sales", columns: [{}, {}], sample_data: [] },
        { name: "HR", columns: [{}], sample_data: [{}] },
      ],
      visualizations: [
        { title: "KPI", type: "chart" },
        { title: "Map", type: "geo" },
      ],
    });

    expect(report.executive_summary).toContain("Локальный анализ проекта");
    expect(report.key_insights.length).toBe(3);

    const email = summarizeEmailBody(report);
    expect(email).toContain("Краткое описание локального анализа:");
    expect(email).toContain("Рекомендации:");
  });
});
