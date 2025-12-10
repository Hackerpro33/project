import React from 'react'
import { Sparkles, PlayCircle, Database, Compass } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { demoProjectSummary } from './demoProjectData'

export default function ProductOnboarding({
  onLoadDemo,
  onStartTour,
  onDismiss,
  isDemoLoaded,
  isDemoLoading,
}) {
  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />
      <CardHeader className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3 flex w-fit items-center gap-2 bg-white/15 text-xs uppercase tracking-wide text-white">
            <Sparkles className="h-3.5 w-3.5" />
            Новый пользовательский опыт
          </Badge>
          <CardTitle className="text-3xl font-semibold text-white">
            {demoProjectSummary.title}
          </CardTitle>
          <p className="mt-2 max-w-2xl text-sm text-slate-100/80">
            {demoProjectSummary.description}
          </p>
        </div>
        <Button
          variant="ghost"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={onDismiss}
        >
          Скрыть подсказки
        </Button>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="grid gap-6 md:grid-cols-3">
          <OnboardingHighlight
            icon={Database}
            title="Демо-данные"
            description="Готовые наборы: продажи, маркетинг и логистика — сразу доступны для исследования."
          />
          <OnboardingHighlight
            icon={Compass}
            title="Тур по интерфейсу"
            description="Пошаговое знакомство с панелью и ключевыми действиями для старта."
          />
          <OnboardingHighlight
            icon={Sparkles}
            title="Практические сценарии"
            description="Комбинируйте данные и визуализации, чтобы быстро увидеть ценность продукта."
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            size="lg"
            className="bg-white text-slate-900 hover:bg-slate-100"
            onClick={onLoadDemo}
            disabled={isDemoLoaded || isDemoLoading}
          >
            <Database className="h-5 w-5" />
            {isDemoLoaded ? 'Демо-проект загружен' : isDemoLoading ? 'Загружаем демо…' : 'Создать демо-проект'}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="bg-white/15 text-white hover:bg-white/20"
            onClick={onStartTour}
          >
            <PlayCircle className="h-5 w-5" />
            Начать тур
          </Button>
          <Button
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={onDismiss}
          >
            Мне это не нужно
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function OnboardingHighlight({ icon: Icon, title, description }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-lg">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/80">{description}</p>
    </div>
  )
}

