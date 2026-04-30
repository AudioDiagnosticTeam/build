import { useEffect, useRef, useState } from 'react'

// Zones for side view (car.png = left-side profile)
const ZONES_SIDE = [
  { x: 0.20, y: 0.48, color: '#EF4444' }, // Двигатель — передний капот
  { x: 0.28, y: 0.40, color: '#F59E0B' }, // Ремень / навесное — верх двигателя
  { x: 0.14, y: 0.40, color: '#60A5FA' }, // Впускная — передний воздухозаборник
  { x: 0.84, y: 0.65, color: '#A855F7' }, // Выхлоп — задний глушитель
]

// Zones for 3D/top view (car-3d.png)
const ZONES_3D = [
  { x: 0.36, y: 0.50, color: '#EF4444' },
  { x: 0.46, y: 0.44, color: '#F59E0B' },
  { x: 0.27, y: 0.56, color: '#60A5FA' },
  { x: 0.68, y: 0.62, color: '#A855F7' },
]

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

export default function CarView({ zones = [0.5, 0.3, 0.2, 0.1], view = 'side', showDots = true }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const phaseRef  = useRef(0)
  const [hasImg, setHasImg] = useState(false)

  const ZONES = view === 'side' ? ZONES_SIDE : ZONES_3D
  const imgSrc = view === 'side' ? '/car-side.png' : '/car.png'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width  / dpr
      const h = canvas.height / dpr

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      phaseRef.current += 0.04
      ZONES.forEach(({ x, y, color }, i) => {
        const intensity = Math.max(0, Math.min(1, zones[i] ?? 0.3))
        const [r, g, b] = hexToRgb(color)
        const dx = x * w, dy = y * h

        // ── Расходящиеся кольца (зависят от интенсивности) ──
        const numRings = intensity > 0.55 ? 2 : 1
        for (let ri = 0; ri < numRings; ri++) {
          const t = ((phaseRef.current * 0.7 + ri * Math.PI + i * 1.4) % (Math.PI * 2)) / (Math.PI * 2)
          const ringR   = 8 + t * (18 + intensity * 42)
          const ringOpa = intensity * (1 - t) * 0.85
          if (ringOpa > 0.01) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${ringOpa})`
            ctx.lineWidth   = 1.5 + intensity * 2
            ctx.shadowColor = color
            ctx.shadowBlur  = 6 * intensity
            ctx.beginPath(); ctx.arc(dx, dy, ringR, 0, Math.PI * 2); ctx.stroke()
            ctx.shadowBlur  = 0
          }
        }

        // ── Мягкое свечение ──
        const pulse = (Math.sin(phaseRef.current + i * 1.4) + 1) / 2
        const rr = (10 + pulse * 18) * (0.4 + intensity * 0.6)
        const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr)
        grad.addColorStop(0, `rgba(${r},${g},${b},${0.4 * intensity})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI*2); ctx.fill()

        // ── Основная точка ──
        ctx.shadowColor = color
        ctx.shadowBlur  = 10 * intensity
        ctx.fillStyle   = color
        ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI*2); ctx.fill()
        ctx.shadowBlur  = 0

        // ── Белый центр ──
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, Math.PI*2); ctx.fill()
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    if (showDots) {
      draw()
    } else {
      const canvas = canvasRef.current
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [zones, view, showDots])

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current
      if (!c) return
      const dpr = window.devicePixelRatio || 1
      const rect = c.getBoundingClientRect()
      c.width  = rect.width  * dpr
      c.height = rect.height * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden"
         style={{ background: 'radial-gradient(ellipse at 50% 40%, #1a2540 0%, #111827 100%)' }}>

      <img
        key={imgSrc}
        src={imgSrc}
        alt=""
        onLoad={() => setHasImg(true)}
        onError={() => setHasImg(false)}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {!hasImg && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[#64748B] text-[11px]">
            {view === 'side' ? 'Поместите car-side.png в frontend/public/' : 'Поместите car.png в frontend/public/'}
          </span>
        </div>
      )}

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
