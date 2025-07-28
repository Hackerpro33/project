import React, { useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Database, Sparkles } from "lucide-react";

export default function FileUploadZone({ onFileUpload, isUploading }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = React.useState(false);

  const handleDrag = React.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = React.useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileUpload(files[0]);
    }
  }, [onFileUpload]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onFileUpload(files[0]);
    }
  };

  return (
    <Card 
      className={`border-2 border-dashed transition-all duration-300 ${
        dragActive 
          ? "border-blue-400 bg-blue-50/50 scale-102" 
          : "border-slate-200 bg-white/50 hover:border-slate-300"
      } backdrop-blur-xl shadow-xl`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <CardContent className="p-12">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 mx-auto bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
              <Database className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-slate-900 heading-text">
              Загрузите ваш набор данных
            </h3>
            <p className="text-slate-600 max-w-md mx-auto elegant-text">
              Перетащите файлы CSV или Excel сюда, или нажмите для выбора. 
              Мы автоматически проанализируем структуру ваших данных.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500">
            <div className="flex items-center gap-2 elegant-text">
              <FileSpreadsheet className="w-4 h-4" />
              CSV файлы
            </div>
            <div className="flex items-center gap-2 elegant-text">
              <FileSpreadsheet className="w-4 h-4" />
              Excel файлы
            </div>
            <div className="flex items-center gap-2 elegant-text">
              <Database className="w-4 h-4" />
              Авто-анализ
            </div>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-3 text-lg font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 elegant-text"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                Обработка...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Выбрать файл
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}