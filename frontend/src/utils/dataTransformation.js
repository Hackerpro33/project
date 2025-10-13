import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Database,
} from "lucide-react";

const FILE_ICON_CATEGORIES = [
  {
    extensions: ["xlsx", "xls", "xlsm", "xlsb"],
    icon: FileSpreadsheet,
    color: "from-green-500 to-emerald-600",
  },
  {
    extensions: ["csv", "tsv", "txt"],
    icon: FileText,
    color: "from-blue-500 to-cyan-600",
  },
  {
    extensions: ["pdf", "doc", "docx", "ppt", "pptx"],
    icon: FileText,
    color: "from-red-500 to-pink-600",
  },
  {
    extensions: ["jpg", "jpeg", "png", "tiff", "bmp"],
    icon: FileImage,
    color: "from-purple-500 to-indigo-600",
  },
  {
    extensions: ["dbf", "mdb", "accdb", "sqlite", "sql"],
    icon: Database,
    color: "from-orange-500 to-red-600",
  },
];

const DEFAULT_FILE_ICON = {
  icon: FileText,
  color: "from-slate-500 to-gray-600",
};

/**
 * Возвращает подходящую иконку и цвет для выбранного файла.
 */
export function detectFileIcon(fileName) {
  if (!fileName || typeof fileName !== "string") {
    return DEFAULT_FILE_ICON;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) {
    return DEFAULT_FILE_ICON;
  }

  const matchedCategory = FILE_ICON_CATEGORIES.find(category =>
    category.extensions.includes(extension)
  );

  return matchedCategory || DEFAULT_FILE_ICON;
}

/**
 * Подготавливает значение ячейки CSV, корректно экранируя спецсимволы.
 */
export function sanitizeCSVValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  const escapedValue = stringValue.replace(/"/g, '""');
  const needsQuoting = /[",\n]/.test(escapedValue);
  return needsQuoting ? `"${escapedValue}"` : escapedValue;
}

function extractColumnNames(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return [];
  }

  return columns
    .map(column => column?.name)
    .filter(name => typeof name === "string" && name.trim() !== "")
    .map(name => String(name));
}

/**
 * Генерирует CSV-представление данных.
 */
export function generateCSV(columns, data) {
  const columnNames = extractColumnNames(columns);
  if (columnNames.length === 0) {
    return "";
  }

  if (!Array.isArray(data) || data.length === 0) {
    return "";
  }

  const headers = columnNames.join(",");
  const rows = data.map(row =>
    columnNames
      .map(columnName => sanitizeCSVValue(row?.[columnName]))
      .join(",")
  );

  return [headers, ...rows].join("\n");
}

/**
 * Генерирует JSON-представление табличных данных.
 */
export function generateJSON(columns, data) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return "[]";
  }

  const columnNames = extractColumnNames(columns);
  if (columnNames.length === 0) {
    return JSON.stringify(rows, null, 2);
  }

  const normalized = rows.map(row => {
    const result = {};
    columnNames.forEach(columnName => {
      result[columnName] = row?.[columnName] ?? "";
    });
    return result;
  });

  return JSON.stringify(normalized, null, 2);
}

/**
 * Генерирует текстовое табличное представление данных.
 */
export function generatePlainText(columns, data) {
  const columnNames = extractColumnNames(columns);
  if (columnNames.length === 0) {
    return "";
  }

  const rows = Array.isArray(data) ? data : [];
  const tableMatrix = [
    columnNames,
    ...rows.map(row => columnNames.map(name => row?.[name] ?? "")),
  ];

  const columnWidths = columnNames.map((_, index) =>
    tableMatrix.reduce((max, currentRow) => {
      const cellValue = currentRow[index] ?? "";
      return Math.max(max, String(cellValue).length);
    }, 0)
  );

  const formatRow = values =>
    values
      .map((value, index) => String(value ?? "").padEnd(columnWidths[index], " "))
      .join(" | ")
      .trimEnd();

  const header = formatRow(columnNames);
  if (rows.length === 0) {
    return header;
  }

  const separator = columnWidths
    .map(width => (width === 0 ? "" : "-".repeat(width)))
    .join(" | ");

  const formattedRows = rows.map(row =>
    formatRow(columnNames.map(name => row?.[name] ?? ""))
  );

  return [header, separator, ...formattedRows].join("\n");
}

const CONTENT_TYPES = {
  csv: "text/csv",
  json: "application/json",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  html: "text/html",
  txt: "text/plain",
};

/**
 * Возвращает корректный MIME-тип для выбранного формата экспорта.
 */
export function getExportContentType(format) {
  if (!format) {
    return "application/octet-stream";
  }

  const key = format.toString().toLowerCase();
  return CONTENT_TYPES[key] || "application/octet-stream";
}

export const __TEST_ONLY__ = {
  FILE_ICON_CATEGORIES,
  DEFAULT_FILE_ICON,
  CONTENT_TYPES,
  extractColumnNames,
};

