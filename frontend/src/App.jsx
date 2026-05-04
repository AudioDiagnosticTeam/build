import { useState, useEffect, useRef } from 'react'
import './index.css'
import { LangProvider } from './i18n'
import Sidebar         from './components/Sidebar'
import Header          from './components/Header'
import Footer          from './components/Footer'
import DiagnosticsPage from './components/DiagnosticsPage'
import HistoryPage     from './components/HistoryPage'
import TrainingPage    from './components/TrainingPage'
import DatasetPage     from './components/DatasetPage'
import SettingsPanel   from './components/SettingsPanel'

const FAULT_BG = new Set(['НОРМА', 'РЕЧЬ'])

function getTopFaultClass(preds) {
  if (!preds) return null
  const zeros = getZeroWeightClasses()
  const entries = Object.entries(preds)
    .filter(([cls, p]) => !FAULT_BG.has(cls) && !zeros.has(cls) && p > 0.35)
    .sort((a, b) => b[1] - a[1])
  if (!entries.length || (preds['НОРМА'] ?? 0) > 0.60) return null
  return entries[0][0]
}

const FAULT_WEIGHTS = {
  НОРМА:   [0.03, 0.03, 0.02, 0.02],
  ДРЕБЕЗГ: [0.20, 0.70, 0.05, 0.40],
  СВИСТ:   [0.10, 0.60, 0.50, 0.10],
  СКРИП:   [0.30, 0.35, 0.10, 0.50],
  СТУК:    [0.90, 0.20, 0.05, 0.10],
}

function getZeroWeightClasses() {
  try {
    const ov = JSON.parse(localStorage.getItem('classWeightOverrides') || '{}')
    return new Set(Object.entries(ov).filter(([, v]) => v === 0).map(([k]) => k))
  } catch { return new Set() }
}

function computeSources(probs) {
  const zeros = getZeroWeightClasses()
  const vals = [0, 0, 0, 0]
  for (const [cls, p] of Object.entries(probs)) {
    const w = zeros.has(cls) ? [0, 0, 0, 0] : (FAULT_WEIGHTS[cls] ?? [0, 0, 0, 0])
    w.forEach((wi, i) => { vals[i] += p * wi })
  }
  return vals.map(v => Math.min(1, v))
}

function avgPredictions(list) {
  if (!list.length) return {}
  const keys = Object.keys(list[0])
  const result = {}
  for (const k of keys)
    result[k] = list.reduce((s, p) => s + (p[k] ?? 0), 0) / list.length
  return result
}

