import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, RotateCcw, Plus, X } from "lucide-react";

export default function DataRangeSelector({ dataset, onSave, savedRanges = [] }) {
  const [range, setRange] = useState({
    name: '',
    startRow: 1,
    endRow: dataset?.row_count || 100,
    selectedColumns: [],
    filters: []
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleColumnToggle = (columnName) => {
    setRange(prev => ({
      ...prev,
      selectedColumns: prev.selectedColumns.includes(columnName)
        ? prev.selectedColumns.filter(c => c !== columnName)
        : [...prev.selectedColumns, columnName]
    }));
  };

  const handleSaveRange = () => {
    if (!range.name) {
      alert('Пожалуйста, введите название диапазона');
      return;
    }
    onSave(range);
    setShowSaveDialog(false);
    setRange(prev => ({ ...prev, name: '' }));
  };

  const loadSavedRange = (savedRange) => {
    setRange(savedRange);
  };

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <Settings className="w-5 h-5 text-blue-500" />
          Выбор диапазона данных
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Saved Ranges */}
        {savedRanges.length > 0 && (
          <div className="space-y-2">
            <Label className="elegant-text">Сохраненные диапазоны</Label>
            <div className="flex flex-wrap gap-2">
              {savedRanges.map((savedRange, index) => (
                <Badge 
                  key={index}
                  variant="outline" 
                  className="cursor-pointer hover:bg-blue-50 elegant-text"
                  onClick={() => loadSavedRange(savedRange)}
                >
                  {savedRange.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Row Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="elegant-text">Начальная строка</Label>
            <Input 
              type="number" 
              value={range.startRow}
              onChange={(e) => setRange(prev => ({ ...prev, startRow: parseInt(e.target.value) }))}
              className="elegant-text"
            />
          </div>
          <div className="space-y-2">
            <Label className="elegant-text">Конечная строка</Label>
            <Input 
              type="number" 
              value={range.endRow}
              onChange={(e) => setRange(prev => ({ ...prev, endRow: parseInt(e.target.value) }))}
              className="elegant-text"
            />
          </div>
        </div>

        {/* Column Selection */}
        {dataset && dataset.columns && (
          <div className="space-y-2">
            <Label className="elegant-text">Выбранные столбцы</Label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 border rounded-lg">
              {dataset.columns.map(column => (
                <div key={column.name} className="flex items-center gap-2">
                  <Checkbox
                    id={column.name}
                    checked={range.selectedColumns.includes(column.name)}
                    onCheckedChange={() => handleColumnToggle(column.name)}
                  />
                  <Label htmlFor={column.name} className="text-sm elegant-text">
                    {column.name}
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {column.type}
                    </Badge>
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            variant="outline"
            onClick={() => setShowSaveDialog(true)}
            className="flex-1 gap-2 elegant-text"
          >
            <Save className="w-4 h-4" /> Сохранить диапазон
          </Button>
          <Button 
            variant="outline"
            onClick={() => setRange({
              name: '',
              startRow: 1,
              endRow: dataset?.row_count || 100,
              selectedColumns: [],
              filters: []
            })}
            className="gap-2 elegant-text"
          >
            <RotateCcw className="w-4 h-4" /> Сброс
          </Button>
        </div>

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
            <Label className="elegant-text">Название диапазона</Label>
            <Input 
              placeholder="например, Данные за Q1 2024"
              value={range.name}
              onChange={(e) => setRange(prev => ({ ...prev, name: e.target.value }))}
              className="elegant-text"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveRange} size="sm" className="elegant-text">
                <Save className="w-3 h-3 mr-1" /> Сохранить
              </Button>
              <Button variant="outline" onClick={() => setShowSaveDialog(false)} size="sm" className="elegant-text">
                <X className="w-3 h-3 mr-1" /> Отмена
              </Button>
            </div>
          </div>
        )}

        {/* Current Selection Summary */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2 heading-text">Текущий выбор:</h4>
          <div className="text-sm text-blue-700 space-y-1 elegant-text">
            <p>Строки: {range.startRow} - {range.endRow} ({range.endRow - range.startRow + 1} строка(и))</p>
            <p>Столбцы: {range.selectedColumns.length > 0 ? range.selectedColumns.length : 'все'} выбрано</p>
            {range.selectedColumns.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {range.selectedColumns.map(col => (
                  <Badge key={col} variant="secondary" className="text-xs">
                    {col}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}