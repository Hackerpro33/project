import React from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "react-router-dom"
import { createPageUrl } from "@/utils"
import { Upload, BarChart3, Map, TrendingUp, Sparkles, Rocket, Compass } from "lucide-react"

export default function QuickActions({ onLoadDemo, onStartTour, isDemoLoaded, isDemoLoading }) {
  const actions = [
    onLoadDemo
      ? {
          key: 'demo-project',
          title: isDemoLoaded ? 'Демо-проект готов' : 'Запустить демо-проект',
          description: isDemoLoaded
            ? 'Данные уже добавлены — можно строить графики'
            : 'Создайте пробный набор данных и визуализаций',
          icon: Rocket,
          onClick: onLoadDemo,
          gradient: 'from-violet-500 to-fuchsia-600',
          hoverGradient: 'hover:from-violet-600 hover:to-fuchsia-700',
          kpiValue: isDemoLoaded ? '100%' : '1 клик',
          kpiDescription: isDemoLoaded ? 'готовность демо' : 'до запуска',
          disabled: isDemoLoaded || isDemoLoading,
          loading: isDemoLoading,
        }
      : null,
    {
      key: 'import',
      title: 'Загрузить данные',
      description: 'Импорт файлов CSV или Excel',
      icon: Upload,
      href: createPageUrl('DataSources'),
      gradient: 'from-emerald-500 to-teal-600',
      hoverGradient: 'hover:from-emerald-600 hover:to-teal-700',
      kpiValue: '2.4 мин',
      kpiDescription: 'среднее время подготовки',
    },
    {
      key: 'charts',
      title: 'Создать график',
      description: 'Построить свои визуализации',
      icon: BarChart3,
      href: createPageUrl('Charts'),
      gradient: 'from-blue-500 to-cyan-600',
      hoverGradient: 'hover:from-blue-600 hover:to-cyan-700',
      kpiValue: '98%',
      kpiDescription: 'точность аналитики',
    },
    {
      key: 'maps',
      title: 'Визуализация на карте',
      description: 'Исследовать геоданные',
      icon: Map,
      href: createPageUrl('Maps'),
      gradient: 'from-purple-500 to-indigo-600',
      hoverGradient: 'hover:from-purple-600 hover:to-indigo-700',
      kpiValue: '12 слоёв',
      kpiDescription: 'средняя детализация',
    },
    {
      key: 'forecast',
      title: 'Локальное прогнозирование',
      description: 'Предсказать будущие тренды без подключения к сети',
      icon: TrendingUp,
      href: createPageUrl('Forecasting'),
      gradient: 'from-orange-500 to-red-600',
      hoverGradient: 'hover:from-orange-600 hover:to-red-700',
      kpiValue: '+31%',
      kpiDescription: 'прирост точности моделей',
    },
    onStartTour
      ? {
          key: 'tour',
          title: 'Пройти тур',
          description: 'Пошаговое знакомство с интерфейсом',
          icon: Compass,
          onClick: onStartTour,
          gradient: 'from-sky-500 to-indigo-600',
          hoverGradient: 'hover:from-sky-600 hover:to-indigo-700',
          kpiValue: '5 шагов',
          kpiDescription: 'длительность тура',
        }
      : null,
  ].filter(Boolean)

  const renderActionButton = (action) => {
    const baseClasses = 'h-auto w-full border-0 p-6 transition-all duration-300 group'
    const gradientClasses = action.disabled
      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
      : `bg-gradient-to-r ${action.gradient} ${action.hoverGradient} text-white shadow-lg hover:shadow-xl hover:scale-105`

    const buttonProps = {
      variant: 'outline',
      className: `${baseClasses} ${gradientClasses}`,
      onClick: action.onClick,
      disabled: action.disabled,
    }

    const content = (
      <Button {...buttonProps}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={`p-3 rounded-full ${
              action.disabled
                ? 'bg-white/40'
                : 'bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-colors'
            }`}
          >
            <action.icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              {action.loading ? 'Загружаем…' : action.title}
            </div>
            <div className="mt-1 text-xs opacity-90">
              {action.loading ? 'Подготавливаем демо-данные' : action.description}
            </div>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-wide ${
              action.disabled ? 'bg-white/40 text-slate-600' : 'bg-white/15 text-white'
            }`}
          >
            <span className="font-semibold">
              {action.loading ? '…' : action.kpiValue}
            </span>
            <span className="ml-1">
              {action.loading ? 'идёт подготовка' : action.kpiDescription}
            </span>
          </div>
        </div>
      </Button>
    )

    if (action.href && !action.onClick) {
      return (
        <Link key={action.key} to={action.href}>
          {content}
        </Link>
      )
    }

    return (
      <div key={action.key}>
        {content}
      </div>
    )
  }

  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Быстрые действия
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {actions.map((action) => renderActionButton(action))}
        </div>
      </CardContent>
    </Card>
  )
}
