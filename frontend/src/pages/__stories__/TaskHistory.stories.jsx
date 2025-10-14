import React, { useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import TaskHistory from '../TaskHistory.jsx'

const historyKey = ['tasks', 'history', {}]
const detailKey = ['tasks', 'detail', { taskId: 'task-1' }]
const previewKey = ['tasks', 'preview', { fileUrl: 'file-1', mode: 'page', page: 1, page_size: 5 }]

const historyPayload = {
  items: [
    {
      task_id: 'task-1',
      task_type: 'extraction',
      status: 'finished',
      created_at: '2024-01-01T10:00:00Z',
      updated_at: '2024-01-01T12:00:00Z',
      log: [
        {
          level: 'info',
          message: 'Task completed successfully',
          timestamp: '2024-01-01T12:00:00Z',
        },
      ],
    },
    {
      task_id: 'task-2',
      task_type: 'extraction',
      status: 'failed',
      created_at: '2024-01-02T10:00:00Z',
      updated_at: '2024-01-02T12:30:00Z',
      log: [
        {
          level: 'error',
          message: 'Network timeout',
          timestamp: '2024-01-02T12:30:00Z',
        },
      ],
    },
  ],
  count: 2,
  limit: 50,
  offset: 0,
}

const detailPayload = {
  task_id: 'task-1',
  task_type: 'extraction',
  status: 'finished',
  created_at: '2024-01-01T10:00:00Z',
  updated_at: '2024-01-01T12:00:00Z',
  params: { file_url: 'file-1' },
  parent_task_id: null,
  result_summary: { row_count: 1200, column_count: 12 },
  log: historyPayload.items[0].log,
}

const previewPayload = {
  mode: 'page',
  page: 1,
  has_more: false,
  rows: [
    { id: 1, city: 'Москва', amount: 1234 },
    { id: 2, city: 'Санкт-Петербург', amount: 987 },
    { id: 3, city: 'Новосибирск', amount: 456 },
  ],
}

function SeededTaskHistory() {
  const queryClient = useQueryClient()
  const seededRef = useRef(false)

  if (!seededRef.current) {
    queryClient.setQueryData(historyKey, historyPayload)
    queryClient.setQueryData(detailKey, detailPayload)
    queryClient.setQueryData(previewKey, previewPayload)
    seededRef.current = true
  }

  return <TaskHistory />
}

const meta = {
  title: 'Pages/TaskHistory',
  component: SeededTaskHistory,
}

export default meta

export const Default = {
  render: () => <SeededTaskHistory />,
}

