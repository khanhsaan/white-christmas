'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

type Stage = 'idle' | 'uploading' | 'ready' | 'protecting' | 'done' | 'failed'

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? 'http://localhost:8000'
const UPLOAD_API_URL =
  process.env.NEXT_PUBLIC_UPLOAD_API_URL ?? `${BACKEND_BASE_URL}/api/upload-image`

const PROTECT_DURATION = 2400 // ms — placeholder until real backend is wired

export default function EncodePage() {
  const [stage, setStage]                       = useState<Stage>('idle')
  const [dragOver, setDragOver]                 = useState(false)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage]         = useState('')
  const [progress, setProgress]                 = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const rafRef       = useRef<number>(0)

  // Fake progress animation (UI-only placeholder)
  useEffect(() => {
    if (stage !== 'protecting') return
    const start = performance.now()
    function tick(now: number) {
      const t      = Math.min((now - start) / PROTECT_DURATION, 1)
      const eased  = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      setProgress(Math.round(eased * 100))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setStage('done')
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [stage])

  // ── File upload ─────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setStage('uploading')
    setErrorMessage('')
    setUploadedImageUrl(null)
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(UPLOAD_API_URL, { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || 'Upload failed')
      }

      const data = await res.json() as { saved_name: string }
      setUploadedImageUrl(`${BACKEND_BASE_URL}/uploads/${data.saved_name}`)
      setStage('ready')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed'
      setErrorMessage(
        msg === 'Failed to fetch'
          ? 'Could not reach upload API. Is the backend running on port 8000?'
          : msg,
      )
      setStage('failed')
    }
  }, [])

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

  function startProtect() {
    setProgress(0)
    setStage('protecting')
  }

  function reset() {
    cancelAnimationFrame(rafRef.current)
    setStage('idle')
    setUploadedImageUrl(null)
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
            <p className="upload-sub">or click to browse · JPG, PNG, WEBP</p>
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
              {uploadedImageUrl && (
                <img
                  src={uploadedImageUrl}
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
                <button className="btn-ghost-dark" onClick={reset}>
                  Upload another
                </button>
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
                  <span className="result-frame-hint">Result will appear here</span>
                ) : (
                  <span className="result-frame-hint">░ ▒ █</span>
                )}
              </div>
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
