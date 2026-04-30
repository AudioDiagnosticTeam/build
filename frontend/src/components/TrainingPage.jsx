import { useState, useEffect, useRef } from 'react'
import { Play, Square, Brain, FolderOpen, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

// ── Мини SVG-чарт accuracy / loss ────────────────────────────────────────────
function LineChart({ series, height = 100 }) {
  const w = 480, h = height, pad = 6
  const inner_w = w - pad * 2
  const inner_h = h - pad * 2

  if (!series?.length || !series[0]?.data?.length) return (
    <div className="flex items-center justify-center text-[#475569] text-[11px]" style={{ height }}>
      Нет данных
    </div>
  )

  const n = series[0].data.length

  const allVals = series.flatMap(s => s.data)
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)
  const range = maxV - minV || 1

  const px = (i) => pad + (i / Math.max(n - 1, 1)) * inner_w
  const py = (v) => pad + (1 - (v - minV) / range) * inner_h

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = pad + t * inner_h
        return <line key={t} x1={pad} y1={y} x2={w - pad} y2={y}
                     stroke="#1E2D45" strokeWidth="1" strokeDasharray="4,3" />
      })}

      {/* Lines */}
      {series.map(({ data, color, label }) => {
        const pts = data.map((v, i) => `${px(i)},${py(v)}`).join(' ')
        return <polyline key={label} points={pts} fill="none"
                         stroke={color} strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round" />
      })}

      {/* Last value dots */}
      {series.map(({ data, color }) => {
        if (!data.length) return null
        const i = data.length - 1
        return <circle key={color} cx={px(i)} cy={py(data[i])} r="3" fill={color} />
      })}
    </svg>
  )
}

