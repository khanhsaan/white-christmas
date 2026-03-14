import Link from 'next/link'
import PixelPortrait from './components/PixelPortrait'

export default function Home() {
  return (
    <>
      {/* ── NAV ─────────────────────────────────────────── */}
      <nav>
        <a className="logo" href="#">White Christmas</a>
        <ul>
          <li><a href="#how">How it works</a></li>
          <li><a href="#access">Access tiers</a></li>
          <li><a href="#" className="nav-cta">Get access</a></li>
        </ul>
      </nav>

      {/* ── HERO ────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-left">
          <p className="eyebrow">Selective vision technology</p>
          <h1>
            Only trusted eyes<br />
            <em>see you clearly.</em>
          </h1>
          <p className="hero-sub">
            White Christmas encrypts your images at the pixel level.<br />
            Strangers see noise. The people you choose see you.
          </p>
          <div className="hero-actions">
            <Link href="/encode" className="btn-primary">Encode your first photo</Link>
            <a href="#how" className="btn-ghost">See how it works</a>
          </div>
          <div className="hero-stats">
            <div>
              <span className="stat-num">256×</span>
              <span className="stat-label">Pixel-layer encryption</span>
            </div>
            <div>
              <span className="stat-num">∞</span>
              <span className="stat-label">Permission tiers</span>
            </div>
          </div>
        </div>

        <div className="hero-right">
          <PixelPortrait />
          <div className="decode-badge">Encoded · Decode with permission</div>
        </div>
      </section>

      <hr />

      {/* ── HOW IT WORKS ────────────────────────────────── */}
      <section className="how" id="how">
        <div className="section-label">How it works</div>
        <div className="steps">
          <div className="step">
            <span className="step-num">01</span>
            <div>
              <h3 className="step-title">Upload your photo</h3>
              <p className="step-desc">
                Your image is fragmented into pixel blocks and re-encoded with a
                cryptographic key tied to your account. The original is never stored.
              </p>
            </div>
          </div>
          <div className="step">
            <span className="step-num">02</span>
            <div>
              <h3 className="step-title">Share the encoded version</h3>
              <p className="step-desc">
                The pixelated image is safe to post anywhere. To the uninvited,
                it&apos;s visual static — a face dissolving into abstraction.
              </p>
            </div>
          </div>
          <div className="step">
            <span className="step-num">03</span>
            <div>
              <h3 className="step-title">Grant decode access</h3>
              <p className="step-desc">
                You decide who has the plugin and who has the permission. Close
                friends, family, colleagues — each with their own tier of visibility.
              </p>
            </div>
          </div>
          <div className="step">
            <span className="step-num">04</span>
            <div>
              <h3 className="step-title">They see you. Others don&apos;t.</h3>
              <p className="step-desc">
                Permitted viewers install the White Christmas browser plugin. For
                them, your image decodes instantly — seamless and automatic.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr />

      {/* ── PERMISSIONS ─────────────────────────────────── */}
      <section className="permissions" id="access">
        <div className="permissions-inner">
          <h2>
            You control<br />
            <em>every layer</em><br />
            of visibility.
          </h2>
          <p className="permissions-sub">
            Granular permission tiers let you decide exactly how much of yourself
            each person is allowed to see.
          </p>
          <div className="tiers">
            <div className="tier">
              <span className="tier-icon">░ ░ ░ ░</span>
              <p className="tier-name">Public</p>
              <p className="tier-desc">
                Pixelated abstraction. Visual noise. Unreadable to anyone without
                access.
              </p>
            </div>
            <div className="tier">
              <span className="tier-icon">▒ ▒ ░ ░</span>
              <p className="tier-name">Known</p>
              <p className="tier-desc">
                Partial decode. Outline and presence — but not full identity.
              </p>
            </div>
            <div className="tier">
              <span className="tier-icon">█ █ █ █</span>
              <p className="tier-name">Trusted</p>
              <p className="tier-desc">
                Full decode. Crystal clear. Every pixel restored for the people
                who matter.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUOTE ───────────────────────────────────────── */}
      <section className="quote-section">
        <blockquote>
          &ldquo;I just want to unsee<br />
          the things I&apos;ve seen.&rdquo;
        </blockquote>
        <cite>— White Christmas · Black Mirror S02E04</cite>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="cta-section">
        <div className="cta-text">
          <h3>Start encoding today.</h3>
          <p>Free to try. No credit card required.</p>
        </div>
        <Link href="/encode" className="btn-primary">
          Create your first encoded image →
        </Link>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer>
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
