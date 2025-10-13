import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { listTaskHistory, getTaskHistoryEntry, previewDataset, retryTask } from '@/api/tasks'
import { emitTaskEvent, TASK_EVENT_TYPES } from '@/lib/taskEvents'
import i18n from '@/i18n'

export const TASK_HISTORY_QUERY_KEY = ['tasks', 'history']
export const TASK_DETAIL_QUERY_KEY = ['tasks', 'detail']
export const TASK_PREVIEW_QUERY_KEY = ['tasks', 'preview']

function normalizeObject(values = {}) {
  return Object.keys(values)
    .filter((key) => {
      const value = values[key]
      if (value === undefined || value === null) {
        return false
      }
      if (typeof value === 'string') {
        return value.trim() !== ''
      }
      return true
    })
    .sort()
    .reduce((acc, key) => {
      acc[key] = values[key]
      return acc
    }, {})
}

export function useTaskHistoryQuery(filters = {}, options = {}) {
  const normalizedFilters = useMemo(() => normalizeObject(filters), [filters])

  return useQuery({
    queryKey: [...TASK_HISTORY_QUERY_KEY, normalizedFilters],
    queryFn: () => listTaskHistory(normalizedFilters),
    suspense: true,
    meta: {
      errorMessage: {
        title: i18n.t('taskHistory.loadErrorTitle'),
        description: i18n.t('taskHistory.loadErrorDescription'),
      },
      ...(options.meta || {}),
    },
    ...options,
  })
}

export function useTaskDetailQuery(taskId, options = {}) {
  const queryKey = useMemo(() => [...TASK_DETAIL_QUERY_KEY, { taskId }], [taskId])

  return useQuery({
    queryKey,
    enabled: Boolean(taskId),
    suspense: Boolean(taskId) && options.suspense !== false,
    queryFn: () => getTaskHistoryEntry(taskId),
    meta: {
      errorMessage: {
        title: i18n.t('taskHistory.detailErrorTitle'),
        description: i18n.t('taskHistory.detailErrorDescription'),
      },
      ...(options.meta || {}),
    },
    ...options,
  })
}

function normalizePreviewParams(params = {}) {
  const { fileUrl, mode = 'page', page = 1, pageSize = 25 } = params
  const normalizedMode = mode === 'sample' ? 'sample' : 'page'

  const previewOptions = normalizedMode === 'page'
    ? { mode: 'page', page, page_size: pageSize }
    : { mode: 'sample', sample_size: pageSize }

  return {
    fileUrl,
    previewOptions,
    key: normalizeObject({ fileUrl, ...previewOptions }),
  }
}

export function useTaskPreviewQuery(params = {}, options = {}) {
  const { fileUrl, previewOptions, key } = useMemo(() => normalizePreviewParams(params), [params])

  return useQuery({
    queryKey: [...TASK_PREVIEW_QUERY_KEY, key],
    enabled: Boolean(fileUrl) && (options.enabled ?? true),
    suspense: Boolean(options.suspense),
    queryFn: () => previewDataset(fileUrl, previewOptions),
    meta: {
      errorMessage: {
        title: i18n.t('taskHistory.previewErrorTitle'),
        description: i18n.t('taskHistory.previewErrorDescription'),
      },
      ...(options.meta || {}),
    },
    ...options,
  })
}

export function useRetryTaskMutation(options = {}) {
  const { meta: metaOverrides, onSuccess: userOnSuccess, ...rest } = options

  return useMutation({
    mutationFn: (taskId) => retryTask(taskId),
    meta: {
      successMessage: ({ payload }) => ({
        title: i18n.t('taskHistory.retrySuccessTitle'),
        description: i18n.t('taskHistory.retrySuccessDescription', {
          taskId: payload?.task_id,
        }),
      }),
      errorMessage: {
        title: i18n.t('taskHistory.retryErrorTitle'),
        description: i18n.t('taskHistory.retryErrorDescription'),
      },
      ...metaOverrides,
    },
    onSuccess: (data, variables, context) => {
      emitTaskEvent(TASK_EVENT_TYPES.HISTORY_INVALIDATED, { taskId: data?.task_id })
      emitTaskEvent(TASK_EVENT_TYPES.DETAIL_INVALIDATED, { taskId: variables })
      userOnSuccess?.(data, variables, context)
    },
    ...rest,
  })
}

