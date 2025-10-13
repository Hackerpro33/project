import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const taskEventTarget = typeof window !== 'undefined' ? new EventTarget() : null

export const TASK_EVENT_TYPES = {
  HISTORY_INVALIDATED: 'tasks:historyInvalidated',
  DETAIL_INVALIDATED: 'tasks:detailInvalidated',
  PREVIEW_INVALIDATED: 'tasks:previewInvalidated',
  EXTERNAL_UPDATE: 'tasks:externalUpdate',
}

function getEventTarget() {
  if (!taskEventTarget) {
    throw new Error('Task events are not available in the current environment')
  }
  return taskEventTarget
}

export function emitTaskEvent(type, detail = {}) {
  if (!taskEventTarget) {
    return
  }

  const event = new CustomEvent(type, { detail })
  taskEventTarget.dispatchEvent(event)
}

export function subscribeToTaskEvent(type, handler) {
  if (!taskEventTarget) {
    return () => {}
  }

  const listener = (event) => {
    handler(event.detail ?? {}, event)
  }

  const target = getEventTarget()
  target.addEventListener(type, listener)

  return () => {
    target.removeEventListener(type, listener)
  }
}

function setupExternalEventStream() {
  if (typeof window === 'undefined' || !('EventSource' in window)) {
    return undefined
  }

  try {
    const source = new EventSource('/api/tasks/events')

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (payload?.task_id) {
          emitTaskEvent(TASK_EVENT_TYPES.EXTERNAL_UPDATE, { taskId: payload.task_id })
        }
      } catch (parseError) {
        console.warn('Failed to parse task event payload', parseError)
      }
    }

    source.onerror = () => {
      source.close()
    }

    return source
  } catch (error) {
    console.warn('Task event stream unavailable', error)
    return undefined
  }
}

export function TaskEventProvider({ children }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubscribeHistory = subscribeToTaskEvent(
      TASK_EVENT_TYPES.HISTORY_INVALIDATED,
      ({ taskId } = {}) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'history'] })
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', { taskId }] })
        }
      },
    )

    const unsubscribeDetail = subscribeToTaskEvent(
      TASK_EVENT_TYPES.DETAIL_INVALIDATED,
      ({ taskId } = {}) => {
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', { taskId }] })
        }
      },
    )

    const unsubscribePreview = subscribeToTaskEvent(
      TASK_EVENT_TYPES.PREVIEW_INVALIDATED,
      ({ fileUrl } = {}) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'preview'] })
        if (fileUrl) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'preview', { fileUrl }] })
        }
      },
    )

    const unsubscribeExternal = subscribeToTaskEvent(
      TASK_EVENT_TYPES.EXTERNAL_UPDATE,
      ({ taskId } = {}) => {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'history'] })
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', { taskId }] })
        }
      },
    )

    const eventSource = setupExternalEventStream()

    return () => {
      unsubscribeHistory()
      unsubscribeDetail()
      unsubscribePreview()
      unsubscribeExternal()
      eventSource?.close()
    }
  }, [queryClient])

  return children
}

