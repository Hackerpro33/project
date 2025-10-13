import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'

const DEFAULT_FORM = {
  name: 'Анна Смирнова',
  email: 'anna.smirnova@example.com',
  bio: '',
  language: 'ru',
  notifications: {
    email: true,
    desktop: false,
    weekly: true,
  },
}

export default function UserPreferencesPanel() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      language: i18n.language?.startsWith('en') ? 'en' : 'ru',
    }))
  }, [i18n.language])

  const handleChange = (key) => (event) => {
    setForm((prev) => ({
      ...prev,
      [key]: event.target.value,
    }))
  }

  const handleNotificationChange = (key) => (checked) => {
    setForm((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: checked,
      },
    }))
  }

  const handleLanguageChange = (value) => {
    setForm((prev) => ({ ...prev, language: value }))
    i18n.changeLanguage(value)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 600))
      toast({
        title: t('userSettings.notifications.savedTitle'),
        description: t('userSettings.notifications.savedDescription'),
      })
    } catch (error) {
      toast({
        title: t('userSettings.notifications.errorTitle'),
        description: t('userSettings.notifications.errorDescription'),
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg dark:bg-slate-900/60">
      <form onSubmit={handleSubmit} className="space-y-6">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {t('userSettings.title')}
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            {t('userSettings.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('userSettings.profile.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('userSettings.profile.description')}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">{t('userSettings.profile.name')}</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={handleChange('name')}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">{t('userSettings.profile.email')}</Label>
                <Input
                  id="user-email"
                  value={form.email}
                  onChange={handleChange('email')}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="user-bio">{t('userSettings.profile.bio')}</Label>
                <Textarea
                  id="user-bio"
                  value={form.bio}
                  onChange={handleChange('bio')}
                  rows={3}
                  placeholder={t('userSettings.profile.bioPlaceholder')}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('userSettings.preferences.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('userSettings.preferences.description')}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-language">{t('userSettings.preferences.language')}</Label>
                <Select value={form.language} onValueChange={handleLanguageChange}>
                  <SelectTrigger id="user-language">
                    <SelectValue placeholder={t('language.ru')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">{t('language.ru')}</SelectItem>
                    <SelectItem value="en">{t('language.en')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('userSettings.preferences.theme')}</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('userSettings.preferences.themeDescription')}
                </p>
                <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                  {t('userSettings.preferences.themeHint')}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('userSettings.notifications.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('userSettings.notifications.description')}
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t('userSettings.notifications.email.title')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('userSettings.notifications.email.description')}
                  </p>
                </div>
                <Switch
                  checked={form.notifications.email}
                  onCheckedChange={handleNotificationChange('email')}
                  aria-label={t('userSettings.notifications.email.title')}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t('userSettings.notifications.desktop.title')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('userSettings.notifications.desktop.description')}
                  </p>
                </div>
                <Switch
                  checked={form.notifications.desktop}
                  onCheckedChange={handleNotificationChange('desktop')}
                  aria-label={t('userSettings.notifications.desktop.title')}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {t('userSettings.notifications.weekly.title')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('userSettings.notifications.weekly.description')}
                  </p>
                </div>
                <Switch
                  checked={form.notifications.weekly}
                  onCheckedChange={handleNotificationChange('weekly')}
                  aria-label={t('userSettings.notifications.weekly.title')}
                />
              </div>
            </div>
          </section>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-slate-200/60 bg-white/70 py-4 dark:border-slate-700/60 dark:bg-slate-900/40">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? t('userSettings.actions.saving') : t('userSettings.actions.save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
