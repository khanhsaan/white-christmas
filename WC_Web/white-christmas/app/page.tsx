'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PixelPortrait from './components/PixelPortrait'

type FlowTab = 'owner' | 'viewer'

export default function Home() {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [introGone, setIntroGone] = useState(false)
  const [logoGone, setLogoGone] = useState(false)
  const [navLoaded, setNavLoaded] = useState(false)
  const [flow, setFlow] = useState<FlowTab>('owner')

  useEffect(() => {
    // CSS animations handle the curtain open + logo fade automatically.
    // JS only removes them from the DOM after animation completes (~2.2s).
    const tHero = window.setTimeout(() => {
      setNavLoaded(true)
      setHeroLoaded(true)
    }, 1950)
    const tGone = window.setTimeout(() => {
      setIntroGone(true)
      setLogoGone(true)
    }, 2300)
    return () => {
      window.clearTimeout(tHero)
      window.clearTimeout(tGone)
    }
  }, [])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('on')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 },
    )

    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div id="intro-curtain" className={introGone ? 'gone' : ''}>
        <div className="curtain-half" />
        <div className="curtain-half" />
      </div>
      <div id="curtain-logo" className={logoGone ? 'gone' : ''}>
        <div className="cl-text">White<span>Christmas</span></div>
      </div>