// ── Лог обучения ──────────────────────────────────────────────────────────────
function TrainLog({ logs }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.scrollTo({ top: 9999, behavior: 'smooth' }) }, [logs])

  return (
    <div ref={ref} className="bg-[#080E1A] rounded-lg p-3 h-36 overflow-y-auto font-mono text-[10px] leading-relaxed">
      {logs.length === 0
        ? <span className="text-[#475569]">Лог пуст — нажмите «Начать обучение»</span>
        : logs.map((l, i) => (
          <div key={i} className={
            l.type === 'error'   ? 'text-[#EF4444]' :
            l.type === 'success' ? 'text-[#22C55E]' :
            l.type === 'epoch'   ? 'text-[#60A5FA]' :
                                   'text-[#64748B]'
          }>
            <span className="text-[#1E2D45] mr-1">{l.time}</span>{l.text}
          </div>
        ))
      }
    </div>
  )
}

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function TrainingPage() {
  const [datasetPath, setDatasetPath] = useState(String.raw`C:\Users\Mi\Desktop\itog`)
  const [epochs,      setEpochs]      = useState(40)
  const [batchSize,   setBatchSize]   = useState(32)
  const [lr,          setLr]          = useState(0.001)
  const [augment,     setAugment]     = useState(true)

  const [training,    setTraining]    = useState(false)
  const [phase,       setPhase]       = useState('idle')  // idle | loading | running | done | error
  const [progress,    setProgress]    = useState({ epoch: 0, total: 0, best_acc: 0 })
  const [logs,        setLogs]        = useState([])

  const [trainAcc,   setTrainAcc]   = useState([])
  const [testAcc,    setTestAcc]    = useState([])
  const [trainLoss,  setTrainLoss]  = useState([])
  const [testLoss,   setTestLoss]   = useState([])

  const wsRef = useRef(null)

  function addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(l => [...l, { text, type, time }])
  }

  function connectAndTrain() {
    if (wsRef.current) wsRef.current.close()

    const ws = new WebSocket('ws://localhost:8000/ws/train')
    wsRef.current = ws

    ws.onopen = () => {
      setPhase('loading')
      addLog('Подключено к серверу обучения')
      ws.send(JSON.stringify({
        type: 'train_start',
        dataset_path: datasetPath,
        epochs, batch_size: batchSize, lr, augment,
      }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)

      if (msg.type === 'train_log') {
        addLog(msg.text)
      }
      if (msg.type === 'train_started') {
        setPhase('running')
        setProgress({ epoch: 0, total: msg.epochs, best_acc: 0 })
        addLog(`Старт: ${msg.samples} образцов, ${msg.epochs} эпох, устройство: ${msg.device}`, 'info')
        // Сброс графиков
        setTrainAcc([]); setTestAcc([]); setTrainLoss([]); setTestLoss([])
      }
      if (msg.type === 'train_progress') {
        setProgress({ epoch: msg.epoch, total: msg.total, best_acc: msg.best_acc })
        setTrainAcc(a  => [...a,  msg.train_acc])
        setTestAcc(a   => [...a,  msg.test_acc])
        setTrainLoss(a => [...a,  msg.train_loss])
        setTestLoss(a  => [...a,  msg.test_loss])
        addLog(
          `Эп ${msg.epoch}/${msg.total} | Train ${(msg.train_acc*100).toFixed(1)}% | Val ${(msg.test_acc*100).toFixed(1)}% | LR ${msg.lr}`,
          'epoch'
        )
      }
      if (msg.type === 'train_complete') {
        setPhase('done')
        setTraining(false)
        addLog(`Обучение завершено! Лучшая точность: ${(msg.best_acc*100).toFixed(1)}%`, 'success')
        addLog(`Классы: ${msg.classes.join(', ')}`, 'success')
      }
      if (msg.type === 'train_error') {
        setPhase('error')
        setTraining(false)
        addLog(`Ошибка: ${msg.text}`, 'error')
      }
    }

    ws.onclose   = () => { if (phase === 'running') addLog('Соединение закрыто') }
    ws.onerror   = () => { addLog('Ошибка WebSocket', 'error'); setPhase('error'); setTraining(false) }
  }

  function handleStart() {
    setTraining(true)
    setLogs([])
    connectAndTrain()
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: 'train_stop' }))
    setTraining(false)
    setPhase('idle')
    addLog('Остановка запрошена...')
  }

  useEffect(() => () => wsRef.current?.close(), [])

  const epochPct = progress.total ? Math.round((progress.epoch / progress.total) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4 max-w-3xl mx-auto">

      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
          <Brain size={18} className="text-[#3B82F6]" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-[#E2E8F0]">Обучение модели</h2>
          <p className="text-[11px] text-[#64748B]">CNN · MFCC · обучение с нуля на вашем датасете</p>
        </div>
      </div>

      {/* Параметры */}
      <div className="bg-[#111827] border border-[#1E2D45] rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-[#E2E8F0]">Параметры</p>

        {/* Путь к датасету */}
        <div>
          <label className="text-[11px] text-[#64748B] block mb-1">Путь к датасету</label>
          <div className="flex gap-2">
            <input
              value={datasetPath}
              onChange={e => setDatasetPath(e.target.value)}
              disabled={training}
              placeholder="C:\path\to\dataset"
              className="flex-1 bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-2
                text-[12px] text-[#E2E8F0] outline-none focus:border-[#3B82F6]
                disabled:opacity-50 font-mono"
            />
            <button className="w-9 h-9 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-lg text-[#64748B] hover:text-[#E2E8F0] hover:border-[#3B82F6] transition-colors">
              <FolderOpen size={15} />
            </button>
          </div>
          <p className="text-[10px] text-[#475569] mt-1">
            Папки внутри = классы (НОРМА, СТУК, СВИСТ, ...). Поддерживаются .wav и .mp3
          </p>
        </div>

        {/* Гиперпараметры */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Эпохи', val: epochs, set: setEpochs, min: 5, max: 200, step: 5 },
            { label: 'Батч', val: batchSize, set: setBatchSize, min: 8, max: 128, step: 8 },
          ].map(({ label, val, set, min, max, step }) => (
            <div key={label}>
              <label className="text-[11px] text-[#64748B] block mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input type="range" min={min} max={max} step={step} value={val}
                  onChange={e => set(Number(e.target.value))} disabled={training}
                  className="flex-1 h-1 rounded appearance-none bg-[#1E2D45] accent-[#3B82F6] cursor-pointer" />
                <span className="text-[11px] font-semibold text-[#E2E8F0] w-8 text-right">{val}</span>
              </div>
            </div>
          ))}
          <div>
            <label className="text-[11px] text-[#64748B] block mb-1">Learning rate</label>
            <select value={lr} onChange={e => setLr(Number(e.target.value))} disabled={training}
              className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-md px-2 py-1.5
                text-[11px] text-[#E2E8F0] outline-none">
              {[0.0001, 0.0005, 0.001, 0.003, 0.01].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Аугментация */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#E2E8F0]">Аугментация данных</p>
            <p className="text-[10px] text-[#475569]">×3 копии с шумом, сдвигом, громкостью</p>
          </div>
          <button onClick={() => setAugment(a => !a)} disabled={training}
            className={`w-11 h-6 rounded-full relative transition-colors ${augment ? 'bg-[#3B82F6]' : 'bg-[#1E2D45]'} disabled:opacity-50`}>
            <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full transition-all ${augment ? 'left-[23px]' : 'left-[3px]'}`} />
          </button>
        </div>

        {/* Кнопка */}
        <button
          onClick={training ? handleStop : handleStart}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-[13px] text-white transition-colors ${
            training ? 'bg-[#EF4444] hover:bg-[#DC2626]' : 'bg-[#3B82F6] hover:bg-[#2563EB]'
          }`}
        >
          {training
            ? <><Square size={14} fill="white" /> Остановить обучение</>
            : <><Play  size={14} fill="white" /> Начать обучение</>
          }
        </button>
      </div>

      {/* Прогресс */}
      {phase !== 'idle' && (
        <div className="bg-[#111827] border border-[#1E2D45] rounded-xl p-4 flex flex-col gap-3">

          {/* Статус */}
          <div className="flex items-center gap-2">
            {phase === 'done'    && <CheckCircle   size={16} className="text-[#22C55E]" />}
            {phase === 'error'   && <AlertTriangle size={16} className="text-[#EF4444]" />}
            {phase === 'running' && <RefreshCw     size={16} className="text-[#3B82F6] animate-spin" />}
            {phase === 'loading' && <RefreshCw     size={16} className="text-[#F59E0B] animate-spin" />}
            <span className={`text-[12px] font-semibold ${
              phase === 'done' ? 'text-[#22C55E]' : phase === 'error' ? 'text-[#EF4444]' : 'text-[#E2E8F0]'
            }`}>
              {phase === 'idle'    && 'Ожидание'}
              {phase === 'loading' && 'Загрузка датасета...'}
              {phase === 'running' && `Эпоха ${progress.epoch} / ${progress.total} · Лучшая точность ${(progress.best_acc*100).toFixed(1)}%`}
              {phase === 'done'    && `Готово · Лучшая точность ${(progress.best_acc*100).toFixed(1)}%`}
              {phase === 'error'   && 'Ошибка обучения'}
            </span>
          </div>

          {/* Progress bar */}
          {(phase === 'running' || phase === 'done') && (
            <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
              <div className="h-full bg-[#3B82F6] rounded-full transition-all duration-300"
                   style={{ width: `${epochPct}%` }} />
            </div>
          )}

          {/* Графики */}
          {(trainAcc.length > 1) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-[#64748B] mb-1">Точность (Accuracy)</p>
                <LineChart height={90} series={[
                  { data: trainAcc, color: '#3B82F6', label: 'Train' },
                  { data: testAcc,  color: '#22C55E', label: 'Val'   },
                ]} />
                <div className="flex gap-3 mt-1">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3B82F6]"/><span className="text-[9px] text-[#64748B]">Train</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E]"/><span className="text-[9px] text-[#64748B]">Val</span></div>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[#64748B] mb-1">Потери (Loss)</p>
                <LineChart height={90} series={[
                  { data: trainLoss, color: '#F59E0B', label: 'Train' },
                  { data: testLoss,  color: '#EF4444', label: 'Val'   },
                ]} />
                <div className="flex gap-3 mt-1">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#F59E0B]"/><span className="text-[9px] text-[#64748B]">Train</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#EF4444]"/><span className="text-[9px] text-[#64748B]">Val</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Лог */}
          <div>
            <p className="text-[11px] text-[#64748B] mb-1">Лог</p>
            <TrainLog logs={logs} />
          </div>
        </div>
      )}
    </div>
  )
}
