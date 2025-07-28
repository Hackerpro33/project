
import React, { useState, useEffect, useRef } from "react";
import { Dataset } from "@/api/entities";
import { ExtractDataFromUploadedFile, UploadFile } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  Database, 
  Tag,
  Calendar,
  BarChart,
  Search,
  Filter,
  Plus
} from "lucide-react";
import { format } from "date-fns";

import FileUploadZone from "../components/datasources/FileUploadZone";
import DatasetCard from "../components/datasources/DatasetCard";
import DatasetPreview from "../components/datasources/DatasetPreview";

export default function DataSources() {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await Dataset.list('-created_date');
      setDatasets(data);
    } catch (error) {
      console.error('Ошибка загрузки наборов данных:', error);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (file) => {
    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      
      const result = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            columns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" }
                }
              }
            },
            row_count: { type: "number" },
            sample_data: { type: "array" }
          }
        }
      });

      if (result.status === "success" && result.output) {
        const datasetData = {
          name: file.name.replace(/\.[^/.]+$/, ""),
          description: `Загруженный набор данных из ${file.name}`,
          file_url,
          columns: result.output.columns || [],
          row_count: result.output.row_count || 0,
          tags: ["загружено", "новое"]
        };

        await Dataset.create(datasetData);
        await loadDatasets();
      }
    } catch (error) {
      console.error('Ошибка обработки файла:', error);
    }
    setIsUploading(false);
  };

  const filteredDatasets = datasets.filter(dataset =>
    dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dataset.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePreview = (dataset) => {
    setSelectedDataset(dataset);
    setShowPreview(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Источники данных
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Загружайте и управляйте вашими наборами данных. Превращайте сырые данные в мощные инсайты.
          </p>
        </div>

        {/* Upload Section */}
        <FileUploadZone 
          onFileUpload={handleFileUpload}
          isUploading={isUploading}
        />

        {/* Search and Filters */}
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Искать наборы данных..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-slate-200 focus:border-blue-500 bg-white/50"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Фильтр
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Tag className="w-4 h-4" />
                  Теги
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Datasets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <Card key={i} className="border-0 bg-white/50 backdrop-blur-xl shadow-lg animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <div className="h-6 bg-slate-200 rounded"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-16 bg-slate-200 rounded"></div>
                </CardContent>
              </Card>
            ))
          ) : (
            filteredDatasets.map(dataset => (
              <DatasetCard 
                key={dataset.id}
                dataset={dataset}
                onPreview={handlePreview}
              />
            ))
          )}
        </div>

        {!isLoading && filteredDatasets.length === 0 && (
          <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
            <CardContent className="text-center py-12">
              <Database className="w-16 h-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Наборы данных не найдены</h3>
              <p className="text-slate-500 mb-6">
                {searchTerm ? "Попробуйте изменить условия поиска" : "Загрузите свой первый набор данных, чтобы начать"}
              </p>
              <Button className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
                <Plus className="w-4 h-4" />
                Загрузить данные
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Dataset Preview Modal */}
        {showPreview && (
          <DatasetPreview 
            dataset={selectedDataset}
            onClose={() => setShowPreview(false)}
          />
        )}
      </div>
    </div>
  );
}
