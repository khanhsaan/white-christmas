'use client'

import { useEffect, useRef } from 'react'

interface Flake {
  x: number
  y: number
  r: number
  speed: number
  drift: number
  opacity: number
  wobble: number
  wobbleSpeed: number
  angle: number
}

function drawFlake(ctx: CanvasRenderingContext2D, f: Flake) {
  if (f.r < 1.8) {
    // tiny: plain circle
    ctx.beginPath()
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // larger: 6-arm star
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = f.angle + (i / 6) * Math.PI * 2
      ctx.moveTo(f.x, f.y)
      ctx.lineTo(f.x + Math.cos(a) * f.r * 2.4, f.y + Math.sin(a) * f.r * 2.4)
      // tiny branches
      const mid = f.r * 1.2
      ctx.moveTo(f.x + Math.cos(a) * mid, f.y + Math.sin(a) * mid)
      ctx.lineTo(
        f.x + Math.cos(a + 0.5) * mid * 1.4,
        f.y + Math.sin(a + 0.5) * mid * 1.4,
      )
    }
    ctx.stroke()
  }
}

interface SnowProps {
  count?: number
  color?: string
  canvasOpacity?: number
  maxOpacity?: number
}

export default function Snow({
  count = 30,
  color = '110, 135, 165',
  canvasOpacity = 0.7,
  maxOpacity = 0.63,
}: SnowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Three depth layers for parallax feel
    const flakes: Flake[] = Array.from({ length: count }, () => {
      const layer = Math.random() // 0 = far/small, 1 = near/large
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: layer * 2.8 + 0.4,
        speed: layer * 1.4 + 0.3,
        drift: (Math.random() - 0.5) * 0.4,
        opacity: layer * (maxOpacity - 0.18) + 0.18,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.005 + Math.random() * 0.012,
        angle: Math.random() * Math.PI * 2,
      }
    })

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let rafId: number

    function draw() {
      const sw = canvas!.width
      const sh = canvas!.height
      ctx.clearRect(0, 0, sw, sh)

      for (const f of flakes) {
        ctx.save()
        ctx.globalAlpha = f.opacity
        ctx.fillStyle = `rgba(${color}, 1)`
        ctx.strokeStyle = `rgba(${color}, 1)`
        ctx.lineWidth = 0.8
        drawFlake(ctx, f)
        ctx.restore()

        f.wobble += f.wobbleSpeed
        f.angle += f.wobbleSpeed * 0.4
        f.x += Math.sin(f.wobble) * 0.45 + f.drift
        f.y += f.speed

        if (f.y > sh + 10) { f.y = -10; f.x = Math.random() * sw }
        if (f.x > sw + 10) f.x = -10
        if (f.x < -10) f.x = sw + 10
      }

      rafId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [count, color, maxOpacity])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
        opacity: canvasOpacity,
      }}
    />
  )
}
