'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/hooks/useSupabase'

type PageState = 'loading' | 'unauthed' | 'empty' | 'loaded' | 'error'
type DashboardTab = 'profile' | 'friends' | 'library'

type ImageEntry = {
  image_id: number
  storage_path: string
  owner_id?: string
  created_at?: string
  blobUrl: string | null
  status: 'loading' | 'ready' | 'error'
}

type FriendConnection = {
  friend_id: string
  friend_email: string | null
  status: string
  direction: 'incoming' | 'outgoing'
}

type AccessLog = {
  image_id: number
  viewer_id: string
  viewer_email: string | null
  viewer_name: string | null
  relation: 'friend' | 'stranger'
  accessed_at: string
}

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? 'http://localhost:8000'

export default function LibraryPage() {
  const router = useRouter()
  const supabase = useSupabase()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [tab, setTab] = useState<DashboardTab>('library')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')

  const [images, setImages] = useState<ImageEntry[]>([])
  const [sharedImages, setSharedImages] = useState<ImageEntry[]>([])
  const [friends, setFriends] = useState<FriendConnection[]>([])
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])

  const [friendEmail, setFriendEmail] = useState('')
  const [friendStatus, setFriendStatus] = useState('')
  const [pluginPairCode, setPluginPairCode] = useState('')
  const [pluginPairStatus, setPluginPairStatus] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)

  const updateEntry = useCallback(
    (image_id: number, patch: Partial<ImageEntry>) =>
      setImages(prev => prev.map(e => (e.image_id === image_id ? { ...e, ...patch } : e))),
    [],
  )

  const updateSharedEntry = useCallback(
    (image_id: number, patch: Partial<ImageEntry>) =>
      setSharedImages(prev => prev.map(e => (e.image_id === image_id ? { ...e, ...patch } : e))),
    [],
  )

  useEffect(() => {
    let cancelled = false
    const blobUrls: string[] = []

    async function load() {
      setPageState('loading')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setAccessToken(null)
        setEmail('')
        setImages([])
        setSharedImages([])
        setFriends([])
        setAccessLogs([])
        setPageState('unauthed')
        return
      }

      const token = session.access_token
      setAccessToken(token)
      setEmail(session.user?.email || '')

      try {
        const [ownRes, sharedRes, friendsRes, accessRes] = await Promise.all([
          fetch(`${BACKEND_BASE_URL}/api/images`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${BACKEND_BASE_URL}/api/images/shared`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${BACKEND_BASE_URL}/api/friends`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${BACKEND_BASE_URL}/api/notifications/access`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!ownRes.ok || !sharedRes.ok || !friendsRes.ok) {
          setPageState('error')
          return
        }

        const ownJson = await ownRes.json() as { images: Array<{ image_id: number; storage_path: string; created_at?: string }> }
        const sharedJson = await sharedRes.json() as { images: Array<{ image_id: number; owner_id: string; storage_path: string; created_at?: string }> }
        const friendsJson = await friendsRes.json() as { friends: FriendConnection[] }
        const accessJson = accessRes.ok ? await accessRes.json() as { access_logs: AccessLog[] } : { access_logs: [] }

        if (cancelled) return
        setFriends(friendsJson.friends || [])
        setAccessLogs(accessJson.access_logs || [])

        const ownList = ownJson.images || []
        const sharedList = sharedJson.images || []

        if (ownList.length === 0 && sharedList.length === 0) {
          setImages([])
          setSharedImages([])
          setPageState('empty')
          return
        }

        setPageState('loaded')
        // Own images: use direct URL with ?token= so the plugin can detect and decode them.
        setImages(ownList.map(img => ({
          ...img,
          blobUrl: `${BACKEND_BASE_URL}/api/images/${img.image_id}/social?token=${token}`,
          status: 'ready' as const,
        })))
        setSharedImages(sharedList.map(img => ({ ...img, blobUrl: null, status: 'loading' as const })))

        sharedList.forEach(async ({ image_id }) => {
          try {
            const res = await fetch(`${BACKEND_BASE_URL}/api/decode/${image_id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (cancelled) return
            if (!res.ok) {
              updateSharedEntry(image_id, { status: 'error' })
              return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            blobUrls.push(url)
            if (!cancelled) updateSharedEntry(image_id, { blobUrl: url, status: 'ready' })
          } catch {
            if (!cancelled) updateSharedEntry(image_id, { status: 'error' })
          }
        })
      } catch {
        if (!cancelled) setPageState('error')
      }
    }

    load()
    return () => {
      cancelled = true
      blobUrls.forEach(URL.revokeObjectURL)
    }
  }, [supabase, updateEntry, updateSharedEntry, refreshTick])

  function refreshData() {
    setRefreshTick((x) => x + 1)
  }

  async function createPluginPairCode() {
    if (!accessToken) {
      setPluginPairStatus('Please sign in first.')
      return
    }
    setPluginPairStatus('Generating code...')
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/plugin/link/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.code) {
        setPluginPairStatus(json?.detail || 'Could not create plugin code.')
        return
      }
      setPluginPairCode(String(json.code))
      setPluginPairStatus(`Code expires in ${json.expires_in || 120}s.`)
    } catch {
      setPluginPairStatus('Could not reach backend.')
    }
  }

  async function sendFriendRequest() {
    if (!accessToken) {
      setFriendStatus('Please sign in first.')
      return
    }
    const targetEmail = friendEmail.trim()
    if (!targetEmail) {
      setFriendStatus('Enter an email.')
      return
    }

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friend_email: targetEmail }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setFriendStatus(json?.detail || 'Request failed.')
        return
      }
      if (json?.status === 'accepted') {
        setFriendStatus(`You and ${targetEmail} are now friends.`)
      } else {
        setFriendStatus(`Request sent to ${targetEmail}.`)
      }
      setFriendEmail('')
      refreshData()
    } catch {
      setFriendStatus('Could not reach backend.')
    }
  }

  async function acceptRequest(requesterId: string) {
    if (!accessToken) return
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requester_id: requesterId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setFriendStatus(json?.detail || 'Accept failed.')
        return
      }
      setFriendStatus('Friend request accepted.')
      refreshData()
    } catch {
      setFriendStatus('Could not reach backend.')
    }
  }

  async function declineRequest(requesterId: string) {
    if (!accessToken) return
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requester_id: requesterId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setFriendStatus(json?.detail || 'Decline failed.')
        return
      }
      refreshData()
    } catch {
      setFriendStatus('Could not reach backend.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  function download(entry: ImageEntry, kind: 'protected' | 'original') {
    if (!entry.blobUrl) return
    const link = document.createElement('a')
    link.href = entry.blobUrl
    link.download = kind === 'protected'
      ? `white-christmas-protected-${entry.image_id}.jpg`
      : `white-christmas-original-${entry.image_id}.jpg`
    link.click()
  }

  const pendingRequests = friends.filter(f => f.direction === 'incoming' && f.status === 'pending')
  const strangerAccess = accessLogs.filter(l => l.relation === 'stranger')
  const totalNotifications = pendingRequests.length + strangerAccess.length

  return (
    <>
      <nav>
        <Link className="logo" href="/">White Christmas</Link>
        <ul>
          <li><Link href="/#how">How it works</Link></li>
          <li><Link href="/encode">Encode image</Link></li>
          {accessToken && (
            <li className="nav-notif-wrap">
              <button
                className="nav-notif-btn"
                onClick={() => setShowNotifications(v => !v)}
                aria-label={`Notifications${totalNotifications > 0 ? ` (${totalNotifications})` : ''}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {totalNotifications > 0 && (
                  <span className="nav-notif-badge">{totalNotifications}</span>
                )}
              </button>

              {showNotifications && (
                <div className="nav-notif-dropdown">
                  <p className="nav-notif-heading">Friend Requests</p>
                  {pendingRequests.length === 0 ? (
                    <p className="nav-notif-empty">No pending requests</p>
                  ) : (
                    pendingRequests.map(req => (
                      <div key={req.friend_id} className="nav-notif-row">
                        <span className="nav-notif-email">{req.friend_email || req.friend_id}</span>
                        <div className="nav-notif-actions">
                          <button
                            className="nav-notif-accept"
                            onClick={() => { acceptRequest(req.friend_id); setShowNotifications(false) }}
                          >
                            Accept
                          </button>
                          <button
                            className="nav-notif-decline"
                            onClick={() => { declineRequest(req.friend_id); setShowNotifications(false) }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <p className="nav-notif-heading" style={{ marginTop: '0.75rem' }}>Image Views</p>
                  {accessLogs.length === 0 ? (
                    <p className="nav-notif-empty">No one has decoded your images yet</p>
                  ) : (
                    accessLogs.map(log => {
                      return (
                        <div key={`${log.image_id}-${log.viewer_id}`} className={`nav-notif-row nav-notif-row--${log.relation}`}>
                          <div>
                            <span className={`nav-notif-relation nav-notif-relation--${log.relation}`}>
                              {log.relation === 'stranger' ? '⚠ Stranger' : '✓ Friend'}
                            </span>
                            <span className="nav-notif-email">
                              {log.relation === 'friend'
                                ? (log.viewer_name || log.viewer_email || log.viewer_id)
                                : (log.viewer_email || log.viewer_id)}
                            </span>
                            <span className="nav-notif-meta">decoded image #{log.image_id}</span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </li>
          )}
          {!accessToken ? (
            <li><Link href="/auth" className="nav-cta">Sign in</Link></li>
          ) : (
            <li><button className="nav-cta library-nav-cta-btn" onClick={signOut}>Sign out</button></li>
          )}
        </ul>
      </nav>

      <main className="library-page">
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

        <section className="library-dashboard">
          <div className="library-content">
            {tab === 'profile' && (
              <div className="library-panel">
                <p className="library-panel-label">Profile</p>
                <h3 className="library-panel-title">Account Status</h3>
                {pageState === 'unauthed' ? (
                  <div className="library-empty">
                    <p>Sign in to access your profile dashboard.</p>
                    <Link href="/auth" className="btn-primary">Sign in →</Link>
                  </div>
                ) : (
                  <>
                    <div className="library-profile-grid">
                      <div className="library-stat">
                        <span className="library-stat-k">Email</span>
                        <span className="library-stat-v">{email || 'Unknown'}</span>
                      </div>
                      <div className="library-stat">
                        <span className="library-stat-k">My Images</span>
                        <span className="library-stat-v">{images.length}</span>
                      </div>
                      <div className="library-stat">
                        <span className="library-stat-k">Shared To Me</span>
                        <span className="library-stat-v">{sharedImages.length}</span>
                      </div>
                      <div className="library-stat">
                        <span className="library-stat-k">Friends</span>
                        <span className="library-stat-v">{friends.filter(f => f.status === 'accepted').length}</span>
                      </div>
                    </div>
                    <div className="library-friend-form" style={{ marginTop: '1rem' }}>
                      <button className="btn-primary" onClick={createPluginPairCode}>
                        Connect plugin →
                      </button>
                      {pluginPairCode && (
                        <p className="library-panel-note">
                          Pair code: <strong>{pluginPairCode}</strong>
                        </p>
                      )}
                      {pluginPairStatus && <p className="library-panel-note">{pluginPairStatus}</p>}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'friends' && (
              <div className="library-panel">
                <p className="library-panel-label">Friend List</p>
                <h3 className="library-panel-title">Friend Requests</h3>
                {pageState === 'unauthed' ? (
                  <div className="library-empty">
                    <p>Sign in to manage friends.</p>
                    <Link href="/auth" className="btn-primary">Sign in →</Link>
                  </div>
                ) : (
                  <>
                    <div className="library-friend-form">
                      <input
                        className="library-input"
                        type="email"
                        placeholder="friend@example.com"
                        value={friendEmail}
                        onChange={(e) => setFriendEmail(e.target.value)}
                      />
                      <button className="btn-primary" onClick={sendFriendRequest}>
                        Send request →
                      </button>
                      {friendStatus && <p className="library-panel-note">{friendStatus}</p>}
                    </div>

                    <div className="library-friends-list" style={{ marginTop: '1rem' }}>
                      {friends.length === 0 && (
                        <p className="library-panel-note">No friend requests yet.</p>
                      )}
                      {friends.map((friend) => (
                        <div key={`${friend.friend_id}-${friend.direction}`} className="library-friend-row">
                          <div>
                            <p className="library-friend-email">{friend.friend_email || friend.friend_id}</p>
                            <p className="library-friend-meta">
                              {friend.direction} · {friend.status}
                            </p>
                          </div>
                          {friend.direction === 'incoming' && friend.status === 'pending' && (
                            <button className="library-card-action" onClick={() => acceptRequest(friend.friend_id)}>
                              Accept
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'library' && (
              <>
                {pageState === 'loading' && (
                  <div className="library-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="library-card library-card--skeleton" />
                    ))}
                  </div>
                )}

                {pageState === 'unauthed' && (
                  <div className="library-empty">
                    <p>Sign in to view your protected and shared images.</p>
                    <Link href="/auth" className="btn-primary">Sign in →</Link>
                  </div>
                )}

                {pageState === 'error' && (
                  <div className="library-empty">
                    <p>Could not load your library. Is the backend running?</p>
                    <Link href="/encode" className="btn-primary">Back to encode →</Link>
                  </div>
                )}

                {pageState === 'empty' && (
                  <div className="library-empty">
                    <p>No images yet. Upload one or add friends to see shared originals.</p>
                    <Link href="/encode" className="btn-primary">Protect your first image →</Link>
                  </div>
                )}

                {pageState === 'loaded' && (
                  <>
                    <div className="library-section-head">
                      <p className="library-panel-label">Owned</p>
                      <h3 className="library-panel-title">My Protected Images</h3>
                    </div>
                    <div className="library-grid">
                      {images.map(entry => (
                        <div key={`owned-${entry.image_id}`} className="library-card">
                          {entry.status === 'loading' && <div className="library-card-media library-card-media--loading" />}
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
                          <div className="library-card-footer">
                            <span className="library-card-id">#{entry.image_id}</span>
                            <button
                              className="library-card-action"
                              disabled={entry.status !== 'ready'}
                              onClick={() => download(entry, 'protected')}
                            >
                              ↓ Share
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="library-section-head" style={{ marginTop: '1.5rem' }}>
                      <p className="library-panel-label">Shared</p>
                      <h3 className="library-panel-title">Original Images Shared With Me</h3>
                    </div>
                    {sharedImages.length === 0 ? (
                      <p className="library-panel-note">No shared originals available yet.</p>
                    ) : (
                      <div className="library-grid">
                        {sharedImages.map(entry => (
                          <div key={`shared-${entry.image_id}-${entry.owner_id}`} className="library-card">
                            {entry.status === 'loading' && <div className="library-card-media library-card-media--loading" />}
                            {entry.status === 'error' && (
                              <div className="library-card-media library-card-media--error">
                                <span>⚠ Access denied</span>
                              </div>
                            )}
                            {entry.status === 'ready' && entry.blobUrl && (
                              <img
                                src={entry.blobUrl}
                                alt={`Shared image #${entry.image_id}`}
                                className="library-card-media library-card-img"
                              />
                            )}
                            <div className="library-card-footer">
                              <span className="library-card-id">#{entry.image_id}</span>
                              <button
                                className="library-card-action"
                                disabled={entry.status !== 'ready'}
                                onClick={() => download(entry, 'original')}
                              >
                                ↓ Original
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <aside className="library-side-rail" aria-label="Sections">
            <button className={`library-side-btn${tab === 'profile' ? ' active' : ''}`} onClick={() => setTab('profile')} role="radio" aria-checked={tab === 'profile'}>
              <span className="library-side-dot" aria-hidden="true" />
              <span>Profile</span>
            </button>
            <button className={`library-side-btn${tab === 'friends' ? ' active' : ''}`} onClick={() => setTab('friends')} role="radio" aria-checked={tab === 'friends'}>
              <span className="library-side-dot" aria-hidden="true" />
              <span>Friend List</span>
            </button>
            <button className={`library-side-btn${tab === 'library' ? ' active' : ''}`} onClick={() => setTab('library')} role="radio" aria-checked={tab === 'library'}>
              <span className="library-side-dot" aria-hidden="true" />
              <span>Library</span>
            </button>
          </aside>
        </section>
      </main>

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