<div className={`page-content ${heroLoaded ? 'loaded' : ''}`}>
      <nav className={`wc-nav-intro ${navLoaded ? 'loaded' : ''}`}>
        <a className="logo" href="#">White Christmas</a>
        <ul>
          <li><a href="#problem">Problem</a></li>
          <li><a href="#research">Research</a></li>
          <li><a href="#how">How it works</a></li>
          <li><Link href="/auth">Sign in</Link></li>
          <li><Link href="/demo" className="nav-cta">Try demo</Link></li>
        </ul>
      </nav>

      <section className="hero wc-hero">
        <div className="hero-left">
          <p className={`eyebrow wc-anim-up ${heroLoaded ? 'on' : ''}`}>Selective vision technology</p>
          <h1 className="wc-display">
            <span className={`wc-word ${heroLoaded ? 'on' : ''}`} style={{ transitionDelay: '120ms' }}>Only</span><br />
            <span className={`wc-word ${heroLoaded ? 'on' : ''}`} style={{ transitionDelay: '240ms' }}>Trusted</span><br />
            <span className={`wc-word wc-word-accent ${heroLoaded ? 'on' : ''}`} style={{ transitionDelay: '360ms' }}>Eyes</span>
            <em className={`wc-thin ${heroLoaded ? 'on' : ''}`}>see you clearly.</em>
          </h1>
          <p className={`hero-sub wc-anim-up ${heroLoaded ? 'on' : ''}`} style={{ transitionDelay: '460ms' }}>
            White Christmas encrypts your photos at the pixel level.<br />
            Strangers see noise. The people you choose see you.
          </p>
          <div className={`hero-actions wc-anim-up ${heroLoaded ? 'on' : ''}`} style={{ transitionDelay: '620ms' }}>
            <Link href="/demo" className="btn-primary">Try the demo</Link>
            <a href="#how" className="btn-ghost">See how it works</a>
          </div>
        </div>

        <div className={`hero-right wc-anim-right ${heroLoaded ? 'on' : ''}`}>
          <PixelPortrait />
          <div className="decode-badge">Encoded · Decode with permission</div>
        </div>
      </section>

      <section className="wc-stat-band">
        <div className="wc-stat reveal-up" data-reveal><p>$200M+</p><span>Deepfake fraud · Q1 2025</span></div>
        <div className="wc-stat reveal-up" data-reveal><p>8M</p><span>Deepfakes online by 2025</span></div>
        <div className="wc-stat reveal-up" data-reveal><p>96%</p><span>From social media photos</span></div>
        <div className="wc-stat reveal-up" data-reveal><p>3 sec</p><span>To clone your voice</span></div>
      </section>

      <section id="problem" className="wc-sec">
        <div className="wc-sec-head reveal-up" data-reveal>
          <p className="wc-label">The problem</p>
          <h2 className="wc-h2">Your photo.<br />Their weapon.</h2>
        </div>
        <div className="wc-problem-grid">
          <div className="wc-steps">
            <article className="wc-step reveal-left" data-reveal>
              <h3>01 · Harvest</h3>
              <p>Bots scrape your public photos automatically.</p>
            </article>
            <article className="wc-step reveal-left" data-reveal>
              <h3>02 · Clone</h3>
              <p>Just 10 photos can build a convincing face clone.</p>
            </article>
            <article className="wc-step reveal-left" data-reveal>
              <h3>03 · Strike</h3>
              <p>The fake you can trigger real panic and real transfers.</p>
            </article>
          </div>
          <div className="wc-problem-cards">
            <div className="wc-problem-hero reveal-up" data-reveal>
              <p>$4.88B</p>
              <span>Lost by seniors globally to AI-driven fraud in 2024.</span>
            </div>
            <div className="wc-mini-grid">
              <div className="wc-mini reveal-up" data-reveal><p>900%</p><span>Annual growth of deepfakes online</span></div>
              <div className="wc-mini reveal-up" data-reveal><p>$25M</p><span>Lost in one deepfake video-call scam</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="research" className="wc-sec wc-alt">
        <div className="wc-sec-head reveal-up" data-reveal>
          <p className="wc-label">Research basis</p>
          <h2 className="wc-h2">Why it<br />targets you.</h2>
        </div>
        <div className="wc-research-grid">
          <article className="wc-card reveal-up" data-reveal>
            <h3>Who gets targeted</h3>
            <p>Children, teens, and elderly users are hit hardest by identity-based AI scams.</p>
            <div className="wc-chip-row">
              <span className="wc-chip"><b>1 in 4</b> adults targeted</span>
              <span className="wc-chip"><b>40%</b> online daters affected</span>
            </div>
          </article>
          <article className="wc-card reveal-up" data-reveal>
            <h3>Photos are raw material</h3>
            <p>96% of deepfakes are trained directly from social media imagery.</p>
            <div className="wc-chip-row">
              <span className="wc-chip"><b>96%</b> sourced from socials</span>
              <span className="wc-chip"><b>68%</b> fool human viewers</span>
            </div>
          </article>
        </div>
      </section>

      <section id="how" className="wc-sec">
        <div className="wc-sec-head reveal-up" data-reveal>
          <p className="wc-label">How it works</p>
          <h2 className="wc-h2">Encrypt first.<br />Post free.</h2>
        </div>
        <div className="wc-tabs reveal-up" data-reveal>
          <button className={flow === 'owner' ? 'on' : ''} onClick={() => setFlow('owner')}>Owner flow</button>
          <button className={flow === 'viewer' ? 'on' : ''} onClick={() => setFlow('viewer')}>Viewer flow</button>
        </div>
        {flow === 'owner' ? (
          <div className="wc-flow-grid">
            <article className="wc-flow-step reveal-up on"><h3>Upload original</h3><p>Your photo is protected before posting.</p></article>
            <article className="wc-flow-step reveal-up on"><h3>Encrypt + watermark</h3><p>Pixel scramble + robust DCT watermark.</p></article>
            <article className="wc-flow-step reveal-up on"><h3>Post freely</h3><p>Public viewers see noise, trusted viewers see you.</p></article>
          </div>
        ) : (
          <div className="wc-flow-grid">
            <article className="wc-flow-step reveal-up on"><h3>Browse normally</h3><p>Extension runs quietly in the background.</p></article>
            <article className="wc-flow-step reveal-up on"><h3>Watermark detected</h3><p>Viewer permission and key access are checked.</p></article>
            <article className="wc-flow-step reveal-up on"><h3>Image restored</h3><p>Original image is reconstructed instantly.</p></article>
          </div>
        )}
      </section>

      <section id="features" className="wc-sec wc-alt">
        <div className="wc-sec-head reveal-up" data-reveal>
          <p className="wc-label">Features</p>
          <h2 className="wc-h2">Every layer.<br />Built in.</h2>
        </div>
        <div className="wc-feat-grid">
          <article className="wc-feat reveal-up" data-reveal><h3>DCT watermarking</h3><p>Compression-robust identity signal.</p></article>
          <article className="wc-feat reveal-up" data-reveal><h3>Per-viewer keys</h3><p>Granular access and instant revocation.</p></article>
          <article className="wc-feat reveal-up" data-reveal><h3>Chrome extension</h3><p>Zero-friction authorized restoration.</p></article>
          <article className="wc-feat reveal-up" data-reveal><h3>Multi-platform</h3><p>Platform-agnostic protection workflow.</p></article>
          <article className="wc-feat reveal-up" data-reveal><h3>Threat dashboard</h3><p>Visibility and control over exposure.</p></article>
          <article className="wc-feat reveal-up" data-reveal><h3>AI poison layer</h3><p>Future adversarial defense integration.</p></article>
        </div>
      </section>

      <section id="impact" className="wc-sec">
        <div className="wc-impact-grid">
          <div className="reveal-up" data-reveal>
            <p className="wc-label">Why it matters</p>
            <h2 className="wc-h2">Real threat.<br />Real families.</h2>
            <div className="wc-impact-stats">
              <div className="wc-impact wc-impact-hi"><p>$2.7B</p><span>Australians lost to scams in 2024</span></div>
              <div className="wc-impact"><p>96%</p><span>Deepfakes sourced from social photos</span></div>
              <div className="wc-impact"><p>3 sec</p><span>Audio needed to clone a voice</span></div>
            </div>
          </div>
          <div className="reveal-up" data-reveal>
            <p className="wc-label">Roadmap</p>
            <div className="wc-roadmap">
              <article><h3>MVP · Live</h3><p>Core encryption/decryption loop.</p></article>
              <article><h3>Phase 2 · Next</h3><p>Platform hardening + mobile viewer.</p></article>
              <article><h3>Phase 3 · Planned</h3><p>AI poison layer + audit/compliance.</p></article>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section wc-cta" id="cta">
        <div className="cta-text reveal-up" data-reveal>
          <h3>See it work yourself.</h3>
          <p>Upload a photo. Encrypt it. Let trusted viewers restore the original.</p>
        </div>
        <div className="hero-actions reveal-up" data-reveal>
          <Link href="/demo" className="btn-primary">Try the demo</Link>
          <a href="#research" className="btn-ghost">Read research</a>
        </div>
      </section>

      <footer>
        <p>© 2026 White Christmas · All rights reserved</p>
        <div>
          <a href="#problem">Problem</a>
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#impact">Roadmap</a>
        </div>
      </footer>
      </div>
    </>
  )
}
