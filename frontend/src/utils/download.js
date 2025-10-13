export function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    throw new Error('downloadBlob expects a Blob instance')
  }
  if (!filename || typeof filename !== 'string') {
    throw new Error('downloadBlob expects a non-empty filename')
  }

  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8;') {
  const blob = new Blob([content ?? ''], { type: mimeType })
  downloadBlob(blob, filename)
}
