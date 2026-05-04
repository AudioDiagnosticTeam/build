import { useEffect, useRef, useState } from 'react'
import { X, Mic, MicOff, Volume2, Play, RotateCcw } from 'lucide-react'

const REC_SEC = 5

export default function MicTestOverlay({ onClose }) {
  const canvasRef    = useRef(null)
  const animRef      = useRef(null)
  const streamRef    = useRef(null)
  const ctxRef       = useRef(null)
  const analyserRef  = useRef(null)
  const recorderRef  = useRef(null)
  const chunksRef    = useRef([])
  const audioRef     = useRef(null)

  const [level,    setLevel]    = useState(0)
  const [status,   setStatus]   = useState('connecting') // connecting | ok | error
  const [errorMsg, setErrorMsg] = useState('')
  const [recState, setRecState] = useState('idle')       // idle | recording | done
  const [countdown,setCountdown]= useState(REC_SEC)
  const [audioUrl, setAudioUrl] = useState(null)
  const [playing,  setPlaying]  = useState(false)

  // ── Старт микрофона ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Всегда audio:true — браузерный deviceId ≠ sounddevice index
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        const audioCtx = new AudioContext()
        ctxRef.current  = audioCtx
        const source    = audioCtx.createMediaStreamSource(stream)
        const analyser  = audioCtx.createAnalyser()
        analyser.fftSize       = 2048
        analyser.smoothingTimeConstant = 0.8
        analyserRef.current = analyser
        source.connect(analyser)
        setStatus('ok')
        requestAnimationFrame(draw)
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(
            e.name === 'NotAllowedError'  ? 'Доступ к микрофону запрещён. Разрешите в браузере.' :
            e.name === 'NotFoundError'    ? 'Микрофон не найден.' :
            e.name === 'NotReadableError' ? 'Микрофон занят другим приложением.' :
            e.message
          )
        }
      }
    }

    function draw() {
      if (cancelled || !analyserRef.current || !canvasRef.current) return
      const analyser = analyserRef.current
      const canvas   = canvasRef.current
      const buf      = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)

      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
      const lvl = Math.min(1, rms * 10)
      setLevel(lvl)

      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      const W   = canvas.clientWidth
      const H   = canvas.clientHeight
      if (canvas.width !== W * dpr)  canvas.width  = W * dpr
      if (canvas.height !== H * dpr) canvas.height = H * dpr
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      const waveColor = lvl > 0.65 ? '#EF4444' : lvl > 0.3 ? '#F59E0B' : '#22C55E'
      ctx.strokeStyle = waveColor
      ctx.lineWidth   = 1.5
      ctx.beginPath()
      for (let i = 0; i < buf.length; i++) {
        const x = (i / buf.length) * W
        const y = H / 2 + buf[i] * H * 0.42
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()

      animRef.current = requestAnimationFrame(draw)
    }

    init()
    return () => {
      cancelled = true
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close()
    }
  }, [])

  // ── Запись ──────────────────────────────────────────────────
  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }

    const recorder = new MediaRecorder(streamRef.current)
    recorderRef.current = recorder
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      setAudioUrl(URL.createObjectURL(blob))
      setRecState('done')
    }
    recorder.start()
    setRecState('recording')
    setCountdown(REC_SEC)

    let t = REC_SEC
    const iv = setInterval(() => {
      t--
      setCountdown(t)
      if (t <= 0) { clearInterval(iv); recorder.stop() }
    }, 1000)
  }

  function resetRec() {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null); setRecState('idle'); setPlaying(false); setCountdown(REC_SEC)
  }

  function togglePlay() {
    const a = audioRef.current; if (!a) return
    playing ? a.pause() : a.play()
  }

  const barColor = level > 0.65 ? '#EF4444' : level > 0.3 ? '#F59E0B' : '#22C55E'
  const BARS = 26

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[480px] bg-[#111827] border border-[#1E2D45] rounded-2xl p-6 shadow-2xl"
           onClick={e => e.stopPropagation()}>

        <button onClick={onClose}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0] transition-colors">
          <X size={16} />
        </button>

        {/* Шапка */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
               style={{
                 background: status === 'ok' ? '#22C55E18' : '#1A2235',
                 border: `1px solid ${status === 'ok' ? '#22C55E40' : '#1E2D45'}`
               }}>
            {status === 'ok'
              ? <Mic size={16} className="text-[#22C55E]" />
              : <MicOff size={16} className="text-[#475569]" />}
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#E2E8F0]">Проверка микрофона</p>
            <p className="text-[11px] text-[#64748B]">
              {status === 'connecting' ? 'Запрос доступа к микрофону...' :
               status === 'error'      ? errorMsg :
               recState === 'recording' ? `Идёт запись — ${countdown} сек` :
               recState === 'done'      ? 'Запись готова — нажмите Play' :
               'Говорите — микрофон активен'}
            </p>
          </div>
        </div>

        {status === 'error' ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl mb-4">
            <MicOff size={16} className="text-[#EF4444] shrink-0" />
            <p className="text-[12px] text-[#EF4444]">{errorMsg}</p>
          </div>
        ) : (
          <>
            {/* Осциллограмма */}
            <div className="relative bg-[#0C1120] rounded-xl overflow-hidden mb-3" style={{ height: 76 }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {status === 'connecting' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#475569] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#475569] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-[#475569] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              {recState === 'recording' && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-[#0C1120]/80 border border-[#EF4444]/50 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
                  <span className="text-[10px] text-[#EF4444] font-mono font-bold">{countdown}s</span>
                </div>
              )}
            </div>

            {/* Уровень сигнала */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Volume2 size={11} className="text-[#64748B]" />
                  <span className="text-[10px] text-[#64748B]">Уровень сигнала</span>
                </div>
                <span className="text-[10px] font-mono font-semibold" style={{ color: barColor }}>
                  {Math.round(level * 100)}%
                </span>
              </div>
              <div className="flex gap-0.5 h-4 items-end">
                {Array.from({ length: BARS }).map((_, i) => {
                  const thr = i / BARS
                  const lit = level > thr
                  const c   = thr > 0.7 ? '#EF4444' : thr > 0.4 ? '#F59E0B' : '#22C55E'
                  return (
                    <div key={i} className="flex-1 rounded-sm"
                         style={{
                           height: `${35 + (i / BARS) * 65}%`,
                           background: lit ? c : '#1E2D45',
                           opacity: lit ? 1 : 0.3,
                           transition: 'background 0.08s',
                         }} />
                  )
                })}
              </div>
            </div>

            {/* Подсказка */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] mb-4 border ${
              level > 0.65 ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20' :
              level > 0.1  ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20' :
                             'bg-[#1A2235] text-[#64748B] border-[#1E2D45]'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: barColor }} />
              {level > 0.65 ? 'Перегрузка — уменьшите усиление в настройках' :
               level > 0.1  ? 'Микрофон работает нормально' :
               status === 'ok' ? 'Тихо — говорите в микрофон' : 'Ожидание доступа...'}
            </div>

            {/* Кнопка записи */}
            {recState === 'idle' && (
              <button onClick={startRecording} disabled={status !== 'ok'}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#EF4444' }}>
                <span className="w-3 h-3 rounded-full bg-white" />
                Записать {REC_SEC} секунд
              </button>
            )}

            {recState === 'recording' && (
              <div className="w-full py-2.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                <span className="text-[12px] font-semibold text-[#EF4444]">Запись... {countdown} сек</span>
              </div>
            )}

            {recState === 'done' && audioUrl && (
              <>
                <audio ref={audioRef} src={audioUrl}
                  onEnded={() => setPlaying(false)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)} />

                <div className="flex items-center gap-3 bg-[#1A2235] border border-[#1E2D45] rounded-xl px-4 py-3">
                  <button onClick={togglePlay}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{ background: 'var(--accent)' }}>
                    {playing
                      ? <span className="flex gap-[3px]">
                          <span className="w-[3px] h-3.5 bg-white rounded-sm"/>
                          <span className="w-[3px] h-3.5 bg-white rounded-sm"/>
                        </span>
                      : <Play size={13} fill="white" className="ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-[#E2E8F0]">Тест {REC_SEC} сек</p>
                    <p className="text-[10px] text-[#64748B]">
                      {playing ? 'Воспроизведение...' : 'Нажмите для прослушивания'}
                    </p>
                  </div>
                  <button onClick={resetRec} title="Записать снова"
                    className="text-[#475569] hover:text-[#E2E8F0] transition-colors">
                    <RotateCcw size={13} />
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <button onClick={onClose}
          className="w-full mt-3 py-2 rounded-xl text-[12px] font-semibold text-[#64748B] hover:text-[#E2E8F0] bg-[#1A2235] hover:bg-[#1E2D45] transition-colors border border-[#1E2D45]">
          Закрыть
        </button>
      </div>
    </div>
  )
}
