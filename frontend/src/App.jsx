import { useState, useEffect, useRef } from 'react'
import './index.css'
import Sidebar         from './components/Sidebar'
import Header          from './components/Header'
import Footer          from './components/Footer'
import DiagnosticsPage from './components/DiagnosticsPage'
import SettingsPanel   from './components/SettingsPanel'

const FAULT_WEIGHTS = {
  НОРМА:   [0.03, 0.03, 0.02, 0.02],
  ДРЕБЕЗГ: [0.20, 0.70, 0.05, 0.40],
  СВИСТ:   [0.10, 0.60, 0.50, 0.10],
  СКРИП:   [0.30, 0.35, 0.10, 0.50],
  СТУК:    [0.90, 0.20, 0.05, 0.10],
}

function computeSources(probs) {
  const vals = [0, 0, 0, 0]
  for (const [cls, p] of Object.entries(probs)) {
    const w = FAULT_WEIGHTS[cls] ?? [0,0,0,0]
    w.forEach((wi, i) => { vals[i] += p * wi })
  }
  return vals.map(v => Math.min(1, v))
}

export default function App() {
  const [page,         setPage]         = useState('diag')
  const [showSettings, setShowSettings] = useState(true)
  const [recording,    setRecording]    = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [waveData,     setWaveData]     = useState(null)
  const [predictions,  setPredictions]  = useState(null)
  const [sourceValues, setSourceValues] = useState([0.5, 0.3, 0.2, 0.1])
  const [status,       setStatus]       = useState({
    title: 'Инициализация...', sub: 'Загрузка', level: 'warn'
  })

  const wsRef    = useRef(null)
  const clockRef = useRef(null)

  // ── WebSocket → FastAPI backend ───────────────────────────────
  useEffect(() => {
    connectWS()
    return () => wsRef.current?.close()
  }, [])

  function connectWS() {
    try {
      const ws = new WebSocket('ws://localhost:8000/ws')
      wsRef.current = ws

      ws.onopen    = () => setStatus({ title: 'Подключено', sub: 'Сервер запущен', level: 'ok' })
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'waveform')    setWaveData(msg.data)
        if (msg.type === 'prediction') {
          setPredictions(msg.data)
          setSourceValues(computeSources(msg.data))
        }
        if (msg.type === 'status')
          setStatus({ title: msg.title, sub: msg.sub, level: msg.level })
      }
      ws.onclose = () => {
        setStatus({ title: 'Нет соединения', sub: 'Переподключение...', level: 'err' })
        setTimeout(connectWS, 3000)
      }
      ws.onerror = () =>
        setStatus({ title: 'Без сервера', sub: 'Только демо-режим', level: 'warn' })
    } catch {
      setStatus({ title: 'Без сервера', sub: 'Только демо-режим', level: 'warn' })
    }
  }

  // ── Таймер ────────────────────────────────────────────────────
  useEffect(() => {
    if (recording) {
      clockRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(clockRef.current)
    }
    return () => clearInterval(clockRef.current)
  }, [recording])

  function handleToggleRecord() {
    const next = !recording
    setRecording(next)
    if (!next) setElapsed(0)
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: next ? 'start' : 'stop' }))
    setStatus(next
      ? { title: 'Запись идёт...', sub: 'Анализ в реальном времени', level: 'ok' }
      : { title: 'Остановлено',    sub: 'Нажмите для новой записи',   level: 'warn' }
    )
  }

  function handleNav(id) {
    if (id === 'settings') { setShowSettings(s => !s); return }
    setPage(id)
  }

  return (
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
              />
            )}
            {page === 'history' && (
              <div className="flex items-center justify-center h-full text-[#64748B] text-base">
                История диагностик
              </div>
            )}
          </main>

          {showSettings && <SettingsPanel />}
        </div>

        <Footer />
      </div>
    </div>
  )
}
