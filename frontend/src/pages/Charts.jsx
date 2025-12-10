import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Filter, LineChart, PieChartIcon, TrendingUp } from 'lucide-react'

import PageContainer from '@/components/layout/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'

const TIME_RANGES = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
]

const SEGMENTS = ['Все сегменты', 'EMEA', 'APAC', 'Америка']

const LINE_DATA = [
  { date: '01.02', revenue: 420, forecast: 400 },
  { date: '02.02', revenue: 460, forecast: 430 },
  { date: '03.02', revenue: 512, forecast: 445 },
  { date: '04.02', revenue: 498, forecast: 452 },
  { date: '05.02', revenue: 545, forecast: 470 },
  { date: '06.02', revenue: 568, forecast: 490 },
  { date: '07.02', revenue: 590, forecast: 505 },
]

const AREA_DATA = [
  { date: 'Янв', adoption: 45, churn: 7 },
  { date: 'Фев', adoption: 52, churn: 6 },
  { date: 'Мар', adoption: 58, churn: 6 },
  { date: 'Апр', adoption: 63, churn: 5 },
  { date: 'Май', adoption: 67, churn: 5 },
  { date: 'Июн', adoption: 70, churn: 4 },
]

const INSIGHTS = [
  'Конверсия в оплату выросла на 4.6% после запуска нового онбординга.',
  'Самая высокая выручка — в сегменте EMEA, +18% к прошлому месяцу.',
  'APAC демонстрирует стабильный рост NPS, удержание +3.2 п.п. за месяц.',
]

function MetricCard({ icon: Icon, label, value, delta, tone = 'neutral' }) {
  const deltaClass =
    tone === 'positive'
      ? 'text-emerald-500'
      : tone === 'negative'
        ? 'text-rose-500'
        : 'text-slate-500'

  return (
    <Card className="border-none bg-white/70 p-5 shadow-sm backdrop-blur dark:bg-slate-900/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{value}</p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      {delta ? <p className={`mt-3 text-sm font-medium ${deltaClass}`}>{delta}</p> : null}
    </Card>
  )
}

