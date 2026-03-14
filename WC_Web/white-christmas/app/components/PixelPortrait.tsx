'use client'

import { useEffect, useRef } from 'react'

const SKINS: [number, number, number][] = [
  [224, 190, 165],
  [212, 176, 151],
  [196, 162, 136],
  [175, 138, 110],
  [155, 115, 88],
]

export default function PixelPortrait() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    let W = 0
    let H = 0
    let frame = 0
    let rafId: number

    function drawPortrait() {
      ctx.clearRect(0, 0, W, H)
      const bs = Math.max(4, Math.floor(W / 60))
      const cols = Math.ceil(W / bs)
      const rows = Math.ceil(H / bs)

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const nx = c / cols
          const ny = r / rows
          const x = c * bs
          const y = r * bs

          const fcx = 0.54, fcy = 0.46, frx = 0.27, fry = 0.36
          const inFace = ((nx - fcx) / frx) ** 2 + ((ny - fcy) / fry) ** 2 < 1
          const dissolve = Math.max(0, 1 - nx * 2.2)
          const rand = Math.random()

          if (!inFace && rand > 0.06) continue
          if (inFace && rand < dissolve * 0.75) continue

          const alpha = inFace
            ? Math.max(0.04, (1 - dissolve) * (0.6 + Math.random() * 0.4))
            : 0.03 + Math.random() * 0.1

          let rv: number, gv: number, bv: number
          if (nx > 0.42 && inFace) {
            const s = SKINS[Math.floor(Math.random() * SKINS.length)]
            const j = (Math.random() - 0.5) * 18
            rv = (s[0] + j) | 0
            gv = (s[1] + j) | 0
            bv = (s[2] + j) | 0
          } else {
            const g = (15 + Math.random() * 210) | 0
            rv = g; gv = g; bv = g
          }

          ctx.fillStyle = `rgba(${rv},${gv},${bv},${alpha})`
          const scatter = inFace
            ? bs * (0.55 + Math.random() * 0.65)
            : bs * (0.25 + Math.random() * 1.6)
          const ox = (Math.random() - 0.5) * bs * dissolve * 3.5
          const oy = (Math.random() - 0.5) * bs * dissolve * 1.5
          ctx.fillRect(x + ox, y + oy, scatter, scatter)
        }
      }
    }

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect()
      W = canvas!.width = rect.width
      H = canvas!.height = rect.height
      drawPortrait()
    }

    function animate() {
      frame++
      if (frame % 50 === 0) drawPortrait()
      rafId = requestAnimationFrame(animate)
    }

    window.addEventListener('resize', resize)
    resize()
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
