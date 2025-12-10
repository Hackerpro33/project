import React, { useEffect, useMemo, useState } from 'react'
import { Compass, BarChart3, Database, Users, Sparkles, Map, TrendingUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

const TOUR_STEPS = [
  {
    icon: Compass,
    title: 'Навигация по разделам',
    description:
      'Используйте боковое меню, чтобы переключаться между панелью, источниками данных, картами и прогнозами.',
    tip: 'Горячая клавиша «/» сразу открывает поиск по разделам.',
  },
  {
    icon: Database,
    title: 'Импортируйте наборы данных',
    description:
      'Добавляйте CSV, Excel и подключайте базы. Каждый набор автоматически получает профиль качества и теги.',
    tip: 'Следите за статусом загрузки в правом верхнем углу панели.',
  },
  {
    icon: BarChart3,
    title: 'Создавайте визуализации',
    description:
      'Конструктор графиков поддерживает линейные, столбчатые и комбинированные диаграммы с рекомендованными пресетами.',
    tip: 'Вкладка «шаблоны» подскажет оптимальный тип графика для выбранной метрики.',
  },
  {
    icon: Map,
    title: 'Работайте с геоданными',
    description:
      'Добавляйте тепловые карты, точки и полигоны, комбинируйте слои и фильтры для детального анализа.',
    tip: 'Используйте локальные фильтры карты, чтобы не менять глобальный контекст дашборда.',
  },
  {
    icon: TrendingUp,
    title: 'Стройте прогнозы локально',
    description:
      'Локальный ML-движок готовит предиктивные модели и сценарии what-if без передачи данных наружу.',
    tip: 'Откройте вкладку «Прогнозирование», чтобы сравнить модели и выгрузить результаты.',
  },
  {
    icon: Users,
    title: 'Сотрудничайте с командой',
    description:
      'Делитесь дашбордами, отслеживайте комментарии и историю изменений, назначайте задачи.',
    tip: 'Настройте роли доступа в разделе «Совместная работа».',
  },
]

export default function InterfaceTourDialog({ open, onOpenChange }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setStepIndex(0)
    }
  }, [open])

  const step = TOUR_STEPS[stepIndex]
  const progressValue = useMemo(
    () => Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100),
    [stepIndex],
  )

  const goToNext = () => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      onOpenChange(false)
      return
    }
    setStepIndex((index) => Math.min(index + 1, TOUR_STEPS.length - 1))
  }

  const goToPrevious = () => {
    setStepIndex((index) => Math.max(index - 1, 0))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="space-y-2">
          <Badge className="w-fit bg-primary/10 text-primary">Тур по интерфейсу</Badge>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-5 w-5 text-primary" />
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-base leading-relaxed text-muted-foreground">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          <Progress value={progressValue} />

          <div className="rounded-2xl border bg-muted/30 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Совет эксперта</p>
                <p>{step.tip}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Завершить тур
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goToPrevious} disabled={stepIndex === 0}>
              Назад
            </Button>
            <Button onClick={goToNext}>{stepIndex === TOUR_STEPS.length - 1 ? 'Готово' : 'Далее'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