export default function Charts() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState(TIME_RANGES[1].value)
  const [segment, setSegment] = useState(SEGMENTS[0])

  const filteredLineData = useMemo(() => {
    if (timeRange === '7d') {
      return LINE_DATA.slice(-7)
    }
    if (timeRange === '30d') {
      return [...LINE_DATA, ...LINE_DATA, ...LINE_DATA, ...LINE_DATA.slice(0, 2)].map((item, index) => ({
        ...item,
        date: `${index + 1}`.padStart(2, '0'),
      }))
    }
    return [...LINE_DATA, ...LINE_DATA, ...LINE_DATA, ...LINE_DATA].map((item, index) => ({
      ...item,
      date: `${index + 1}`.padStart(2, '0'),
    }))
  }, [timeRange])

  return (
    <PageContainer>
      <div className="space-y-8">
        <header className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-indigo-600 via-slate-900 to-slate-950 p-8 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs uppercase tracking-wide">
                <TrendingUp className="h-4 w-4" aria-hidden />
                {t('navigation.charts')}
              </div>
              <h1 className="text-3xl font-semibold leading-tight">
                Интерактивные дашборды и автоматические инсайты по ключевым метрикам
              </h1>
              <p className="text-sm text-slate-200">
                Сравнивайте сценарии, переключайтесь между сегментами и экспортируйте графики для презентаций.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TIME_RANGES.map((option) => (
                <Button
                  key={option.value}
                  variant={timeRange === option.value ? 'default' : 'secondary'}
                  onClick={() => setTimeRange(option.value)}
                  size="sm"
                  className={
                    timeRange === option.value
                      ? 'bg-white text-slate-900 hover:bg-slate-100'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-100">
            <Filter className="h-4 w-4" aria-hidden />
            <span>Активный сегмент:</span>
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((item) => (
                <Badge
                  key={item}
                  onClick={() => setSegment(item)}
                  className={`cursor-pointer rounded-full border border-white/40 px-3 py-1 text-xs transition ${
                    segment === item ? 'bg-white text-slate-900' : 'bg-white/10 text-white'
                  }`}
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard icon={BarChart3} label="Выручка" value="₽ 18.4M" delta="▲ 12.8% за период" tone="positive" />
          <MetricCard icon={LineChart} label="Конверсия" value="6.2%" delta="▲ 0.4 п.п." tone="positive" />
          <MetricCard icon={PieChartIcon} label="Отток" value="3.1%" delta="▼ 0.7 п.п." tone="negative" />
        </section>

        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="w-full justify-start rounded-2xl bg-white/70 p-1 backdrop-blur dark:bg-slate-900/60">
            <TabsTrigger value="performance" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Производительность
            </TabsTrigger>
            <TabsTrigger value="product" className="rounded-xl px-4 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Продуктовая аналитика
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">
            <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
              <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    Динамика выручки и прогноз сегмента {segment}
                  </CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Серая линия — прогноз, синяя — фактические значения за выбранный период
                  </p>
                </div>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {timeRange === '7d' ? 'Последние 7 дней' : timeRange === '30d' ? 'Последние 30 дней' : 'Последние 90 дней'}
                </Badge>
              </CardHeader>
              <CardContent className="h-80 px-2 pb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart data={filteredLineData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" stroke="rgba(148, 163, 184, 0.3)" />
                    <XAxis dataKey="date" stroke="rgba(100,116,139,0.8)" />
                    <YAxis stroke="rgba(100,116,139,0.8)" />
                    <Tooltip cursor={{ stroke: 'rgba(79,70,229,0.2)', strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="revenue" stroke="#312e81" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                    <Line type="monotone" dataKey="forecast" stroke="#94a3b8" strokeDasharray="6 6" strokeWidth={2} dot={false} />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  Удержание пользователей и скорость внедрения функций
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72 px-2 pb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={AREA_DATA} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAdoption" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorChurn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 8" stroke="rgba(148, 163, 184, 0.3)" />
                    <XAxis dataKey="date" stroke="rgba(100,116,139,0.8)" />
                    <YAxis stroke="rgba(100,116,139,0.8)" />
                    <Tooltip />
                    <Area type="monotone" dataKey="adoption" stroke="#4338ca" fill="url(#colorAdoption)" strokeWidth={3} />
                    <Area type="monotone" dataKey="churn" stroke="#ea580c" fill="url(#colorChurn)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="product">
            <Card className="border-none bg-white/80 p-0 shadow-sm dark:bg-slate-900/60">
              <CardHeader className="px-6 py-5">
                <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                  Воронка активации и вовлечённости по сегментам
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-5 text-sm text-slate-600 dark:text-slate-300">
                <p>
                  72% новых пользователей проходят ключевую активацию в первый день. Пользователи, завершившие обучение,
                  совершают первую покупку в среднем через 18 часов. Самый быстрый путь — сегмент APAC.
                </p>
                <Separator className="bg-slate-200/70 dark:bg-slate-800" />
                <div className="grid gap-3 md:grid-cols-2">
                  {SEGMENTS.map((item) => (
                    <div key={item} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{item}</h3>
                        <Badge variant="outline" className="border-indigo-200 text-indigo-600 dark:border-indigo-500 dark:text-indigo-200">
                          34% вовлечённость
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Конверсия в повторные действия выше среднего на 6.3 п.п.
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="border-none bg-white/70 p-0 shadow-sm dark:bg-slate-900/60">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                Автоматические инсайты
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-6 pb-6">
              {INSIGHTS.map((insight, index) => (
                <div
                  key={insight}
                  className="flex items-start gap-3 rounded-2xl bg-indigo-50/80 p-4 text-sm text-slate-700 dark:bg-indigo-950/40 dark:text-slate-200"
                >
                  <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p>{insight}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-none bg-white/70 p-0 shadow-sm dark:bg-slate-900/60">
            <CardHeader className="px-6 py-5">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                Следующие шаги команды
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
                <p className="font-medium text-slate-800 dark:text-slate-100">Эксперимент с персонализированными офферами</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Старт 15 февраля • Ответственный: команда роста</p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
                <p className="font-medium text-slate-800 dark:text-slate-100">Запуск новой витрины аналитики для EMEA</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Пилот на группу клиентов с ARPA &gt; 1.2M</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
  )
}
