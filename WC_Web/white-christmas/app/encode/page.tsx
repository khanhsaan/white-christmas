'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useSupabase } from '../../hooks/useSupabase'

type Stage = 'idle' | 'uploading' | 'ready' | 'protecting' | 'done' | 'failed'

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? 'http://localhost:8000'

export default function EncodePage() {
  const supabase = useSupabase()
  const [stage, setStage]                       = useState<Stage>('idle')
  const [dragOver, setDragOver]                 = useState(false)
  const [sourceImageUrl, setSourceImageUrl]     = useState<string | null>(null)
  const [protectedImageUrl, setProtectedImageUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile]         = useState<File | null>(null)
  const [errorMessage, setErrorMessage]         = useState('')
  const [progress, setProgress]                 = useState(0)
  const [imageId, setImageId]                   = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const rafRef       = useRef<number>(0)

  // Keep a smooth UI progress while the backend processes.
  useEffect(() => {
    if (stage !== 'protecting') return
    const start = performance.now()
    function tick(now: number) {
      const t = Math.min((now - start) / 6000, 1)
      setProgress(Math.min(95, Math.round(t * 100)))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [stage])

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl)
      if (protectedImageUrl) URL.revokeObjectURL(protectedImageUrl)
    }
  }, [sourceImageUrl, protectedImageUrl])

  // ── File selection ──────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    cancelAnimationFrame(rafRef.current)
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl)
    if (protectedImageUrl) URL.revokeObjectURL(protectedImageUrl)
    const localPreviewUrl = URL.createObjectURL(file)

    setStage('ready')
    setErrorMessage('')
    setImageId(null)
    setSelectedFile(file)
    setSourceImageUrl(localPreviewUrl)
    setProtectedImageUrl(null)
    setProgress(0)
  }, [protectedImageUrl, sourceImageUrl])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleChange    = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  async function startProtect() {
    if (!selectedFile) return

    setProgress(0)
    setStage('protecting')

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Please sign in before protecting images.')
      }

      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('version', 'social')

      const res = await fetch(`${BACKEND_BASE_URL}/api/protect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || 'Protect request failed')
      }

      const blob = await res.blob()
      const resultUrl = URL.createObjectURL(blob)
      const responseImageId = res.headers.get('X-Image-ID')

      if (protectedImageUrl) URL.revokeObjectURL(protectedImageUrl)
      setProtectedImageUrl(resultUrl)
      setImageId(responseImageId)
      setProgress(100)
      setStage('done')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Protect request failed'
      setErrorMessage(
        msg === 'Failed to fetch'
          ? 'Could not reach backend. Is FastAPI running on port 8000?'
          : msg,
      )
      setStage('failed')
    }
  }

  function reset() {
    cancelAnimationFrame(rafRef.current)
    if (sourceImageUrl) URL.revokeObjectURL(sourceImageUrl)
    if (protectedImageUrl) URL.revokeObjectURL(protectedImageUrl)
    setStage('idle')
    setSelectedFile(null)
    setSourceImageUrl(null)
    setProtectedImageUrl(null)
    setImageId(null)
    setErrorMessage('')
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const isWorkspace = stage === 'ready' || stage === 'protecting' || stage === 'done'

  return (
    <>
      {/* ── NAV ───────────────────────────────────────── */}
      <nav>
        <Link className="logo" href="/">White Christmas</Link>
        <ul>
          <li><Link href="/#how">How it works</Link></li>
          <li><Link href="/#access">Access tiers</Link></li>
          <li><Link href="/auth">Sign in</Link></li>
          <li><Link href="/auth" className="nav-cta">Get access</Link></li>
        </ul>
      </nav>

      {/* ── MAIN ──────────────────────────────────────── */}
      <main className="encode-page">

        {/* Header */}
        <div className="encode-header">
          <p className="eyebrow" style={{ color: '#3a3a3a' }}>Protected encoding</p>
          <h2 className="encode-title">
            {stage === 'done' ? (
              <>Protection<br /><em>applied.</em></>
            ) : (
              <>Upload your<br /><em>image.</em></>
            )}
          </h2>
        </div>

        {/* ── IDLE / FAILED: upload zone ─────────────── */}
        {(stage === 'idle' || stage === 'failed') && (
          <div
            className={`upload-zone${dragOver ? ' drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleChange}
            />
            <div className="upload-icon">░ ▒ █</div>
            <p className="upload-label">Drag &amp; drop your photo</p>
            <p className="upload-sub">or click to browse · JPG, PNG, WEBP · sign in required</p>
            {stage === 'failed' && errorMessage && (
              <p className="upload-error">⚠ {errorMessage}</p>
            )}
          </div>
        )}

        {/* ── UPLOADING: indeterminate bar ──────────── */}
        {stage === 'uploading' && (
          <div className="encode-status">
            <p className="status-text">UPLOADING IMAGE...</p>
            <div className="progress-track">
              <div className="progress-fill progress-fill--indeterminate" />
            </div>
          </div>
        )}

        {/* ── WORKSPACE: 3-panel layout ─────────────── */}
        {isWorkspace && (
          <div className="encode-workspace">

            {/* LEFT: source image + button */}
            <div className="encode-panel">
              <p className="panel-label">Original</p>
              {sourceImageUrl && (
                <img
                  src={sourceImageUrl}
                  alt="Uploaded image"
                  className="panel-img"
                />
              )}
              {stage === 'ready' && (
                <button className="btn-primary" onClick={startProtect}>
                  Protect your image →
                </button>
              )}
              {stage === 'protecting' && (
                <button className="btn-primary" disabled style={{ opacity: 0.35, cursor: 'not-allowed' }}>
                  Processing...
                </button>
              )}
              {stage === 'done' && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (!protectedImageUrl) return
                      const link = document.createElement('a')
                      link.download = imageId
                        ? `white-christmas-protected-${imageId}.jpg`
                        : 'white-christmas-protected.jpg'
                      link.href = protectedImageUrl
                      link.click()
                    }}
                  >
                    Download protected image
                  </button>
                  <button className="btn-ghost-dark" onClick={reset}>
                    Upload another
                  </button>
                </div>
              )}
            </div>

            {/* CENTER: vertical progress pipe */}
            <div className="encode-pipe">
              <div className="pipe-track">
                <div
                  className="pipe-fill"
                  style={{ height: `${progress}%` }}
                />
              </div>
              {(stage === 'protecting' || stage === 'done') && (
                <p className="pipe-pct">{progress}%</p>
              )}
            </div>

            {/* RIGHT: result frame */}
            <div className="encode-panel">
              <p className="panel-label">Protected</p>
              <div className={`result-frame${stage === 'done' ? ' result-frame--done' : ''}`}>
                {stage === 'done' ? (
                  protectedImageUrl ? (
                    <img src={protectedImageUrl} alt="Protected result" className="panel-img" />
                  ) : (
                    <span className="result-frame-hint">Result unavailable</span>
                  )
                ) : (
                  <span className="result-frame-hint">░ ▒ █</span>
                )}
              </div>
              {stage === 'done' && imageId && (
                <p className="upload-sub">Image ID: {imageId}</p>
              )}
            </div>

          </div>
        )}

      </main>

      {/* ── FOOTER ────────────────────────────────────── */}
      <footer style={{ background: '#0d0d0d', borderColor: '#1c1c1c' }}>
        <p>© 2026 White Christmas · All rights reserved</p>
        <div>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Plugin</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </>
  )
}
