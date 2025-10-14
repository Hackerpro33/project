import { describe, expect, it } from "vitest";
import {
  detectFileIcon,
  generateCSV,
  generateJSON,
  generatePlainText,
  sanitizeCSVValue,
  getExportContentType,
  __TEST_ONLY__,
} from "../dataTransformation";
import {
  FileSpreadsheet,
  FileImage,
  Database,
} from "lucide-react";

describe("detectFileIcon", () => {
  it("returns spreadsheet icon for Excel files", () => {
    const { icon, color } = detectFileIcon("report.XLSX");
    expect(icon).toBe(FileSpreadsheet);
    expect(color).toBe("from-green-500 to-emerald-600");
  });

  it("returns database icon for SQL files", () => {
    const { icon } = detectFileIcon("dump.sql");
    expect(icon).toBe(Database);
  });

  it("falls back to default for unknown files", () => {
    const fallback = detectFileIcon("archive.unknown");
    expect(fallback.icon).toBe(__TEST_ONLY__.DEFAULT_FILE_ICON.icon);
    expect(fallback.color).toBe(__TEST_ONLY__.DEFAULT_FILE_ICON.color);
  });

  it("handles filenames without extension", () => {
    const result = detectFileIcon("README");
    expect(result).toEqual(__TEST_ONLY__.DEFAULT_FILE_ICON);
  });

  it("handles images specifically", () => {
    const { icon } = detectFileIcon("photo.jpeg");
    expect(icon).toBe(FileImage);
  });
});

describe("sanitizeCSVValue", () => {
  it("returns empty string for nullish values", () => {
    expect(sanitizeCSVValue(null)).toBe("");
    expect(sanitizeCSVValue(undefined)).toBe("");
  });

  it("preserves numbers and booleans", () => {
    expect(sanitizeCSVValue(0)).toBe("0");
    expect(sanitizeCSVValue(false)).toBe("false");
  });

  it("escapes quotes and wraps values with commas", () => {
    expect(sanitizeCSVValue('value,"with",comma')).toBe('"value,""with"",comma"');
  });
});

describe("generateCSV", () => {
  const columns = [
    { name: "city" },
    { name: "population" },
    { name: "note" },
  ];

  it("returns empty string when there is no data", () => {
    expect(generateCSV(columns, [])).toBe("");
  });

  it("generates CSV with escaped values", () => {
    const csv = generateCSV(columns, [
      { city: "Москва", population: 12615882, note: "Столица" },
      { city: "Санкт-Петербург", population: 5383890, note: "Культурный центр" },
    ]);

    expect(csv).toBe(
      "city,population,note\nМосква,12615882,Столица\nСанкт-Петербург,5383890,Культурный центр"
    );
  });

  it("respects commas and quotes in data", () => {
    const csv = generateCSV(columns, [
      { city: "Нижний Новгород", population: 1250615, note: 'Город "герой"' },
      { city: "Новосибирск", population: 1620162, note: "Быстро растущий, динамичный" },
    ]);

    expect(csv).toBe(
      'city,population,note\nНижний Новгород,1250615,"Город ""герой"""\nНовосибирск,1620162,"Быстро растущий, динамичный"'
    );
  });

  it("skips columns without names", () => {
    const csv = generateCSV([{ name: null }, { name: "value" }], [{ value: "ok" }]);
    expect(csv).toBe("value\nok");
  });
});

describe("generateJSON", () => {
  const columns = [
    { name: "city" },
    { name: "population" },
  ];

  it("returns empty array when there is no data", () => {
    expect(generateJSON(columns, null)).toBe("[]");
    expect(generateJSON(columns, [])).toBe("[]");
  });

  it("serializes only known columns", () => {
    const json = generateJSON(columns, [
      { city: "Москва", population: 12615882, note: "Столица" },
      { city: "Санкт-Петербург", population: 5383890 },
    ]);

    expect(json).toBe(
      JSON.stringify(
        [
          { city: "Москва", population: 12615882 },
          { city: "Санкт-Петербург", population: 5383890 },
        ],
        null,
        2,
      ),
    );
  });
});

describe("generatePlainText", () => {
  const columns = [
    { name: "city" },
    { name: "population" },
  ];

  it("returns header for empty datasets", () => {
    expect(generatePlainText(columns, [])).toBe("city | population");
  });

  it("aligns rows using column widths", () => {
    const text = generatePlainText(columns, [
      { city: "Москва", population: 12615882 },
      { city: "Казань", population: 1257341 },
    ]);

    expect(text.split("\n")).toEqual([
      "city   | population",
      "------ | ----------",
      "Москва | 12615882",
      "Казань | 1257341",
    ]);
  });
});

describe("getExportContentType", () => {
  it("returns mapped MIME types", () => {
    expect(getExportContentType("csv")).toBe("text/csv");
    expect(getExportContentType("JSON")).toBe("application/json");
  });

  it("returns octet-stream for unknown formats", () => {
    expect(getExportContentType("custom"))
      .toBe("application/octet-stream");
  });

  it("handles falsy values gracefully", () => {
    expect(getExportContentType(null)).toBe("application/octet-stream");
  });
});

