import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dataset } from "@/api/entities";
import { extractDataFromUploadedFile, importDatasetFromUrl } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Filter, Plus, Search, Tag, AlertTriangle } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import PaginationControls from "@/components/common/PaginationControls";
import SavedViewsManager from "@/components/common/SavedViewsManager";
import TaskEventLog from "@/components/tasks/TaskEventLog";
import FileUploadZone from "../components/datasources/FileUploadZone";
import LinkImportForm from "../components/datasources/LinkImportForm";
import DatasetCard from "../components/datasources/DatasetCard";
import DatasetPreview from "../components/datasources/DatasetPreview";
import DataImportPreview from "../components/datasources/DataImportPreview";
import { resumableUpload } from "@/lib/resumableUpload";

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    columns: {
      type: "array",
      description:
        "Массив объектов столбцов, каждый с именем и типом данных (например, string, number, date).",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
        },
        required: ["name", "type"],
      },
    },
    row_count: {
      type: "number",
      description: "Общее количество строк в наборе данных.",
    },
    sample_data: {
      type: "array",
      description:
        "Массив объектов, представляющих первые несколько строк данных. Каждый объект — это пара ключ-значение, где ключ — имя столбца.",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
  },
  required: ["columns", "row_count", "sample_data"],
};

const createFallbackDatasetName = () => `dataset-${Date.now()}`;

const normalizeFileName = (value) => {
  if (!value) {
    return "";
  }
  const withoutQuery = value.split("?")[0].split("#")[0];
  const sanitized = withoutQuery.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return sanitized;
};

const ensureFileName = (candidate) => {
  const normalized = normalizeFileName(candidate);
  return normalized || createFallbackDatasetName();
};

const extractErrorMessage = (error, fallback) => {
  const rawMessage = error?.message || error?.detail || "";
  if (!rawMessage) {
    return fallback;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.detail === "string") {
        return parsed.detail;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch (parseError) {
    // ignore JSON parse issues and fall back to string below
  }

  return trimmed;
};

const deriveFileNameFromUrl = (value) => {
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname?.split("/")?.filter(Boolean) ?? [];
    const lastSegment = segments[segments.length - 1] ?? "";
    return normalizeFileName(decodeURIComponent(lastSegment));
  } catch (error) {
    return "";
  }
};

const buildFallbackDataset = (rawFileName, fileUrl) => {
  const safeName = ensureFileName(rawFileName);
  const baseName = safeName.replace(/\.[^/.]+$/, "");
  const fileName = baseName || createFallbackDatasetName();
  const loweredName = safeName.toLowerCase();

  const guessColumns = () => {
    if (loweredName.includes("employ") || loweredName.includes("сотрудник") || loweredName.includes("staff")) {
      return [
        { name: "Employee_ID", type: "string" },
        { name: "Full_Name", type: "string" },
        { name: "Department", type: "string" },
        { name: "Position", type: "string" },
        { name: "Hire_Date", type: "date" },
        { name: "Salary", type: "number" },
        { name: "Status", type: "string" },
      ];
    }
    if (loweredName.includes("crime") || loweredName.includes("преступ") || loweredName.includes("регион")) {
      return [
        { name: "region", type: "string" },
        { name: "crime_type", type: "string" },
        { name: "cases_count", type: "number" },
        { name: "latitude", type: "number" },
        { name: "longitude", type: "number" },
      ];
    }
    if (loweredName.includes("safety") || loweredName.includes("mta") || loweredName.includes("безопасность")) {
      return [
        { name: "Date", type: "date" },
        { name: "Agency", type: "string" },
        { name: "Location", type: "string" },
        { name: "Incident_Type", type: "string" },
        { name: "Severity", type: "string" },
        { name: "Count", type: "number" },
        { name: "Latitude", type: "number" },
        { name: "Longitude", type: "number" },
      ];
    }
    if (loweredName.includes("sales") || loweredName.includes("продажи") || loweredName.includes("revenue")) {
      return [
        { name: "Date", type: "date" },
        { name: "Product_Name", type: "string" },
        { name: "Category", type: "string" },
        { name: "Quantity", type: "number" },
        { name: "Unit_Price", type: "number" },
        { name: "Total_Amount", type: "number" },
        { name: "Region", type: "string" },
        { name: "Customer_ID", type: "string" },
      ];
    }
    return [
      { name: "column1", type: "string" },
      { name: "column2", type: "number" },
      { name: "column3", type: "string" },
      { name: "column4", type: "number" },
      { name: "column5", type: "date" },
    ];
  };

  const extension = safeName.includes(".") ? safeName.split(".").pop()?.toLowerCase() : "";
  const extensionLabel =
    extension === "xlsx" || extension === "xls"
      ? "Excel файла"
      : extension === "csv"
        ? "CSV файла"
        : extension
          ? `${extension.toUpperCase()} файла`
          : "загруженного файла";

  return {
    name: fileName,
    description: `Загруженный набор данных из ${extensionLabel} (требуется ручная настройка столбцов)`,
    file_url: fileUrl,
    columns: guessColumns(),
    row_count: 0,
    sample_data: [],
  };
};

