import React, { useCallback, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CloudDownload, Globe, Link2, Loader2, RefreshCw } from 'lucide-react'

const SOURCE_OPTIONS = [
  { value: 's3', label: 'S3/MinIO (presigned URL)' },
  { value: 'minio', label: 'MinIO (presigned URL)' },
  { value: 'gdrive', label: 'Google Drive (shared link)' },
  { value: 'dropbox', label: 'Dropbox (shared link)' },
  { value: 'http', label: 'HTTP(S) ссылка' },
]

const PLACEHOLDER_EXAMPLES = [
  'https://storage.example.com/datasets/sales.csv',
  'https://drive.google.com/uc?export=download&id=FILE_ID',
  'https://dl.dropboxusercontent.com/s/example/report.parquet',
  'https://minio.local/object?X-Amz-Signature=…',
]

function deriveFilename(url) {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname || ''
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) {
      return ''
    }
    const last = segments[segments.length - 1]
    return decodeURIComponent(last)
  } catch (error) {
    return ''
  }
}

export default function LinkImportForm({ onImport, isImporting }) {
  const [sourceType, setSourceType] = useState('http')
  const [url, setUrl] = useState('')
  const [filename, setFilename] = useState('')
  const [headersJson, setHeadersJson] = useState('')
  const [error, setError] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const derivedName = useMemo(() => (!filename && url ? deriveFilename(url) : ''), [filename, url])
  const trimmedUrl = url.trim()
  const canSubmit = Boolean(trimmedUrl) && !isImporting

  const rotatePlaceholder = useCallback(() => {
    setPlaceholderIndex((index) => (index + 1) % PLACEHOLDER_EXAMPLES.length)
    if (!url) {
      setUrl(PLACEHOLDER_EXAMPLES[(placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length])
    }
  }, [placeholderIndex, url])

  const resetForm = useCallback(() => {
    setUrl('')
    setFilename('')
    setHeadersJson('')
  }, [])

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault()
    if (!trimmedUrl) {
      setError('Укажите ссылку на файл или пресайнед URL')
      return
    }

    let headers
    if (headersJson.trim()) {
      try {
        headers = JSON.parse(headersJson)
      } catch (parseError) {
        setError('Заголовки должны быть корректным JSON-объектом')
        return
      }
    }

    setError('')
    const payload = {
      sourceType,
      url: trimmedUrl,
      filename: filename.trim() || derivedName || undefined,
      headers,
    }

    const result = await onImport?.(payload)
    if (result !== false) {
      resetForm()
    }
  }, [derivedName, filename, headersJson, onImport, resetForm, sourceType, trimmedUrl])

  return (
    <Card className='border-0 bg-white/70 backdrop-blur-xl shadow-xl'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-slate-900'>
          <CloudDownload className='w-5 h-5 text-blue-500' />
          Импорт из облака или по ссылке
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 md:grid-cols-2' onSubmit={handleSubmit}>
          <div className='space-y-2'>
            <Label className='elegant-text'>Источник</Label>
            <Select value={sourceType} onValueChange={setSourceType} disabled={isImporting}>
              <SelectTrigger className='bg-white/60'>
                <SelectValue placeholder='Выберите источник' />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-xs text-slate-500 flex items-center gap-1'>
              <Globe className='w-3 h-3' />
              Поддерживаются временные ссылки, публичные шары и HTTPS-URL.
            </p>
          </div>

          <div className='space-y-2 md:col-span-2'>
            <Label className='elegant-text'>Ссылка на файл</Label>
            <div className='flex items-center gap-2'>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
                className='bg-white/60'
                disabled={isImporting}
              />
              <Link2 className='w-4 h-4 text-slate-400' />
            </div>
            <div className='flex items-center gap-2 text-xs text-slate-500'>
              <span>Используйте прямые ссылки или пресайнед URL.</span>
              <button
                type='button'
                onClick={rotatePlaceholder}
                className='inline-flex items-center gap-1 text-blue-600 hover:underline disabled:text-slate-400'
                disabled={isImporting}
              >
                <RefreshCw className='w-3 h-3' />
                Пример
              </button>
            </div>
          </div>

          <div className='space-y-2'>
            <Label className='elegant-text'>Имя файла (опционально)</Label>
            <Input
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              placeholder={derivedName || 'dataset.csv'}
              className='bg-white/60'
              disabled={isImporting}
            />
          </div>

          <div className='space-y-2'>
            <Label className='elegant-text'>HTTP-заголовки (JSON)</Label>
            <Input
              value={headersJson}
              onChange={(event) => setHeadersJson(event.target.value)}
              placeholder='{"Authorization": "Bearer ..."}'
              className='bg-white/60'
              disabled={isImporting}
            />
          </div>

          {error && (
            <div className='md:col-span-2'>
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          <div className='md:col-span-2 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-2 text-xs text-slate-500'>
              {SOURCE_OPTIONS.map((option) => (
                <Badge key={option.value} variant='outline' className='text-[11px]'>
                  {option.label}
                </Badge>
              ))}
            </div>
            <Button type='submit' disabled={!canSubmit} className='gap-2'>
              {isImporting ? (
                <>
                  <Loader2 className='w-4 h-4 animate-spin' />
                  Импорт...
                </>
              ) : (
                <>
                  <CloudDownload className='w-4 h-4' />
                  Импортировать
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
