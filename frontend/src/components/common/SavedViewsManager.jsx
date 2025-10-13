import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createSavedView, deleteSavedView, listSavedViews } from '@/api/views';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

export default function SavedViewsManager({ entity, state, onApplyView }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [views, setViews] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadViews = async () => {
      setIsLoading(true);
      try {
        const data = await listSavedViews(entity);
        if (isMounted) {
          setViews(data);
        }
      } catch (error) {
        console.error('Failed to load saved views', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadViews();
    return () => {
      isMounted = false;
    };
  }, [entity]);

  const handleApply = (id) => {
    const view = views.find((item) => item.id === id);
    if (!view) return;
    setSelectedId(id);
    onApplyView?.(view);
  };

  const handleSave = async () => {
    const name = window.prompt(t('views.savePrompt'));
    if (!name) return;
    try {
      const payload = {
        name,
        entity,
        search: state?.search || undefined,
        filters: state?.filters || {},
        order_by: state?.orderBy,
        page_size: state?.pageSize,
      };
      const response = await createSavedView(payload);
      const newView = response.view;
      setViews((prev) => [...prev, newView]);
      setSelectedId(newView.id);
      toast({
        title: t('views.savedTitle'),
        description: t('views.savedDescription', { name }),
      });
    } catch (error) {
      console.error('Failed to save view', error);
      toast({
        title: t('views.saveErrorTitle'),
        description: t('views.saveErrorDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteSavedView(selectedId);
      setViews((prev) => prev.filter((item) => item.id !== selectedId));
      setSelectedId(null);
      toast({
        title: t('views.deletedTitle'),
        description: t('views.deletedDescription'),
      });
    } catch (error) {
      console.error('Failed to delete view', error);
      toast({
        title: t('views.deleteErrorTitle'),
        description: t('views.deleteErrorDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={selectedId ?? ''}
        onValueChange={handleApply}
        disabled={isLoading || views.length === 0}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder={t('views.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {views.map((view) => (
            <SelectItem key={view.id} value={view.id}>
              {view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={handleSave}>
        {t('views.saveCurrent')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={!selectedId}
      >
        {t('views.deleteSelected')}
      </Button>
    </div>
  );
}
