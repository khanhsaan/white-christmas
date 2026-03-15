'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

const STEPS = [
  { num: '01', label: 'Install Plugin' },
  { num: '02', label: 'Create Account' },
  { num: '03', label: 'Encode Image' },
  { num: '04', label: 'The Magic' },
]

export default function DemoPage() {
  const [reached, setReached] = useState(0)

  const refs = [
    useRef<HTMLElement>(null),
    useRef<HTMLElement>(null),
    useRef<HTMLElement>(null),
    useRef<HTMLElement>(null),
  ]

  function advance(to: number) {
    setReached(to)
    setTimeout(() => {
      refs[to]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  return (
    <>
      <nav style={{ background: 'rgba(250,250,250,0.92)', borderBottomColor: '#e4e4e4' }}>
        <Link className="logo" href="/">White Christmas</Link>
        <ul>
          <li><Link href="/#how">How it works</Link></li>
          <li><Link href="/auth">Sign in</Link></li>
          <li><Link href="/encode" className="nav-cta">Encode image</Link></li>
        </ul>
      </nav>

      {/* ── STICKY STEP TRACKER ── */}
      <div className="demo-tracker">
        {STEPS.map((s, i) => (
          <div key={i} className={`demo-track-item${reached >= i ? ' active' : ''}`}>
            <span className="demo-track-num">{s.num}</span>
            <span className="demo-track-label">{s.label}</span>
          </div>
        ))}
      </div>

      <main className="demo-main">

        {/* ══ STEP 01: INSTALL ══ */}
        <section ref={refs[0]} className="demo-step">
          <div className="demo-step-inner">
            <p className="eyebrow">Step 01 of 04</p>
            <h2 className="demo-h2">Install the<br /><em>Plugin</em></h2>
            <p className="demo-sub">
              White Christmas works through a Chrome extension that silently decodes
              protected images for authorised viewers. Install it once and it runs in
              the background on every site.
            </p>

            <div className="demo-install-steps">
              <div className="demo-install-row">
                <span className="demo-install-num">1</span>
                <div>
                  <strong>Download the extension zip</strong>
                  <p>Click the button below to get the latest build.</p>
                </div>
              </div>
              <div className="demo-install-row">
                <span className="demo-install-num">2</span>
                <div>
                  <strong>Open Chrome Extensions</strong>
                  <p>Navigate to <code>chrome://extensions</code> and enable <em>Developer Mode</em> (toggle, top-right).</p>
                </div>
              </div>
              <div className="demo-install-row">
                <span className="demo-install-num">3</span>
                <div>
                  <strong>Load the folder</strong>
                  <p>Unzip the file, click <em>Load unpacked</em>, and select the unzipped folder. Done.</p>
                </div>
              </div>
            </div>

            <div className="demo-actions">
              <a
                href="/white-christmas-plugin.zip"
                download
                className="btn-primary"
              >
                Download Extension ↓
              </a>
              <button
                className="demo-advance-btn"
                onClick={() => advance(1)}
              >
                Done — I&apos;ve installed it →
              </button>
            </div>
          </div>

          {/* Plugin mockup */}
          <div className="demo-aside">
            <div className="demo-plugin-card">
              <div className="demo-plugin-topbar">
                <span className="demo-plugin-brand">White Christmas</span>
                <span className="demo-plugin-badge">Viewer Plugin</span>
              </div>
              <div className="demo-plugin-body">
                <div className="demo-plugin-prompt">
                  <div className="demo-plugin-prompt-title">Sign in to get started</div>
                  <div className="demo-plugin-prompt-sub">
                    Protected images will decode automatically once you&apos;re signed in.
                  </div>
                </div>
                <div className="demo-plugin-field-block">
                  <div className="demo-plugin-label">Pair Code</div>
                  <div className="demo-plugin-input">Get code from whitechristmas.app</div>
                </div>
                <div className="demo-plugin-or">— or sign in manually —</div>
                <div className="demo-plugin-field-block">
                  <div className="demo-plugin-label">Email</div>
                  <div className="demo-plugin-input">you@example.com</div>
                </div>
              </div>
            </div>
            <p className="demo-aside-caption">The extension popup after install</p>
          </div>
        </section>

        {/* ══ STEP 02: SIGN UP ══ */}
        <section
          ref={refs[1]}
          className={`demo-step demo-step-alt${reached >= 1 ? ' demo-step-visible' : ' demo-step-hidden'}`}
        >
          <div className="demo-step-inner">
            <p className="eyebrow">Step 02 of 04</p>
            <h2 className="demo-h2">Create your<br /><em>Account</em></h2>
            <p className="demo-sub">
              Your account ties your cryptographic key to your identity. Every photo
              you protect is encrypted with a key only you can distribute.
            </p>

            <div className="demo-actions">
              <Link href="/auth?tab=signup" className="btn-primary">
                Create account →
              </Link>
              <button className="demo-advance-btn" onClick={() => advance(2)}>
                Already signed in →
              </button>
            </div>
          </div>

          <div className="demo-aside">
            <div className="demo-feature-list">
              <div className="demo-feature-row">
                <span className="demo-feature-icon">🔑</span>
                <div>
                  <strong>Cryptographic key generated</strong>
                  <p>A unique Fernet key is provisioned for your account on signup.</p>
                </div>
              </div>
              <div className="demo-feature-row">
                <span className="demo-feature-icon">👁</span>
                <div>
                  <strong>Granular access control</strong>
                  <p>Grant or revoke viewer permission per photo, per person.</p>
                </div>
              </div>
              <div className="demo-feature-row">
                <span className="demo-feature-icon">🛡</span>
                <div>
                  <strong>Zero plain-text storage</strong>
                  <p>Original images are never stored — only protected artefacts.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ STEP 03: ENCODE ══ */}
        <section
          ref={refs[2]}
          className={`demo-step${reached >= 2 ? ' demo-step-visible' : ' demo-step-hidden'}`}
        >
          <div className="demo-step-inner">
            <p className="eyebrow">Step 03 of 04</p>
            <h2 className="demo-h2">Encode your<br /><em>Photo</em></h2>
            <p className="demo-sub">
              Upload any photo. White Christmas scrambles it at the pixel level and
              embeds an invisible DCT watermark. Post the result anywhere —
              strangers see noise, trusted viewers see you.
            </p>

            <div className="demo-actions">
              <Link href="/encode" className="btn-primary">
                Encode a photo →
              </Link>
              <button className="demo-advance-btn" onClick={() => advance(3)}>
                Done — I&apos;ve encoded one →
              </button>
            </div>
          </div>

          <div className="demo-aside">
            <div className="demo-before-after">
              <div className="demo-ba-panel">
                <div className="demo-ba-img demo-ba-noise" aria-hidden="true">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div
                      key={i}
                      className="demo-ba-pixel"
                      style={{
                        background: `hsl(0,0%,${Math.floor(10 + Math.random() * 80)}%)`,
                        opacity: 0.6 + Math.random() * 0.4,
                      }}
                    />
                  ))}
                </div>
                <span className="demo-ba-label">Public · strangers see noise</span>
              </div>
              <div className="demo-ba-arrow">→</div>
              <div className="demo-ba-panel">
                <div className="demo-ba-img demo-ba-clear">
                  <div className="demo-ba-face">
                    <div className="demo-ba-head" />
                    <div className="demo-ba-eyes"><span /><span /></div>
                    <div className="demo-ba-mouth" />
                  </div>
                </div>
                <span className="demo-ba-label">Trusted · full clarity</span>
              </div>
            </div>
          </div>
        </section>

        {/* ══ STEP 04: MAGIC ══ */}
        <section
          ref={refs[3]}
          className={`demo-step demo-step-alt demo-step-last${reached >= 3 ? ' demo-step-visible' : ' demo-step-hidden'}`}
        >
          <div className="demo-step-inner">
            <p className="eyebrow">Step 04 of 04</p>
            <h2 className="demo-h2">Let the<br /><em>Magic happen</em></h2>
            <p className="demo-sub">
              Post your encoded image anywhere on the web. When someone with the
              plugin visits the page, it detects the watermark, checks their
              permission, and — if authorised — instantly reconstructs the original.
              No clicks. No friction.
            </p>

            <div className="demo-magic-steps">
              <div className="demo-magic-row">
                <span className="demo-magic-dot" />
                <p><strong>Watermark detected</strong> — the plugin spots the embedded signal in under 100ms.</p>
              </div>
              <div className="demo-magic-row">
                <span className="demo-magic-dot" />
                <p><strong>Permission checked</strong> — the server verifies the viewer has been granted access.</p>
              </div>
              <div className="demo-magic-row">
                <span className="demo-magic-dot" />
                <p><strong>Image restored</strong> — pixel order is reversed locally; no original ever hits the network.</p>
              </div>
            </div>

            <div className="demo-actions" style={{ marginTop: '2.5rem' }}>
              <Link href="/library" className="btn-primary">
                Go to my library →
              </Link>
              <Link href="/" className="demo-advance-btn">
                Back to home
              </Link>
            </div>
          </div>

          <div className="demo-aside">
            <div className="demo-flow-diagram">
              <div className="demo-flow-node demo-flow-post">
                <span>📸</span>
                <p>You post encoded image</p>
              </div>
              <div className="demo-flow-arrow">↓</div>
              <div className="demo-flow-node demo-flow-detect">
                <span>🔍</span>
                <p>Plugin detects watermark</p>
              </div>
              <div className="demo-flow-arrow">↓</div>
              <div className="demo-flow-node demo-flow-check">
                <span>✓</span>
                <p>Server confirms permission</p>
              </div>
              <div className="demo-flow-arrow">↓</div>
              <div className="demo-flow-node demo-flow-reveal">
                <span>✦</span>
                <p>Original restored locally</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer>
        <p>© 2026 White Christmas · All rights reserved</p>
        <div>
          <a href="/#problem">Problem</a>
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
        </div>
      </footer>
    </>
  )
}
