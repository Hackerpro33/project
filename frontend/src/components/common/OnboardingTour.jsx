import { useCallback, useEffect, useMemo, useState } from 'react'
import Joyride, { STATUS } from 'react-joyride'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'analyzer:onboarding:v1'

export default function OnboardingTour() {
  const { t } = useTranslation()
  const [run, setRun] = useState(false)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsClient(true)
    }
  }, [])

  const steps = useMemo(() => [
    {
      target: 'body',
      placement: 'center',
      disableBeacon: true,
      title: t('onboarding.steps.welcome.title'),
      content: t('onboarding.steps.welcome.content'),
    },
    {
      target: '[data-tour="sidebar-navigation"]',
      title: t('onboarding.steps.navigation.title'),
      content: t('onboarding.steps.navigation.content'),
      placement: 'right',
    },
    {
      target: '[data-tour="quick-actions"]',
      title: t('onboarding.steps.quickActions.title'),
      content: t('onboarding.steps.quickActions.content'),
      placement: 'bottom',
    },
    {
      target: '[data-tour="task-status-panel"]',
      title: t('onboarding.steps.taskPanel.title'),
      content: t('onboarding.steps.taskPanel.content'),
      placement: 'left',
    },
    {
      target: '[data-tour="theme-toggle"]',
      title: t('onboarding.steps.theme.title'),
      content: t('onboarding.steps.theme.content'),
      placement: 'bottom',
    },
  ], [t])

  useEffect(() => {
    if (!isClient) return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        setRun(true)
      }
    } catch (error) {
      setRun(true)
    }
  }, [isClient])

  const handleCallback = useCallback((data) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, '1')
        } catch (error) {
          // ignore
        }
      }
    }
  }, [])

  if (!isClient) {
    return null
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      disableOverlayClose
      showSkipButton
      showProgress
      scrollToFirstStep
      callback={handleCallback}
      locale={{
        back: t('onboarding.controls.back'),
        close: t('onboarding.controls.close'),
        last: t('onboarding.controls.finish'),
        next: t('onboarding.controls.next'),
        skip: t('onboarding.controls.skip'),
      }}
      styles={{
        options: {
          zIndex: 50,
          primaryColor: '#6366f1',
          backgroundColor: 'var(--background)',
          textColor: 'var(--foreground)',
        },
      }}
    />
  )
}
