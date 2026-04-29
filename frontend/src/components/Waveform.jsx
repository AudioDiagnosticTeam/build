import { useEffect, useRef } from 'react'

export default function Waveform({ data }) {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)
  const phaseRef  = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      const { width: w, height: h } = canvas
      ctx.clearRect(0, 0, w, h)

      const buf = data && data.length > 0 ? data : generateDemo()
      const n   = buf.length
      const bw  = Math.max(2, Math.floor(w / n) - 1)
      const mid = h / 2

      buf.forEach((val, i) => {
        const x  = (i / n) * w
        const bh = Math.abs(val) * mid * 0.88
        const alpha = 0.55 + 0.45 * Math.abs(val)

        // Top bar
        ctx.fillStyle = `rgba(59,130,246,${alpha})`
        ctx.fillRect(x, mid - bh, bw, bh)

        // Mirror (dimmer)
        ctx.fillStyle = `rgba(59,130,246,${alpha * 0.35})`
        ctx.fillRect(x, mid, bw, bh * 0.55)
      })

      phaseRef.current += 0.12
      animRef.current = requestAnimationFrame(draw)
    }

    function generateDemo() {
      const ph = phaseRef.current
      return Array.from({ length: 90 }, (_, i) => {
        const t = i / 90
        return (
          0.45 * Math.sin(ph * 2.1 + t * 6) +
          0.28 * Math.sin(ph * 3.7 + t * 12 + 1.2) +
          0.17 * Math.sin(ph * 7.3 + t * 3 + 0.5) +
          (Math.random() - 0.5) * 0.12
        )
      })
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [data])

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
