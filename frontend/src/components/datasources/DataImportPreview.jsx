import React, { useState } from 'react';
import {
import { Dataset } from '@/api/entities';
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCheck2, X, AlertTriangle } from 'lucide-react';

export default function DataImportPreview({ datasetInfo, onConfirmImport, onCancel }) {
  const [name, setName] = useState(datasetInfo.name);
  
  const handleImport = async () => {
    try {
      setSaving && setSaving(true);
      const payload = {
        name: (datasetName || name || 'Набор данных'),
        description: description || '',
        tags: Array.isArray(tags) ? tags : [],
        columns: (selectedColumns || columns || []).map(c => ({ name: c.name || c.column || 'column', type: c.type || 'string', selected: c.selected !== false })),
        file_url: fileUrl || file_url || null,
        row_count: extraction?.row_count ?? null,
        sample_data: Array.isArray(extraction?.sample_data) ? extraction.sample_data.slice(0,50) : null
      };
      await Dataset.create(payload);
      if (typeof loadDatasets === 'function') await loadDatasets();
      if (typeof onClose === 'function') onClose();
    } catch (e) {
      console.error('Import failed', e);
      alert('Не удалось импортировать набор: ' + (e?.message || e));
    } finally {
      setSaving && setSaving(false);
    }
  };
const [description, setDescription] = useState(datasetInfo.description);
  const [selectedColumns, setSelectedColumns] = useState(datasetInfo.columns || []);
  const [tags, setTags] = useState(["загружено", "новое"]);
  const [tagInput, setTagInput] = useState("");

  const handleColumnToggle = (column) => {
    setSelectedColumns(prev => 
      prev.some(c => c.name === column.name)
        ? prev.filter(c => c.name !== column.name)
        : [...prev, column]
    );
  };
  
  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleConfirm = () => {
    onConfirmImport({
      name,
      description,
      columns: selectedColumns,
      tags
    });
  };

  const hasRealData = datasetInfo.sample_data && datasetInfo.sample_data.length > 0 && 
                     !datasetInfo.sample_data.every(row => 
                       Object.values(row).some(val => 
                         String(val).includes('Пример') || 
                         String(val).includes('Example') ||
                         String(val).includes('column')
                       )
                     );

  return (
    <Dialog open={true} onOpenChange={onCancel}>
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
          {/* Left Panel: Configuration */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="elegant-text">Название набора данных</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="description" className="elegant-text">Описание</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label className="elegant-text">Столбцы для импорта</Label>
              <ScrollArea className="h-48 p-3 border rounded-md bg-slate-50/50">
                <div className="space-y-2">
                  {datasetInfo.columns.map(col => (
                    <div key={col.name} className="flex items-center space-x-2">
                      <Checkbox
                        id={col.name}
                        checked={selectedColumns.some(c => c.name === col.name)}
                        onCheckedChange={() => handleColumnToggle(col)}
                      />
                      <Label htmlFor={col.name} className="flex-1 elegant-text text-sm">
                        {col.name} <span className="text-slate-500">({col.type})</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div>
              <Label htmlFor="tags" className="elegant-text">Теги</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="elegant-text">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-1 rounded-full hover:bg-slate-300">
                      <X className="w-3 h-3"/>
                    </button>
                  </Badge>
                ))}
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Добавить тег..."
                  className="flex-1 border-none shadow-none focus-visible:ring-0 h-6 p-0"
                />
              </div>
            </div>
          </div>
          
          {/* Right Panel: Data Sample */}
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
                  <strong>Внимание:</strong> Не удалось автоматически извлечь данные из файла. 
                  Показаны примеры на основе структуры. Проверьте корректность столбцов перед импортом.
                </p>
              </div>
            )}
            
            <div className="border rounded-md overflow-hidden flex-1">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedColumns.map(col => <TableHead key={col.name}>{col.name}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(datasetInfo.sample_data?.slice(0, 10) || []).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {selectedColumns.map(col => (
                          <TableCell key={col.name} className="text-xs">
                            {String(row[col.name] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {(!datasetInfo.sample_data || datasetInfo.sample_data.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={selectedColumns.length} className="text-center text-slate-500 py-8">
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
          <Button variant="outline" onClick={onCancel}>Отмена</Button>
          <Button onClick={handleImport} onClick={handleConfirm} onClick={handleImport}>Импортировать {selectedColumns.length} столбцов</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}