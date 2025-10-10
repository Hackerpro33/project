import { describe, it, expect } from "vitest";

import { computeMapAnalytics } from "../mapAnalytics";

describe("computeMapAnalytics", () => {
  it("normalizes points and calculates statistics", () => {
    const data = [
      {
        lat: "55.75",
        lon: "37.61",
        value: "100",
        forecast: "120",
        correlation: "0.8",
        category: "Center",
        name: "Moscow",
      },
      {
        latitude: 60.0,
        longitude: 30.3,
        metric: 80,
        forecast: 70,
        corr: "-0.4",
        segment: "North",
        city_name: "Saint-Petersburg",
      },
      {
        lat: null,
        lon: null,
        value: "n/a",
      },
    ];

    const result = computeMapAnalytics(data, { value_column: "value" }, { datasetName: "Cities" });

    expect(result.hasData).toBe(true);
    expect(result.totalPoints).toBe(3);
    expect(result.validPoints).toBe(2);
    expect(result.averageValue).toBeCloseTo(90);
    expect(result.maxPoint?.name).toBe("Moscow");
    expect(result.minPoint?.name).toBe("Saint-Petersburg");
    expect(result.categories[0]).toMatchObject({ name: "Center", count: 1 });
    expect(result.forecast.hasForecast).toBe(true);
    expect(result.forecast.deltaFromValue).toBeCloseTo(5, 0);
    expect(result.correlation.hasCorrelation).toBe(true);
    expect(result.correlation.strongestPositive?.name).toBe("Moscow");
    expect(result.correlation.strongestNegative?.name).toBe("Saint-Petersburg");
  });

  it("falls back to provided samples", () => {
    const fallbackSample = [{ lat: 10, lon: 20, value: 5 }];
    const result = computeMapAnalytics([], { value_column: "value" }, { fallbackSample });
    expect(result.hasData).toBe(true);
    expect(result.totalPoints).toBe(1);
  });

  it("returns empty state when no data available", () => {
    const result = computeMapAnalytics(null, {}, {});
    expect(result.hasData).toBe(false);
    expect(result.valueLabel).toBe("Значение");
  });
});
