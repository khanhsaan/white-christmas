'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

type Stage = 'idle' | 'processing' | 'done'

const STATUS_STEPS: { at: number; text: string }[] = [
  { at: 0,  text: 'FRAGMENTING PIXEL STRUCTURE...' },
  { at: 20, text: 'APPLYING CRYPTOGRAPHIC LAYER...' },
  { at: 45, text: 'SEALING PIXEL BLOCKS...' },
  { at: 72, text: 'BINDING DECODE KEY...' },
  { at: 92, text: 'FINALISING PROTECTION...' },
]

const ENCODE_DURATION = 3800

export default function EncodePage() {
  const [stage, setStage]           = useState<Stage>('idle')
  const [dragOver, setDragOver]     = useState(false)
  const [progress, setProgress]     = useState(0)
  const [statusText, setStatusText] = useState(STATUS_STEPS[0].text)
  const [blockCount, setBlockCount] = useState(0)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const rafRef         = useRef<number>(0)
  const scrambledRef   = useRef<HTMLCanvasElement | null>(null)
  const imgRef         = useRef<HTMLImageElement | null>(null)

  // ── Cleanup on unmount ─────────────────────────────────
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // ── Scramble precompute ────────────────────────────────
  function buildScrambled(
    img: HTMLImageElement,
    W: number,
    H: number,
    BLOCK: number,
  ): HTMLCanvasElement {
    const sc  = document.createElement('canvas')
    sc.width  = W
    sc.height = H
    const ctx = sc.getContext('2d')!

    // Sample original colours
    ctx.drawImage(img, 0, 0, W, H)
    const data = ctx.getImageData(0, 0, W, H)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, W, H)

    for (let by = 0; by < H; by += BLOCK) {
      for (let bx = 0; bx < W; bx += BLOCK) {
        const cx  = Math.min(bx + (BLOCK >> 1), W - 1)
        const cy  = Math.min(by + (BLOCK >> 1), H - 1)
        const idx = (cy * W + cx) * 4
        const r   = data.data[idx]
        const g   = data.data[idx + 1]
        const b   = data.data[idx + 2]

        let sr: number, sg: number, sb: number
        const roll = Math.random()

        if (roll < 0.18) {
          // Channel shuffle
          sr = b; sg = r; sb = g
        } else if (roll < 0.34) {
          // Pure noise
          sr = (Math.random() * 180) | 0
          sg = (Math.random() * 180) | 0
          sb = (Math.random() * 180) | 0
        } else if (roll < 0.48) {
          // Inverted
          sr = 255 - r; sg = 255 - g; sb = 255 - b
        } else if (roll < 0.64) {
          // Greyscale quantized
          const lum = (r * 0.299 + g * 0.587 + b * 0.114) | 0
          const q   = Math.floor(lum / 55) * 55
          sr = q; sg = q; sb = q
        } else if (roll < 0.80) {
          // Max-channel dominant
          const mx = Math.max(r, g, b)
          sr = r === mx ? 210 : 18
          sg = g === mx ? 210 : 18
          sb = b === mx ? 210 : 18
        } else {
          // Jittered original
          const j = (Math.random() - 0.5) * 90
          sr = Math.max(0, Math.min(255, r + j)) | 0
          sg = Math.max(0, Math.min(255, g + j)) | 0
          sb = Math.max(0, Math.min(255, b + j)) | 0
        }

        const alpha  = 0.5 + Math.random() * 0.5
        const dx     = (Math.random() - 0.5) * BLOCK * 0.7
        const dy     = (Math.random() - 0.5) * BLOCK * 0.4
        const size   = BLOCK * (0.65 + Math.random() * 0.55)

        ctx.fillStyle = `rgba(${sr},${sg},${sb},${alpha})`
        ctx.fillRect(bx + dx, by + dy, size, size)
      }
    }

    // Subtle scanline darkening
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1)

    return sc
  }

  // ── Glowing scan-line ──────────────────────────────────
  function drawScanLine(ctx: CanvasRenderingContext2D, x: number, H: number) {
    const glows: [number, number][] = [
      [0.015, 90], [0.05, 45], [0.15, 18], [0.45, 5], [0.9, 1.5],
    ]
    for (const [alpha, w] of glows) {
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
      g.addColorStop(0,   'rgba(255,255,255,0)')
      g.addColorStop(0.5, `rgba(210,228,255,${alpha})`)
      g.addColorStop(1,   'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - w / 2, 0, w, H)
    }

    // Spark particles
    for (let i = 0; i < 8; i++) {
      const py = Math.random() * H
      const pr = 0.6 + Math.random() * 1.8
      ctx.beginPath()
      ctx.arc(x + (Math.random() - 0.5) * 4, py, pr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(190,215,255,${0.35 + Math.random() * 0.55})`
      ctx.fill()
    }

    // Horizontal data-line flickers (glitch aesthetic)
    for (let i = 0; i < 3; i++) {
      if (Math.random() > 0.55) continue
      const gy = (Math.random() * H) | 0
      const gw = 20 + Math.random() * 60
      ctx.fillStyle = `rgba(200,220,255,${0.06 + Math.random() * 0.08})`
      ctx.fillRect(x - gw, gy, gw, 1)
    }
  }

  // ── Start encoding ─────────────────────────────────────
  function startEncoding(img: HTMLImageElement) {
    setStage('processing')
    setProgress(0)
    setStatusText(STATUS_STEPS[0].text)

    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    const MAX_W  = 720
    const scale  = Math.min(1, MAX_W / img.width)
    const W      = Math.round(img.width  * scale)
    const H      = Math.round(img.height * scale)
    canvas.width  = W
    canvas.height = H

    const BLOCK = Math.max(5, Math.floor(W / 80))

    const scrambled = buildScrambled(img, W, H, BLOCK)
    scrambledRef.current = scrambled
    setBlockCount(Math.ceil(W / BLOCK) * Math.ceil(H / BLOCK))

    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const t       = Math.min(elapsed / ENCODE_DURATION, 1)

      // Ease in-out cubic
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2

      const scanX = Math.floor(eased * W)
      const prog  = Math.round(t * 100)

      setProgress(prog)
      const step = [...STATUS_STEPS].reverse().find(s => prog >= s.at)
      if (step) setStatusText(step.text)

      // Compose frame
      ctx.clearRect(0, 0, W, H)

      // Scrambled base
      ctx.drawImage(scrambled, 0, 0)

      // Original image only to the right of the scan line
      if (scanX < W) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(scanX, 0, W - scanX, H)
        ctx.clip()
        ctx.drawImage(img, 0, 0, W, H)
        ctx.restore()
      }

      // Scan line glow
      if (scanX > 0 && scanX < W) drawScanLine(ctx, scanX, H)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Brief white flash at seal moment
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(0, 0, W, H)
        setTimeout(() => setStage('done'), 200)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  // ── File handling ──────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img  = new Image()
    img.onload = () => {
      imgRef.current = img
      URL.revokeObjectURL(url)
      startEncoding(img)
    }
    img.src = url
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true)  }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleChange    = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  function downloadEncoded() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link      = document.createElement('a')
    link.download   = 'white-christmas-encoded.png'
    link.href       = canvas.toDataURL('image/png')
    link.click()
  }

  function reset() {
    cancelAnimationFrame(rafRef.current)
    setStage('idle')
    setProgress(0)
    setBlockCount(0)
    scrambledRef.current = null
    imgRef.current       = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
              <>
                Your image is<br />
                <em>invisible to strangers.</em>
              </>
            ) : (
              <>
                Encrypt your<br />
                <em>image.</em>
              </>
            )}
          </h2>
        </div>

        {/* ── IDLE: upload zone ─────────────────────── */}
        {stage === 'idle' && (
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
          </div>
        )}

        {/* ── PROCESSING + DONE: canvas ─────────────── */}
        {(stage === 'processing' || stage === 'done') && (
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className={`encode-canvas${stage === 'done' ? ' is-done' : ''}`}
            />
            {stage === 'done' && (
              <div className="protected-badge">● Protected</div>
            )}
          </div>
        )}

        {/* ── PROCESSING: progress ──────────────────── */}
        {stage === 'processing' && (
          <div className="encode-status">
            <p className="status-text">{statusText}</p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="progress-num">{progress}%</p>
          </div>
        )}

        {/* ── DONE: stats + actions ─────────────────── */}
        {stage === 'done' && (
          <div className="encode-done">
            <div className="done-stats">
              <div>
                <span className="stat-num">{blockCount.toLocaleString()}</span>
                <span className="stat-label">Pixel blocks sealed</span>
              </div>
              <div>
                <span className="stat-num">256×</span>
                <span className="stat-label">Encryption strength</span>
              </div>
              <div>
                <span className="stat-num">∞</span>
                <span className="stat-label">Strangers blocked</span>
              </div>
            </div>

            <p className="done-sub">
              Share this encoded image anywhere — social media, messages, anywhere.<br />
              Strangers see only noise. The people you permit see you clearly.
            </p>

            <div className="done-actions">
              <button className="btn-primary" onClick={downloadEncoded}>
                Download encoded image
              </button>
              <button className="btn-ghost-dark" onClick={reset}>
                Encode another
              </button>
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
