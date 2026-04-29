import { useEffect, useRef, useState } from 'react'

const ZONES = [
  { x: 0.36, y: 0.50, color: '#EF4444' }, // Двигатель
  { x: 0.46, y: 0.44, color: '#F59E0B' }, // Ремень / навесное
  { x: 0.27, y: 0.56, color: '#60A5FA' }, // Впускная
  { x: 0.68, y: 0.62, color: '#A855F7' }, // Выхлоп
]

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

export default function CarView({ zones = [0.5, 0.3, 0.2, 0.1] }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const phaseRef  = useRef(0)
  const [hasImg, setHasImg] = useState(false)

  // Canvas — только точки, прозрачный фон, учитываем devicePixelRatio
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

      phaseRef.current += 0.05
      ZONES.forEach(({ x, y, color }, i) => {
        const intensity = Math.max(0, Math.min(1, zones[i] ?? 0.3))
        const pulse = (Math.sin(phaseRef.current + i * 1.4) + 1) / 2
        const [r, g, b] = hexToRgb(color)
        const dx = x * w, dy = y * h

        // Внешнее кольцо
        const rr = (12 + pulse * 22) * (0.5 + intensity * 0.5)
        const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, rr)
        grad.addColorStop(0, `rgba(${r},${g},${b},${0.5 * intensity * (1 - pulse)})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI*2); ctx.fill()

        // Среднее кольцо
        ctx.fillStyle = `rgba(${r},${g},${b},${0.35 * intensity})`
        ctx.beginPath(); ctx.arc(dx, dy, 13 + intensity*5, 0, Math.PI*2); ctx.fill()

        // Основная точка с glow
        ctx.shadowColor = color
        ctx.shadowBlur = 10 * intensity
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(dx, dy, 7, 0, Math.PI*2); ctx.fill()
        ctx.shadowBlur = 0

        // Белый центр
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.beginPath(); ctx.arc(dx, dy, 2.5, 0, Math.PI*2); ctx.fill()
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [zones])

  // Resize с учётом devicePixelRatio
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

      {/* Картинка — нативный <img> для максимального качества */}
      <img
        src="/car.png"
        alt=""
        onLoad={() => setHasImg(true)}
        onError={() => setHasImg(false)}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {!hasImg && (
        <div className="absolute inset-0 flex items-end justify-center pb-3">
          <span className="text-[#64748B] text-[11px]">Поместите car.png в frontend/public/</span>
        </div>
      )}

      {/* Canvas только для точек */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
