'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSupabase } from '@/hooks/useSupabase'

type PageState = 'loading' | 'unauthed' | 'empty' | 'loaded' | 'error'

type ImageEntry = {
  image_id:     number
  storage_path: string
  created_at?:  string
  blobUrl:      string | null
  status:       'loading' | 'ready' | 'error'
}

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? 'http://localhost:8000'

export default function LibraryPage() {
  const supabase = useSupabase()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [images, setImages]       = useState<ImageEntry[]>([])

  const updateEntry = useCallback(
    (image_id: number, patch: Partial<ImageEntry>) =>
      setImages(prev => prev.map(e => (e.image_id === image_id ? { ...e, ...patch } : e))),
    [],
  )

  useEffect(() => {
    let cancelled = false
    const blobUrls: string[] = []

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setPageState('unauthed'); return }
      const token = session.access_token

      // ── Fetch image list ──────────────────────────────
      let imageList: Array<{ image_id: number; storage_path: string; created_at?: string }>
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/api/images`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) { setPageState('error'); return }
        const json = await res.json() as { images: typeof imageList }
        imageList = json.images
      } catch {
        setPageState('error')
        return
      }

      if (cancelled) return
      if (imageList.length === 0) { setPageState('empty'); return }

      setPageState('loaded')
      setImages(imageList.map(img => ({ ...img, blobUrl: null, status: 'loading' })))

      // ── Fetch each encoded image in parallel ─────────
      imageList.forEach(async ({ image_id }) => {
        try {
          const res = await fetch(`${BACKEND_BASE_URL}/api/images/${image_id}/file`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (cancelled) return
          if (!res.ok) { updateEntry(image_id, { status: 'error' }); return }
          const blob = await res.blob()
          const url  = URL.createObjectURL(blob)
          blobUrls.push(url)
          if (!cancelled) updateEntry(image_id, { blobUrl: url, status: 'ready' })
        } catch {
          if (!cancelled) updateEntry(image_id, { status: 'error' })
        }
      })
    }

    load()
    return () => {
      cancelled = true
      blobUrls.forEach(URL.revokeObjectURL)
    }
  }, [supabase, updateEntry])

  function download(entry: ImageEntry) {
    if (!entry.blobUrl) return
    const link      = document.createElement('a')
    link.href       = entry.blobUrl
    link.download   = `white-christmas-protected-${entry.image_id}.jpg`
    link.click()
  }

  return (
    <>
      {/* ── NAV ───────────────────────────────────────── */}
      <nav>
        <Link className="logo" href="/">White Christmas</Link>
        <ul>
          <li><Link href="/#how">How it works</Link></li>
          <li><Link href="/encode">Encode image</Link></li>
          <li><Link href="/auth" className="nav-cta">Sign in</Link></li>
        </ul>
      </nav>

      {/* ── MAIN ──────────────────────────────────────── */}
      <main className="library-page">

        {/* ── Header ─────────────────────────────────── */}
        <div className="library-header">
          <div>
            <p className="eyebrow" style={{ color: '#666' }}>Your protected images</p>
            <h2 className="library-title">
              Photo<br /><em>Library.</em>
            </h2>
          </div>
          <Link href="/encode" className="btn-primary" style={{ alignSelf: 'flex-end' }}>
            Upload another →
          </Link>
        </div>

        {/* ── Loading skeletons ──────────────────────── */}
        {pageState === 'loading' && (
          <div className="library-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="library-card library-card--skeleton" />
            ))}
          </div>
        )}

        {/* ── Unauthenticated ────────────────────────── */}
        {pageState === 'unauthed' && (
          <div className="library-empty">
            <p>Sign in to view your protected images.</p>
            <Link href="/auth" className="btn-primary">Sign in →</Link>
          </div>
        )}

        {/* ── Empty state ────────────────────────────── */}
        {pageState === 'empty' && (
          <div className="library-empty">
            <p>No protected images yet.</p>
            <Link href="/encode" className="btn-primary">
              Protect your first image →
            </Link>
          </div>
        )}

        {/* ── Error ──────────────────────────────────── */}
        {pageState === 'error' && (
          <div className="library-empty">
            <p>Could not load your library. Is the backend running?</p>
            <Link href="/encode" className="btn-primary">Back to encode →</Link>
          </div>
        )}

        {/* ── Image grid ─────────────────────────────── */}
        {pageState === 'loaded' && (
          <div className="library-grid">
            {images.map(entry => (
              <div key={entry.image_id} className="library-card">

                {/* Image / placeholder */}
                {entry.status === 'loading' && (
                  <div className="library-card-media library-card-media--loading" />
                )}
                {entry.status === 'error' && (
                  <div className="library-card-media library-card-media--error">
                    <span>⚠ Load failed</span>
                  </div>
                )}
                {entry.status === 'ready' && entry.blobUrl && (
                  <img
                    src={entry.blobUrl}
                    alt={`Encoded image #${entry.image_id}`}
                    className="library-card-media library-card-img"
                  />
                )}

                {/* Footer */}
                <div className="library-card-footer">
                  <span className="library-card-id">#{entry.image_id}</span>
                  <button
                    className="library-card-action"
                    disabled={entry.status !== 'ready'}
                    onClick={() => download(entry)}
                    title="Download encoded image"
                  >
                    ↓ Download
                  </button>
                </div>

              </div>
            ))}
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
