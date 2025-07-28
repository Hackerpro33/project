import React, { useState } from 'react';
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function DataRangeSelector({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [fromDate, setFromDate] = useState(value?.from ? format(value.from, 'yyyy-MM-dd') : '');
  const [toDate, setToDate] = useState(value?.to ? format(value.to, 'yyyy-MM-dd') : '');

  const handleApply = () => {
    const range = {};
    
    if (fromDate) {
      range.from = new Date(fromDate);
    }
    
    if (toDate) {
      range.to = new Date(toDate);
    }
    
    if (range.from || range.to) {
      onChange(range);
    } else {
      onChange(null);
    }
    
    setIsOpen(false);
  };

  const handleClear = () => {
    setFromDate('');
    setToDate('');
    onChange(null);
    setIsOpen(false);
  };

  const displayText = () => {
    if (value?.from && value?.to) {
      return `${format(value.from, 'dd.MM.yyyy')} - ${format(value.to, 'dd.MM.yyyy')}`;
    } else if (value?.from) {
      return `С ${format(value.from, 'dd.MM.yyyy')}`;
    } else if (value?.to) {
      return `До ${format(value.to, 'dd.MM.yyyy')}`;
    }
    return 'Выберите диапазон дат';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal"
          onClick={() => setIsOpen(true)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className={!value?.from && !value?.to ? "text-muted-foreground" : ""}>
            {displayText()}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-date">Дата начала</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="to-date">Дата окончания</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full"
            />
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApply} className="flex-1">
              Применить
            </Button>
            <Button size="sm" variant="outline" onClick={handleClear} className="flex-1">
              Очистить
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}