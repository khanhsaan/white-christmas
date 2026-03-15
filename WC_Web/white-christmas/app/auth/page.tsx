'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'signin' | 'signup'

const RATE_LIMIT_SECONDS = 60

function isRateLimitError(msg: string) {
  return /rate.?limit/i.test(msg) || /security purposes/i.test(msg)
}

export default function AuthPage() {
  const router = useRouter()
  const { signIn, signUp, loading, error } = useAuth()

  const [tab, setTab] = useState<Tab>('signin')
  const [rateLimitedAt, setRateLimitedAt] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(0)

  // ── Sign-in state ──────────────────────────────────────
  const [siEmail, setSiEmail]       = useState('')
  const [siPassword, setSiPassword] = useState('')

  // ── Sign-up state ──────────────────────────────────────
  const [suEmail, setSuEmail]       = useState('')
  const [suPassword, setSuPassword] = useState('')

  // ── Countdown ticker ───────────────────────────────────
  useEffect(() => {
    if (!rateLimitedAt) return
    setCountdown(RATE_LIMIT_SECONDS)
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - rateLimitedAt) / 1000)
      const remaining = Math.max(0, RATE_LIMIT_SECONDS - elapsed)
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        setRateLimitedAt(null)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [rateLimitedAt])

  // ── Handlers ───────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await signIn({ email: siEmail, password: siPassword })
    if (error && isRateLimitError(error.message)) { setRateLimitedAt(Date.now()); return }
    if (!error) router.push('/library')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await signUp({ email: suEmail, password: suPassword })
    if (error && isRateLimitError(error.message)) { setRateLimitedAt(Date.now()); return }
    if (!error) router.push('/library')
  }

  function switchTab(next: Tab) {
    setTab(next)
  }

  return (
    <>
      {/* ── NAV ─────────────────────────────────────────── */}
      <nav style={{ background: 'rgba(13,13,13,0.9)', borderBottomColor: '#1a1a1a' }}>
        <Link className="logo" href="/" style={{ color: '#fafafa' }}>
          White Christmas
        </Link>
        <ul>
          <li><Link href="/#how">How it works</Link></li>
          <li><Link href="/#access">Access tiers</Link></li>
          <li><Link href="/encode" className="nav-cta">Encode image</Link></li>
        </ul>
      </nav>

      {/* ── MAIN ────────────────────────────────────────── */}
      <main className="auth-page">

        {/* ── LEFT PANEL ──────────────────────────────── */}
        <div className="auth-left">
          <div className="auth-left-mark" aria-hidden="true">W<br />C</div>

          <div className="auth-left-top">
            <p className="eyebrow" style={{ color: '#666', marginBottom: 0 }}>
              Selective vision technology
            </p>
          </div>

          <div className="auth-left-mid">
            <p className="auth-left-quote">
              Every pixel is a secret—<br />
              <em>until you decide otherwise.</em>
            </p>
          </div>

          <div className="auth-left-bottom">
            <div className="auth-tier-row">
              <span className="auth-tier-glyph">░ ░ ░ ░</span>
              <span className="auth-tier-caption">Public · unreadable to strangers</span>
            </div>
            <div className="auth-tier-row">
              <span className="auth-tier-glyph">▒ ▒ ░ ░</span>
              <span className="auth-tier-caption">Known · partial decode</span>
            </div>
            <div className="auth-tier-row">
              <span className="auth-tier-glyph">█ █ █ █</span>
              <span className="auth-tier-caption">Trusted · full clarity</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div className="auth-right">
          <p className="auth-eyebrow">Secure access</p>

          {/* Tab switcher */}
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'signin'}
              className={`auth-tab${tab === 'signin' ? ' active' : ''}`}
              type="button"
              onClick={() => switchTab('signin')}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={tab === 'signup'}
              className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
              type="button"
              onClick={() => switchTab('signup')}
            >
              Create account
            </button>
          </div>

          {/* Rate-limit banner */}
          {rateLimitedAt && (
            <div className="auth-ratelimit">
              <div className="auth-ratelimit-top">
                <span className="auth-ratelimit-icon">⏳</span>
                <strong>Email rate limit reached</strong>
              </div>
              <p>Supabase free tier allows 2 emails per minute. Please wait before trying again.</p>
              <div className="auth-ratelimit-bar">
                <div
                  className="auth-ratelimit-fill"
                  style={{ width: `${(countdown / RATE_LIMIT_SECONDS) * 100}%` }}
                />
              </div>
              <span className="auth-ratelimit-count">{countdown}s remaining</span>
            </div>
          )}

          {/* Shared error banner */}
          {error && !rateLimitedAt && (
            <p className="auth-error">{error}</p>
          )}

          {/* ── SIGN IN FORM ──────────────────────────── */}
          {tab === 'signin' && (
            <form className="auth-form" onSubmit={handleSignIn}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signin-email">Email address</label>
                <input
                  id="signin-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={siEmail}
                  onChange={e => setSiEmail(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="signin-password">Password</label>
                <input
                  id="signin-password"
                  className="auth-input"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  value={siPassword}
                  onChange={e => setSiPassword(e.target.value)}
                />
              </div>

              <div className="auth-field-footer">
                <a href="#" className="auth-link">Forgot password?</a>
              </div>

              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>

              <p className="auth-fine-print">
                Don&apos;t have an account?{' '}
                <a href="#" onClick={e => { e.preventDefault(); switchTab('signup') }}>
                  Create one
                </a>
                .
              </p>
            </form>
          )}

          {/* ── SIGN UP FORM ──────────────────────────── */}
          {tab === 'signup' && (
            <form className="auth-form" onSubmit={handleSignUp}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  value={suEmail}
                  onChange={e => setSuEmail(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  className="auth-input"
                  type="password"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  required
                  value={suPassword}
                  onChange={e => setSuPassword(e.target.value)}
                />
              </div>

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Continue →'}
              </button>

              <p className="auth-fine-print">
                By continuing you agree to our{' '}
                <a href="#">Terms of Service</a> and{' '}
                <a href="#">Privacy Policy</a>.
                Already have an account?{' '}
                <a href="#" onClick={e => { e.preventDefault(); switchTab('signin') }}>
                  Sign in
                </a>
                .
              </p>
            </form>
          )}
        </div>
      </main>
    </>
  )
}
