import { startResumableUpload, uploadResumableChunk, finishResumableUpload, presignResumableChunk } from '@/api/integrations'

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024
const MIN_CHUNK_SIZE = 256 * 1024

function arrayBufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer)
  const hexCodes = Array.from(byteArray, (byte) => byte.toString(16).padStart(2, '0'))
  return hexCodes.join('')
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return arrayBufferToHex(digest)
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage
}

function buildCacheKey(file, checksum) {
  return `resumable:${file.name}:${file.size}:${checksum}`
}

function loadCachedState(key) {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('Failed to parse cached upload state', error)
    return null
  }
}

function persistCachedState(key, state) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(state))
}

function clearCachedState(key) {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(key)
}

function calculateUploadedBytes(uploadedChunks, chunkSize, totalSize) {
  return uploadedChunks.reduce((acc, chunkIndex) => {
    const start = chunkIndex * chunkSize
    const end = Math.min(start + chunkSize, totalSize)
    return acc + Math.max(end - start, 0)
  }, 0)
}

function emitProgress(callback, { uploadedBytes, totalSize, phase, startedAt }) {
  if (!callback) return
  const percentage = totalSize > 0 ? Math.round((uploadedBytes / totalSize) * 100) : 0
  const elapsedSeconds = (Date.now() - startedAt) / 1000
  const speed = elapsedSeconds > 0 ? uploadedBytes / elapsedSeconds : 0
  const remainingBytes = Math.max(totalSize - uploadedBytes, 0)
  const etaSeconds = speed > 0 ? remainingBytes / speed : null
  callback({
    uploadedBytes,
    totalBytes: totalSize,
    percentage: Math.min(percentage, 100),
    etaSeconds,
    phase,
  })
}

export async function resumableUpload(file, { onProgress } = {}) {
  if (!(file instanceof File)) {
    throw new Error('resumableUpload expects a File instance')
  }

  const chunkSize = Math.max(
    MIN_CHUNK_SIZE,
    Math.min(DEFAULT_CHUNK_SIZE, file.size || DEFAULT_CHUNK_SIZE)
  )

  const fileBuffer = await file.arrayBuffer()
  const fileChecksum = await sha256(fileBuffer)
  const cacheKey = buildCacheKey(file, fileChecksum)
  const cached = loadCachedState(cacheKey)

  const initPayload = {
    filename: file.name,
    total_size: file.size,
    chunk_size: chunkSize,
    checksum: fileChecksum,
  }

  if (cached?.uploadId) {
    initPayload.upload_id = cached.uploadId
  }

  const session = await startResumableUpload(initPayload)
  const uploadId = session.upload_id
  const serverChunkSize = session.chunk_size
  const totalChunks = session.total_chunks
  const totalSize = session.total_size
  const strategy = session.strategy || 'direct'

  const uploadedChunks = new Set(session.uploaded_chunks || [])

  persistCachedState(cacheKey, {
    uploadId,
    uploadedChunks: Array.from(uploadedChunks),
  })

  const startedAt = Date.now()
  let uploadedBytes = calculateUploadedBytes(Array.from(uploadedChunks), serverChunkSize, totalSize)
  emitProgress(onProgress, { uploadedBytes, totalSize, phase: 'uploading', startedAt })

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    if (uploadedChunks.has(chunkIndex)) {
      continue
    }

    const start = chunkIndex * serverChunkSize
    const end = Math.min(start + serverChunkSize, totalSize)
    const chunkBlob = file.slice(start, end)
    const chunkArrayBuffer = await chunkBlob.arrayBuffer()
    const chunkChecksum = await sha256(chunkArrayBuffer)
    const chunkBytes = end - start

    if (strategy === 's3-presigned') {
      const presigned = await presignResumableChunk({
        uploadId,
        chunkIndex,
        chunkSize: chunkBytes,
      })

      const uploadResponse = await fetch(presigned.upload_url, {
        method: 'PUT',
        headers: presigned.headers || {},
        body: chunkBlob,
      })

      if (!uploadResponse.ok) {
        const message = await uploadResponse.text()
        throw new Error(`Failed to upload chunk ${chunkIndex}: ${message}`)
      }

      const etagHeader = uploadResponse.headers.get('ETag') || uploadResponse.headers.get('etag')
      if (!etagHeader) {
        throw new Error('Object storage response did not include an ETag header')
      }
      const normalizedEtag = etagHeader.replace(/"/g, '')

      await uploadResumableChunk({
        uploadId,
        chunkIndex,
        chunkChecksum,
        chunkSize: chunkBytes,
        chunkEtag: normalizedEtag,
      })
    } else {
      await uploadResumableChunk({
        uploadId,
        chunkIndex,
        chunkChecksum,
        chunkSize: chunkBytes,
        chunk: chunkBlob,
      })
    }

    uploadedChunks.add(chunkIndex)
    uploadedBytes = calculateUploadedBytes(Array.from(uploadedChunks), serverChunkSize, totalSize)
    persistCachedState(cacheKey, {
      uploadId,
      uploadedChunks: Array.from(uploadedChunks),
    })
    emitProgress(onProgress, { uploadedBytes, totalSize, phase: 'uploading', startedAt })
  }

  emitProgress(onProgress, { uploadedBytes: totalSize, totalSize, phase: 'assembling', startedAt })
  const response = await finishResumableUpload(uploadId)
  clearCachedState(cacheKey)
  emitProgress(onProgress, { uploadedBytes: totalSize, totalSize, phase: 'processing', startedAt })

  return {
    response,
    uploadId,
    checksum: fileChecksum,
  }
}
