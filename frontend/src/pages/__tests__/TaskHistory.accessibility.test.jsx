import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { renderWithProviders } from '@/test/utils.jsx'

vi.mock('@/api/tasks', () => ({
  listTaskHistory: vi.fn(),
  getTaskHistoryEntry: vi.fn(),
  previewDataset: vi.fn(),
  retryTask: vi.fn(),
}))

const TaskHistory = (await import('../TaskHistory.jsx')).default
const { listTaskHistory, getTaskHistoryEntry, previewDataset } = await import('@/api/tasks')

describe('TaskHistory accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has no detectable accessibility issues', async () => {
    listTaskHistory.mockResolvedValue({
      items: [
        {
          task_id: 'task-1',
          task_type: 'extraction',
          status: 'finished',
          updated_at: '2024-01-01T12:00:00Z',
          created_at: '2024-01-01T10:00:00Z',
          log: [
            {
              level: 'info',
              message: 'Task completed',
              timestamp: '2024-01-01T12:00:00Z',
            },
          ],
        },
      ],
      count: 1,
      limit: 50,
      offset: 0,
    })

    getTaskHistoryEntry.mockResolvedValue({
      task_id: 'task-1',
      task_type: 'extraction',
      status: 'finished',
      created_at: '2024-01-01T10:00:00Z',
      updated_at: '2024-01-01T12:00:00Z',
      params: { file_url: 'file-1' },
      log: [
        {
          level: 'info',
          message: 'Task completed',
          timestamp: '2024-01-01T12:00:00Z',
        },
      ],
      result_summary: { row_count: 100, column_count: 4 },
    })

    previewDataset.mockResolvedValue({
      mode: 'page',
      page: 1,
      has_more: false,
      rows: [
        { id: 1, value: 'foo' },
        { id: 2, value: 'bar' },
      ],
    })

    const { container } = renderWithProviders(
      <React.Suspense fallback={<div role="status">loading</div>}>
        <TaskHistory />
      </React.Suspense>,
    )

    expect(await screen.findByText('История фоновых задач')).toBeInTheDocument()
    expect(await screen.findByText('Задача task-1')).toBeInTheDocument()

    const results = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
    })
    expect(results.violations).toHaveLength(0)
  })
})

