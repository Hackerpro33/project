import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export default function PaginationControls({ page, totalPages, onPageChange, isDisabled }) {
  const { t } = useTranslation();

  const handlePrevious = () => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  };

  const handleNext = () => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  };

  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-sm text-muted-foreground">
        {totalPages > 0
          ? t('pagination.pageOf', { current: page, total: totalPages })
          : t('pagination.empty')}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={isDisabled || page <= 1}
        >
          {t('pagination.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={isDisabled || page >= totalPages || totalPages === 0}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  );
}
