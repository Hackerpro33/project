import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppPreferencesStore } from '@/store/appPreferences.js'

const REFRESH_INTERVAL_OPTIONS = [
  { value: 15_000 },
  { value: 30_000 },
  { value: 60_000 },
  { value: 120_000 },
]

function formatIntervalLabel(t, interval) {
  const seconds = Math.round(interval / 1000)
  if (seconds % 60 === 0) {
    const minutes = Math.round(seconds / 60)
    return t('preferences.autoRefresh.intervalMinutes', { count: minutes })
  }

  return t('preferences.autoRefresh.intervalSeconds', { count: seconds })
}

export default function AutoRefreshController() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const autoRefreshEnabled = useAppPreferencesStore((state) => state.autoRefreshEnabled)
  const autoRefreshInterval = useAppPreferencesStore((state) => state.autoRefreshInterval)
  const setAutoRefreshEnabled = useAppPreferencesStore((state) => state.setAutoRefreshEnabled)
  const setAutoRefreshInterval = useAppPreferencesStore((state) => state.setAutoRefreshInterval)

  const options = useMemo(
    () =>
      REFRESH_INTERVAL_OPTIONS.map((option) => ({
        value: option.value,
        label: formatIntervalLabel(t, option.value),
      })),
    [t],
  )

  const handleToggle = (checked) => {
    setAutoRefreshEnabled(checked)
    if (checked) {
      queryClient.invalidateQueries({ type: 'active' })
    }
  }

  const handleIntervalChange = (value) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }

    setAutoRefreshInterval(parsed)
    queryClient.invalidateQueries({ type: 'active' })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Switch id="auto-refresh-toggle" checked={autoRefreshEnabled} onCheckedChange={handleToggle} />
        <Label htmlFor="auto-refresh-toggle" className="text-xs text-slate-300">
          {t('preferences.autoRefresh.title')}
        </Label>
      </div>
      <Select
        value={String(autoRefreshInterval)}
        onValueChange={handleIntervalChange}
        disabled={!autoRefreshEnabled}
      >
        <SelectTrigger className="w-32 bg-slate-800/70 border-slate-700 text-slate-200">
          <SelectValue placeholder={t('preferences.autoRefresh.intervalLabel')} />
        </SelectTrigger>
        <SelectContent className="bg-slate-900 text-slate-200">
          {options.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
