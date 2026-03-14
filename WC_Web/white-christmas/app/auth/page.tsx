'use client'

import { useState } from 'react'
import Link from 'next/link'

type Tab = 'signin' | 'signup'

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('signin')

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
              onClick={() => setTab('signin')}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={tab === 'signup'}
              className={`auth-tab${tab === 'signup' ? ' active' : ''}`}
              type="button"
              onClick={() => setTab('signup')}
            >
              Create account
            </button>
          </div>

          {/* ── SIGN IN FORM ──────────────────────────── */}
          {tab === 'signin' && (
            <form className="auth-form" onSubmit={e => e.preventDefault()}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="signin-email">Email address</label>
                <input
                  id="signin-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
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
                />
              </div>

              <div className="auth-field-footer">
                <a href="#" className="auth-link">Forgot password?</a>
              </div>

              <button className="auth-submit" type="button">
                Sign in →
              </button>

              <p className="auth-fine-print">
                Don&apos;t have an account?{' '}
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); setTab('signup') }}
                >
                  Create one
                </a>
                .
              </p>
            </form>
          )}

          {/* ── SIGN UP FORM ──────────────────────────── */}
          {tab === 'signup' && (
            <form className="auth-form" onSubmit={e => e.preventDefault()}>
              <div className="auth-row">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="signup-first">First name</label>
                  <input
                    id="signup-first"
                    className="auth-input"
                    type="text"
                    placeholder="Jane"
                    autoComplete="given-name"
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="signup-last">Last name</label>
                  <input
                    id="signup-last"
                    className="auth-input"
                    type="text"
                    placeholder="Doe"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
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
                />
              </div>

              <div className="auth-divider">
                <span>Your data, your control</span>
              </div>

              <button className="auth-submit" type="button">
                Create account →
              </button>

              <p className="auth-fine-print">
                By creating an account you agree to our{' '}
                <a href="#">Terms of Service</a> and{' '}
                <a href="#">Privacy Policy</a>.
                Already have an account?{' '}
                <a
                  href="#"
                  onClick={e => { e.preventDefault(); setTab('signin') }}
                >
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
