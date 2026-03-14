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
}

export default function Snow() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sc = canvas.getContext('2d')!

    const flakes: Flake[] = Array.from({ length: 160 }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: i < 110 ? 0.5 + Math.random() * 1.0 : 1.2 + Math.random() * 1.8,
      speed: i < 110 ? 0.2 + Math.random() * 0.45 : 0.5 + Math.random() * 0.8,
      drift: (Math.random() - 0.5) * 0.25,
      opacity: i < 110 ? 0.06 + Math.random() * 0.18 : 0.1 + Math.random() * 0.22,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.006 + Math.random() * 0.01,
    }))

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
      sc.clearRect(0, 0, sw, sh)

      for (const f of flakes) {
        sc.beginPath()
        sc.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        sc.fillStyle = `rgba(190, 205, 218, ${f.opacity})`
        sc.fill()

        f.wobble += f.wobbleSpeed
        f.x += Math.sin(f.wobble) * 0.35 + f.drift
        f.y += f.speed

        if (f.y > sh + 6) { f.y = -6; f.x = Math.random() * sw }
        if (f.x > sw + 6) f.x = -6
        if (f.x < -6) f.x = sw + 6
      }

      rafId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [])

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
        zIndex: 9999,
      }}
    />
  )
}