export default function DataSources() {
  const { t } = useTranslation();

  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState([]);
  const [facets, setFacets] = useState({ tags: [], types: [], owners: [] });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 12 });
  const [totalPages, setTotalPages] = useState(0);
  const [searchMeta, setSearchMeta] = useState({ total: 0, applied_filters: {} });
  const [searchError, setSearchError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDataset, setPendingDataset] = useState(null);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const activeRequestRef = useRef(0);

  const savedViewState = useMemo(
    () => ({
      search: searchTerm,
      filters: {
        tags: selectedTags,
        types: selectedTypes,
        owners: selectedOwners,
      },
      pageSize: pagination.pageSize,
      orderBy: "-created_at",
    }),
    [searchTerm, selectedTags, selectedTypes, selectedOwners, pagination.pageSize],
  );

  const hasActiveFilters =
    Boolean(searchTerm.trim()) || selectedTags.length > 0 || selectedTypes.length > 0 || selectedOwners.length > 0;

  useEffect(() => {
    let cancelled = false;
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    setIsLoading(true);
    setSearchError(null);

    const load = async () => {
      try {
        const response = await Dataset.search({
          query: searchTerm.trim() || undefined,
          tags: selectedTags,
          types: selectedTypes,
          owners: selectedOwners,
          page: pagination.page,
          pageSize: pagination.pageSize,
          orderBy: "-created_at",
        });

        if (cancelled || activeRequestRef.current !== requestId) {
          return;
        }

        const items = Array.isArray(response?.items) ? response.items : [];
        setDatasets(items);
        setFacets({
          tags: response?.facets?.tags ?? [],
          types: response?.facets?.types ?? [],
          owners: response?.facets?.owners ?? [],
        });
        setSearchMeta({
          total: response?.total ?? items.length,
          applied_filters: response?.applied_filters ?? {},
        });
        setPagination((prev) => ({
          page: response?.page ?? prev.page,
          pageSize: response?.page_size ?? prev.pageSize,
        }));
        setTotalPages(response?.total_pages ?? 0);
      } catch (error) {
        if (cancelled || activeRequestRef.current !== requestId) {
          return;
        }
        console.error("Failed to load datasets:", error);
        setDatasets([]);
        setFacets({ tags: [], types: [], owners: [] });
        setSearchMeta({ total: 0, applied_filters: {} });
        setSearchError("Не удалось загрузить данные. Попробуйте позже.");
      } finally {
        if (!cancelled && activeRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [searchTerm, selectedTags, selectedTypes, selectedOwners, pagination.page, pagination.pageSize, refreshToken]);

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleToggle = (value, selectedValues, setValues) => {
    if (!value) {
      return;
    }
    setValues((prev) => {
      const exists = prev.includes(value);
      const next = exists ? prev.filter((item) => item !== value) : [...prev, value];
      return next;
    });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedTags([]);
    setSelectedTypes([]);
    setSelectedOwners([]);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const handleApplyView = (view) => {
    const nextTags = view?.filters?.tags ?? [];
    const nextTypes = view?.filters?.types ?? [];
    const nextOwners = view?.filters?.owners ?? [];
    const nextSearch = view?.search ?? "";
    const nextPageSize = view?.page_size ?? pagination.pageSize;

    setSearchTerm(nextSearch);
    setSelectedTags(nextTags);
    setSelectedTypes(nextTypes);
    setSelectedOwners(nextOwners);
    setPagination({ page: 1, pageSize: nextPageSize });
  };

  const processUploadResponse = async ({ fileName, uploadResponse }) => {
    const normalizedFileName = ensureFileName(fileName);
    const uploadedFileUrl = uploadResponse?.file_url;
    if (!uploadedFileUrl) {
      throw new Error("Не удалось получить ссылку на загруженный файл");
    }

    const quickExtraction = uploadResponse?.quick_extraction;
    if (quickExtraction?.columns?.length) {
      setPendingDataset({
        name: normalizedFileName.replace(/\.[^/.]+$/, ""),
        description: `Автоматически распознанный набор данных из ${normalizedFileName}`,
        file_url: uploadedFileUrl,
        columns: quickExtraction.columns || [],
        row_count: quickExtraction.row_count || 0,
        sample_data: quickExtraction.sample_data || [],
        insights: quickExtraction.insights || [],
        tags: quickExtraction.tags || [],
      });
      setShowImportPreview(true);
      return;
    }

    try {
      const extraction = await extractDataFromUploadedFile({
        file_url: uploadedFileUrl,
        json_schema: EXTRACTION_SCHEMA,
      });

      if (extraction?.status === "success" && extraction?.output?.columns?.length) {
        setPendingDataset({
          name: normalizedFileName.replace(/\.[^/.]+$/, ""),
          description: `Загруженный набор данных из ${normalizedFileName}`,
          file_url: uploadedFileUrl,
          columns: extraction.output.columns || [],
          row_count: extraction.output.row_count || 0,
          sample_data: extraction.output.sample_data || [],
        });
        setShowImportPreview(true);
        return;
      }
    } catch (error) {
      console.warn("Автоматическое извлечение данных не удалось, используем резервный режим", error);
    }

    setPendingDataset(buildFallbackDataset(normalizedFileName, uploadedFileUrl));
    setShowImportPreview(true);
  };

  const handleFileUpload = async (file) => {
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(`Ошибка: Файл слишком большой. Максимальный размер файла — ${MAX_FILE_SIZE_MB} МБ.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress({
      uploadedBytes: 0,
      totalBytes: file.size,
      percentage: 0,
      phase: "uploading",
      etaSeconds: null,
    });

    try {
      const { response } = await resumableUpload(file, {
        onProgress: (progress) => setUploadProgress(progress),
      });

      await processUploadResponse({ fileName: file.name, uploadResponse: response });
    } catch (error) {
      console.error("Ошибка обработки файла:", error);
      const fallbackMessage = "Не удалось загрузить файл. Проверьте соединение и попробуйте снова.";
      alert(extractErrorMessage(error, fallbackMessage));
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleImportFromLink = async ({ sourceType, url, filename, headers }) => {
    setIsImporting(true);
    try {
      const response = await importDatasetFromUrl({
        source_type: sourceType,
        url,
        filename,
        headers,
      });

      const remoteFileName = filename || response?.filename || deriveFileNameFromUrl(url);
      const inferredName = ensureFileName(remoteFileName);
      await processUploadResponse({ fileName: inferredName, uploadResponse: response });
      return true;
    } catch (error) {
      console.error("Ошибка импорта по ссылке:", error);
      const fallbackMessage = "Не удалось импортировать файл по ссылке. Убедитесь, что ссылка доступна и попробуйте снова.";
      alert(extractErrorMessage(error, fallbackMessage));
      return false;
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async (importConfig) => {
    if (!pendingDataset) {
      alert("Нет данных для импорта. Повторите загрузку файла.");
      return;
    }

    try {
      await Dataset.create({
        name: importConfig.name,
        description: importConfig.description,
        file_url: pendingDataset.file_url,
        columns: importConfig.columns,
        row_count: pendingDataset.row_count,
        tags: importConfig.tags,
        sample_data: pendingDataset.sample_data,
        dataset_type: importConfig.dataset_type,
        owners: importConfig.owners,
      });
      setShowImportPreview(false);
      setPendingDataset(null);
      setRefreshToken((token) => token + 1);
    } catch (error) {
      console.error("Ошибка импорта набора данных:", error);
      alert("Не удалось импортировать набор данных.");
    }
  };

  const handlePreview = (dataset) => {
    setSelectedDataset(dataset);
    setShowPreview(true);
  };

  const renderFacetGroup = (title, options, selectedValues, onToggle) => {
    if (!Array.isArray(options) || options.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const value = typeof option === "string" ? option : option?.value;
            if (!value) {
              return null;
            }
            const countLabel = typeof option === "object" && option?.count ? ` (${option.count})` : "";
            const isActive = selectedValues.includes(value);
            return (
              <Button
                key={value}
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => onToggle(value)}
              >
                <Tag className="mr-2 h-4 w-4" />
                {value}
                {countLabel}
              </Button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PageContainer className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-slate-900">
                {t("datasets.title", "Наборы данных")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-lg">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-slate-400" />
                  <Input
                    placeholder={t("datasets.searchPlaceholder", "Поиск по названию или описанию")}
                    value={searchTerm}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    className="bg-white/60 pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {t("datasets.clearFilters", "Сбросить фильтры")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-600">
                    {t("datasets.foundCount", "Найдено")}: {searchMeta.total}
                  </Badge>
                  {hasActiveFilters && (
                    <span className="text-slate-500">
                      {t("datasets.filtersApplied", "Фильтры применены")}
                    </span>
                  )}
                </div>
                <SavedViewsManager entity="dataset" state={savedViewState} onApplyView={handleApplyView} />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {renderFacetGroup(t("datasets.filterTags", "Теги"), facets.tags, selectedTags, (value) =>
                  handleToggle(value, selectedTags, setSelectedTags),
                )}
                {renderFacetGroup(t("datasets.filterTypes", "Типы"), facets.types, selectedTypes, (value) =>
                  handleToggle(value, selectedTypes, setSelectedTypes),
                )}
                {renderFacetGroup(t("datasets.filterOwners", "Владельцы"), facets.owners, selectedOwners, (value) =>
                  handleToggle(value, selectedOwners, setSelectedOwners),
                )}
              </div>
            </CardContent>
          </Card>

          {searchError && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <FileUploadZone onFileUpload={handleFileUpload} isUploading={isUploading} progress={uploadProgress} />
            <LinkImportForm onImport={handleImportFromLink} isImporting={isImporting} />
          </div>
        </div>

        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg h-fit">
          <CardContent className="space-y-4 p-6">
            <div className="text-sm text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800">{t("datasets.hints.title", "Советы по загрузке")}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t("datasets.hints.formats", "Поддерживаются CSV и Excel файлы до 25 МБ.")}</li>
                <li>{t("datasets.hints.links", "Можно импортировать данные по пресайнед ссылкам или из облачных хранилищ.")}</li>
                <li>{t("datasets.hints.preview", "Перед импортом можно скорректировать метаданные и выбрать столбцы.")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="border-0 bg-white/50 backdrop-blur-xl shadow-lg animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <div className="h-6 bg-slate-200 rounded" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-16 bg-slate-200 rounded" />
                </CardContent>
              </Card>
            ))
          : datasets.map((dataset) => (
              <DatasetCard key={dataset.id ?? dataset.name} dataset={dataset} onPreview={handlePreview} />
            ))}
      </div>

      {!isLoading && datasets.length === 0 && (
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="text-center py-12 space-y-4">
            <Database className="w-16 h-16 mx-auto text-slate-400" />
            <h3 className="text-lg font-semibold text-slate-700">{t("datasets.emptyTitle", "Нет данных")}</h3>
            <p className="text-slate-500">
              {searchTerm
                ? t("datasets.emptySearch", "По вашему запросу ничего не найдено")
                : t("datasets.emptyGeneral", "Начните с загрузки первого набора данных")}
            </p>
            <Button className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
              <Plus className="w-4 h-4" />
              {t("datasets.uploadCta", "Загрузить данные")}
            </Button>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <PaginationControls
          page={pagination.page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          isDisabled={isLoading}
        />
      )}

      <TaskEventLog />

      {showPreview && selectedDataset && (
        <DatasetPreview dataset={selectedDataset} onClose={() => setShowPreview(false)} />
      )}

      {showImportPreview && pendingDataset && (
        <DataImportPreview
          datasetInfo={pendingDataset}
          onConfirmImport={handleConfirmImport}
          onCancel={() => {
            setShowImportPreview(false);
            setPendingDataset(null);
            setRefreshToken((token) => token + 1);
          }}
        />
      )}
    </PageContainer>
  );
}
