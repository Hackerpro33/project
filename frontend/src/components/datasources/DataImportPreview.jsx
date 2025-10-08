import React, { useEffect, useMemo, useState } from 'react';
import { Dataset } from '@/api/entities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileCheck2, X, AlertTriangle } from 'lucide-react';

function normaliseColumns(columns = []) {
  return columns.map((column, index) => ({
    name: column?.name || column?.column || `column_${index + 1}`,
    type: column?.type || 'string',
    selected: column?.selected !== false,
  }));
}

const DEFAULT_TAGS = ['загружено', 'новое'];

export default function DataImportPreview({ datasetInfo, onConfirmImport, onCancel }) {
  if (!datasetInfo) {
    return null;
  }

  const [name, setName] = useState(datasetInfo?.name || 'Набор данных');
  const [description, setDescription] = useState(datasetInfo?.description || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(() => {
    if (Array.isArray(datasetInfo?.tags) && datasetInfo.tags.length > 0) {
      return [...datasetInfo.tags];
    }
    return [...DEFAULT_TAGS];
  });
  const [columnsState, setColumnsState] = useState(() => normaliseColumns(datasetInfo?.columns));
  const [isSaving, setIsSaving] = useState(false);
  const sampleData = useMemo(() => datasetInfo?.sample_data || [], [datasetInfo]);

  useEffect(() => {
    setName(datasetInfo?.name || 'Набор данных');
    setDescription(datasetInfo?.description || '');
    setColumnsState(normaliseColumns(datasetInfo?.columns));
    if (Array.isArray(datasetInfo?.tags) && datasetInfo.tags.length > 0) {
      setTags([...datasetInfo.tags]);
    } else {
      setTags([...DEFAULT_TAGS]);
    }
    setTagInput('');
  }, [datasetInfo]);

  const selectedColumns = useMemo(
    () => columnsState.filter((column) => column.selected),
    [columnsState],
  );

  const hasRealData = useMemo(() => {
    if (!sampleData || sampleData.length === 0) {
      return false;
    }
    return sampleData.some((row) =>
      Object.values(row).some((value) => {
        const str = String(value ?? '').toLowerCase();
        return !str.includes('пример') && !str.includes('example') && !str.includes('column');
      }),
    );
  }, [sampleData]);

  const handleColumnToggle = (columnName) => {
    setColumnsState((prev) =>
      prev.map((column) =>
        column.name === columnName ? { ...column, selected: !column.selected } : column,
      ),
    );
  };

  const handleAddTag = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) {
      setTags([...tags, value]);
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const buildPayload = () => ({
    name: name.trim() || 'Набор данных',
    description: description.trim(),
    columns: columnsState,
    tags,
  });

  const handleSubmit = async () => {
    if (isSaving) return;
    if (selectedColumns.length === 0) {
      alert('Выберите хотя бы один столбец для импорта.');
      return;
    }

    const payload = buildPayload();

    try {
      setIsSaving(true);
      if (onConfirmImport) {
        await onConfirmImport(payload);
      } else {
        await Dataset.create({
          ...payload,
          file_url: datasetInfo?.file_url || null,
          row_count: datasetInfo?.row_count ?? null,
          sample_data: datasetInfo?.sample_data ?? null,
        });
      }
    } catch (error) {
      console.error('Import failed', error);
      alert('Не удалось импортировать набор: ' + (error?.message || error));
      return;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-6xl h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl heading-text">
            <FileCheck2 className="w-6 h-6 text-blue-500" />
            Предварительный просмотр и импорт данных
          </DialogTitle>
          <DialogDescription className="elegant-text">
            Проверьте данные перед импортом. Вы можете изменить название, описание и выбрать, какие столбцы импортировать.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-1 overflow-hidden">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="elegant-text">Название набора данных</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description" className="elegant-text">Описание</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div>
              <Label className="elegant-text">Столбцы для импорта</Label>
              <ScrollArea className="h-48 p-3 border rounded-md bg-slate-50/50">
                <div className="space-y-2">
                  {columnsState.map((column) => (
                    <div key={column.name} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.name}
                        checked={column.selected}
                        onCheckedChange={() => handleColumnToggle(column.name)}
                      />
                      <Label htmlFor={column.name} className="flex-1 elegant-text text-sm">
                        {column.name}
                        <span className="text-slate-500"> ({column.type})</span>
                      </Label>
                    </div>
                  ))}
                  {columnsState.length === 0 && (
                    <p className="text-sm text-slate-500">Структура столбцов не обнаружена. Добавьте их вручную перед импортом.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
            <div>
              <Label htmlFor="tags" className="elegant-text">Теги</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="elegant-text">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 rounded-full hover:bg-slate-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Добавить тег..."
                  className="flex-1 border-none shadow-none focus-visible:ring-0 h-6 p-0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 flex flex-col">
            <Label className="elegant-text">
              Образец данных
              {!hasRealData && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Примеры данных
                </Badge>
              )}
            </Label>

            {!hasRealData && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Внимание:</strong> Не удалось автоматически извлечь данные из файла. Показаны примеры на основе структуры. Проверьте корректность столбцов перед импортом.
                </p>
              </div>
            )}

            <div className="border rounded-md overflow-hidden flex-1">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedColumns.map((column) => (
                        <TableHead key={column.name}>{column.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sampleData.slice(0, 10) || []).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {selectedColumns.map((column) => (
                          <TableCell key={column.name} className="text-xs">
                            {String(row[column.name] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {(sampleData.length === 0 || selectedColumns.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={Math.max(selectedColumns.length, 1)} className="text-center text-slate-500 py-8">
                          Нет данных для предпросмотра
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || columnsState.length === 0}>
            {isSaving ? 'Импорт...' : `Импортировать ${selectedColumns.length} столбцов`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
