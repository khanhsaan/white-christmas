'use client'

import Link from 'next/link'

export default function SetupProfilePage() {
  return (
    <>
      {/* ── NAV ─────────────────────────────────────────── */}
      <nav style={{ background: 'rgba(13,13,13,0.9)', borderBottomColor: '#1a1a1a' }}>
        <Link className="logo" href="/" style={{ color: '#fafafa' }}>
          White Christmas
        </Link>
      </nav>

      {/* ── MAIN ────────────────────────────────────────── */}
      <main className="auth-page">

        {/* ── LEFT PANEL ──────────────────────────────── */}
        <div className="auth-left">
          <div className="auth-left-mark" aria-hidden="true">W<br />C</div>

          <div className="auth-left-top">
            <p className="eyebrow" style={{ color: '#666', marginBottom: 0 }}>
              Almost there
            </p>
          </div>

          <div className="auth-left-mid">
            <p className="auth-left-quote">
              A name behind the pixel—<br />
              <em>so the right eyes see clearly.</em>
            </p>
          </div>

          <div className="auth-left-bottom">
            <div className="auth-tier-row">
              <span className="auth-tier-glyph" style={{ color: '#555' }}>① Account</span>
              <span className="auth-tier-caption" style={{ color: '#555', textDecoration: 'line-through' }}>Email &amp; password</span>
            </div>
            <div className="auth-tier-row">
              <span className="auth-tier-glyph" style={{ color: '#ccc' }}>② Profile</span>
              <span className="auth-tier-caption">Your name &amp; date of birth</span>
            </div>
            <div className="auth-tier-row">
              <span className="auth-tier-glyph" style={{ color: '#555' }}>③ Done</span>
              <span className="auth-tier-caption" style={{ color: '#555' }}>Start encoding</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────── */}
        <div className="auth-right">
          <p className="auth-eyebrow">Set up your profile</p>

          <div className="auth-tabs" role="presentation">
            <span className="auth-tab">Create account</span>
            <span className="auth-tab active">Profile</span>
          </div>

          <form className="auth-form" onSubmit={e => e.preventDefault()}>
            <div className="auth-row">
              <div className="auth-field">
                <label className="auth-label" htmlFor="profile-first">First name</label>
                <input
                  id="profile-first"
                  className="auth-input"
                  type="text"
                  placeholder="Jane"
                  autoComplete="given-name"
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="profile-last">Last name</label>
                <input
                  id="profile-last"
                  className="auth-input"
                  type="text"
                  placeholder="Doe"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="profile-dob">Date of birth</label>
              <input
                id="profile-dob"
                className="auth-input auth-input-date"
                type="date"
                autoComplete="bday"
              />
            </div>

            <div className="auth-divider">
              <span>Your data stays yours</span>
            </div>

            <button className="auth-submit" type="button">
              Save and continue →
            </button>

            <p className="auth-fine-print">
              You can update this information later in your account settings.
            </p>
          </form>
        </div>
      </main>
    </>
  )
}
