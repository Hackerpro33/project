import React, { useState } from 'react';
import {
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
import { FileCheck2, X } from 'lucide-react';

export default function DataImportPreview({ datasetInfo, onConfirmImport, onCancel }) {
  const [name, setName] = useState(datasetInfo.name);
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

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl heading-text">
            <FileCheck2 className="w-6 h-6 text-blue-500" />
            Предварительный просмотр и импорт данных
          </DialogTitle>
          <DialogDescription className="elegant-text">
            Проверьте данные перед импортом. Вы можете изменить название, описание и выбрать, какие столбцы импортировать.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
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
          <div className="space-y-4">
            <Label className="elegant-text">Образец данных (первые 10 строк)</Label>
            <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedColumns.map(col => <TableHead key={col.name}>{col.name}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasetInfo.sample_data?.slice(0, 10).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {selectedColumns.map(col => (
                          <TableCell key={col.name} className="text-xs">
                            {String(row[col.name] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Отмена</Button>
          <Button onClick={handleConfirm}>Импортировать {selectedColumns.length} столбцов</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}