export default function App() {
  const [page,         setPage]         = useState('diag')
  const [showSettings, setShowSettings] = useState(true)
  const [recording,    setRecording]    = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [waveData,     setWaveData]     = useState(null)
  const [predictions,  setPredictions]  = useState(null)
  const [sourceValues, setSourceValues] = useState([0.3, 0.2, 0.1, 0.05])
  const [status,       setStatus]       = useState({ title: 'Инициализация...', sub: 'Загрузка', level: 'warn' })
  const [history,      setHistory]      = useState([])
  const [dots,            setDots]            = useState(true)
  const [audioDevice,     setAudioDevice]     = useState(null)
  const [micGain,         setMicGain]         = useState(70)
  const [trainingActive,  setTrainingActive]  = useState(false)
  const [navPending,      setNavPending]      = useState(null)  // куда хотели уйти

  const wsRef            = useRef(null)
  const clockRef         = useRef(null)
  const sessionPreds     = useRef([])
  const sessionStart     = useRef(null)
  const recordingRef     = useRef(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const consecutiveBuf   = useRef([])   // последние N топ-классов подряд

  // ── WebSocket ─────────────────────────────────────────────────
  useEffect(() => { connectWS(); return () => wsRef.current?.close() }, [])

  function connectWS() {
    try {
      const ws = new WebSocket('ws://localhost:8000/ws')
      wsRef.current = ws
      ws.onopen    = () => setStatus({ title: 'Подключено', sub: 'Сервер запущен', level: 'ok' })
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'waveform') setWaveData(msg.data)
        if (msg.type === 'prediction' && recordingRef.current) {
          setPredictions(msg.data)
          setSourceValues(computeSources(msg.data))
          sessionPreds.current.push(msg.data)

          // ── Логика N подряд → авто-событие в историю ──────────
          const topFault  = getTopFaultClass(msg.data)
          const threshold = parseInt(localStorage.getItem('consecutiveThreshold') || '3')
          const buf = consecutiveBuf.current
          if (!topFault || (buf.length > 0 && buf[buf.length - 1] !== topFault)) {
            consecutiveBuf.current = topFault ? [topFault] : []
          } else if (topFault) {
            consecutiveBuf.current = [...buf, topFault]
          }
          if (topFault && consecutiveBuf.current.length >= threshold) {
            const recent = sessionPreds.current.slice(-threshold)
            const avg    = avgPredictions(recent)
            setHistory(h => [{
              id:            Date.now(),
              startedAt:     new Date(),
              duration:      0,
              predictions:   avg,
              sourceValues:  computeSources(avg),
              timeline:      recent,
              audioBlob:     null,
              autoDetected:  true,
              detectedFault: topFault,
            }, ...h])
            consecutiveBuf.current = []
          }
        }
        if (msg.type === 'status')
          setStatus({ title: msg.title, sub: msg.sub, level: msg.level })
      }
      ws.onclose = () => {
        setStatus({ title: 'Нет соединения', sub: 'Переподключение...', level: 'err' })
        setTimeout(connectWS, 3000)
      }
      ws.onerror = () => setStatus({ title: 'Без сервера', sub: 'Только демо-режим', level: 'warn' })
    } catch {
      setStatus({ title: 'Без сервера', sub: 'Только демо-режим', level: 'warn' })
    }
  }

  // ── Таймер ───────────────────────────────────────────────────
  useEffect(() => {
    if (recording) clockRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    else clearInterval(clockRef.current)
    return () => clearInterval(clockRef.current)
  }, [recording])

  // ── Запись ───────────────────────────────────────────────────
  function handleToggleRecord() {
    const next = !recording
    setRecording(next)

    if (next) {
      recordingRef.current = true
      sessionPreds.current = []
      audioChunksRef.current = []
      consecutiveBuf.current = []
      sessionStart.current = new Date()
      setElapsed(0)
      setPredictions(null)
      setSourceValues([0, 0, 0, 0])
      setStatus({ title: 'Запись идёт...', sub: 'Анализ в реальном времени', level: 'ok' })

      // Захватываем аудио для сохранения в историю
      navigator.mediaDevices?.getUserMedia({ audio: true })
        .then(stream => {
          const mr = new MediaRecorder(stream)
          mediaRecorderRef.current = mr
          mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
          mr.start(500)
        })
        .catch(() => { mediaRecorderRef.current = null })

    } else {
      recordingRef.current = false
      const preds     = sessionPreds.current
      const sessionId = Date.now()
      const hasPreds  = preds.length > 0

      if (hasPreds) {
        const avg = avgPredictions(preds)
        setHistory(h => [{
          id:           sessionId,
          startedAt:    sessionStart.current,
          duration:     elapsed,
          predictions:  avg,
          sourceValues: computeSources(avg),
          timeline:     preds,
          audioBlob:    null,
        }, ...h])
      }

      // Останавливаем MediaRecorder и сохраняем аудио
      const mr = mediaRecorderRef.current
      if (mr && mr.state !== 'inactive') {
        mr.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const url  = URL.createObjectURL(blob)
          mr.stream.getTracks().forEach(t => t.stop())
          if (hasPreds)
            setHistory(h => h.map(e => e.id === sessionId ? { ...e, audioBlob: url } : e))
        }
        mr.stop()
      }

      setStatus({ title: 'Остановлено', sub: 'Нажмите для новой записи', level: 'warn' })
    }

    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({
        type:     next ? 'start' : 'stop',
        device:   audioDevice,
        gain:     (micGain / 50),
        ...(next ? { step_sec: parseFloat(localStorage.getItem('inferenceInterval') || '5') } : {}),
      }))
  }

  function handleNav(id) {
    if (id === 'settings') { setShowSettings(s => !s); return }
    if (trainingActive && id !== 'training') { setNavPending(id); return }
    setPage(id)
  }

  function confirmLeave() {
    setTrainingActive(false)
    setPage(navPending)
    setNavPending(null)
  }

  function cancelLeave() {
    setNavPending(null)
  }

  return (
    <LangProvider>
    <div className="flex w-screen h-screen overflow-hidden bg-[#0C1120]">
      <Sidebar active={page} onChange={handleNav} />

      <div className="flex flex-col flex-1 min-w-0">
        <Header
          recording={recording}
          onToggleRecord={handleToggleRecord}
          onToggleSettings={() => setShowSettings(s => !s)}
          status={status}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 overflow-hidden">
            {page === 'diag' && (
              <DiagnosticsPage
                waveData={waveData}
                predictions={predictions}
                sourceValues={sourceValues}
                elapsed={elapsed}
                showDots={dots}
              />
            )}
            {page === 'history' && (
              <HistoryPage history={history} onClear={() => setHistory([])} />
            )}
            {page === 'training' && <TrainingPage onTrainingChange={setTrainingActive} />}
            {page === 'dataset'  && <DatasetPage />}
          </main>
          {showSettings && (
            <SettingsPanel
              dots={dots} onDotsChange={setDots}
              micGain={micGain} onMicGainChange={setMicGain}
              audioDevice={audioDevice} onAudioDeviceChange={setAudioDevice}
            />
          )}
        </div>

        <Footer />
      </div>
    </div>

    {/* Оверлей подтверждения прерывания обучения */}
    {navPending && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 bg-[#111827] border border-[#1E2D45] rounded-2xl px-8 py-7 shadow-2xl max-w-[360px] w-full mx-4">
          <div className="text-3xl mb-4 text-center">⚠️</div>
          <p className="text-[15px] font-bold text-[#E2E8F0] text-center mb-2">Прервать обучение?</p>
          <p className="text-[12px] text-[#64748B] text-center mb-6">Обучение модели ещё идёт. Если уйти — прогресс будет потерян.</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={confirmLeave}
              className="w-full py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-[13px] font-semibold transition-colors"
            >
              Да, прервать обучение
            </button>
            <button
              onClick={cancelLeave}
              className="w-full py-2.5 rounded-xl bg-[#1A2235] hover:bg-[#1E2D45] text-[#E2E8F0] text-[13px] font-semibold transition-colors border border-[#1E2D45]"
            >
              Продолжить обучение
            </button>
          </div>
        </div>
      </div>
    )}
    </LangProvider>
  )
}
