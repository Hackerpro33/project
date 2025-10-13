
import React, { useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Database, Sparkles, Timer } from "lucide-react";

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) {
    return '0 Б'
  }
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatEta(seconds) {
  if (seconds == null) {
    return '—'
  }
  if (seconds < 1) {
    return '< 1 c'
  }
  if (seconds < 60) {
    return `${Math.round(seconds)} c`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  if (minutes < 60) {
    return `${minutes} мин ${remainingSeconds} c`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours} ч ${remainingMinutes} мин`
}

export default function FileUploadZone({ onFileUpload, isUploading, progress }) {
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
                {progress?.phase === 'processing' ? 'Завершаем...' : 'Загрузка...'}
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Выбрать файл
              </>
            )}
          </Button>

          {progress && (
            <div className="w-full mt-6 space-y-2 text-left">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="uppercase tracking-wide">Прогресс</span>
                <span>{progress.percentage ?? 0}%</span>
              </div>
              <Progress value={progress.percentage ?? 0} className="h-2" />
              <div className="flex flex-wrap justify-between text-xs text-slate-500 gap-2">
                <span>
                  {formatBytes(progress.uploadedBytes)} / {formatBytes(progress.totalBytes)}
                </span>
                <span className="flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  ETA: {formatEta(progress.etaSeconds)}
                </span>
                <span className="capitalize">
                  Этап: {progress.phase === 'uploading' && 'загрузка'}
                  {progress.phase === 'assembling' && 'сборка'}
                  {progress.phase === 'processing' && 'анализ'}
                  {progress.phase === undefined && '—'}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 pt-4 elegant-text">
            Рекомендуемый размер файла: до 25 МБ. <br/> Для больших файлов рекомендуется предварительная обработка или семплирование.
          </p>

        </div>
      </CardContent>
    </Card>
  );
}
