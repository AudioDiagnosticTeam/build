import { useState, useEffect, useRef } from 'react'
import { Play, Square, Brain, CheckCircle, AlertTriangle, RefreshCw, Download, ExternalLink, Database, FileAudio } from 'lucide-react'
import { useLang } from '../i18n'

// ── SVG line chart ────────────────────────────────────────────────────────────
function LineChart({ series, height = 90 }) {
  const W = 480, H = height, P = 6
  const iW = W - P * 2, iH = H - P * 2

  const t = useLang()
  if (!series?.length || !series[0]?.data?.length)
    return <div className="flex items-center justify-center text-[#475569] text-[11px]" style={{ height }}>{t('train.log')}</div>

  const n    = series[0].data.length
  const all  = series.flatMap(s => s.data)
  const minV = Math.min(...all), maxV = Math.max(...all), rng = maxV - minV || 1

  const px = i => P + (i / Math.max(n - 1, 1)) * iW
  const py = v => P + (1 - (v - minV) / rng) * iH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1={P} y1={P + (1-t)*iH} x2={W-P} y2={P + (1-t)*iH}
              stroke="#1E2D45" strokeWidth="1" strokeDasharray="4,3" />
      ))}
      {series.map(({ data, color }) => (
        <polyline key={color} points={data.map((v,i) => `${px(i)},${py(v)}`).join(' ')}
                  fill="none" stroke={color} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {series.map(({ data, color }) => data.length &&
        <circle key={color} cx={px(data.length-1)} cy={py(data[data.length-1])} r="3" fill={color} />
      )}
    </svg>
  )
}

// ── Train log ─────────────────────────────────────────────────────────────────
function TrainLog({ logs }) {
  const t = useLang()
  const ref = useRef(null)
  useEffect(() => { ref.current?.scrollTo({ top: 99999, behavior: 'smooth' }) }, [logs])
  return (
    <div ref={ref} className="bg-[#080E1A] rounded-lg p-3 h-32 overflow-y-auto font-mono text-[10px] leading-relaxed">
      {!logs.length
        ? <span className="text-[#475569]">{t('train.log')}…</span>
        : logs.map((l, i) => (
          <div key={i} className={
            l.type === 'error'   ? 'text-[#EF4444]' :
            l.type === 'success' ? 'text-[#22C55E]' :
            l.type === 'epoch'   ? 'text-[#60A5FA]' : 'text-[#64748B]'
          }>
            <span className="text-[#1E2D45] mr-1">{l.time}</span>{l.text}
          </div>
        ))
      }
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
function loadZeroWeights() {
  try { return new Set(JSON.parse(localStorage.getItem('zeroWeightClasses') || '[]')) }
  catch { return new Set() }
}

export default function TrainingPage() {
  const t = useLang()
  const [datasetInfo,   setDatasetInfo]   = useState(null)
  const [zeroWeights,   setZeroWeights]   = useState(loadZeroWeights)
  const [epochs,    setEpochs]    = useState(40)
  const [batchSize, setBatchSize] = useState(32)
  const [lr,        setLr]        = useState(0.001)
  const [augment,   setAugment]   = useState(true)

  const [training, setTraining] = useState(false)
  const [phase,    setPhase]    = useState('idle')   // idle|loading|running|done|error
  const [progress, setProgress] = useState({ epoch: 0, total: 0, best_acc: 0 })
  const [loadProg, setLoadProg] = useState({ done: 0, total: 0 })
  const [logs,     setLogs]     = useState([])

  const [trainAcc,  setTrainAcc]  = useState([])
  const [testAcc,   setTestAcc]   = useState([])
  const [trainLoss, setTrainLoss] = useState([])
  const [testLoss,  setTestLoss]  = useState([])

  // HuggingFace
  const [hfRepo,   setHfRepo]   = useState('AudioDiagnosticTeam/dataset')
  const [hfStatus, setHfStatus] = useState('idle')
  const [hfMsg,    setHfMsg]    = useState('')
  const [hfDone,   setHfDone]   = useState(0)
  const [hfTotal,  setHfTotal]  = useState(0)

  const wsRef = useRef(null)

  useEffect(() => {
    fetch('http://localhost:8000/dataset')
      .then(r => r.json())
      .then(d => setDatasetInfo(d.classes ?? {}))
      .catch(() => {})
  }, [])

  function toggleZeroWeight(cls) {
    setZeroWeights(prev => {
      const next = new Set(prev)
      next.has(cls) ? next.delete(cls) : next.add(cls)
      localStorage.setItem('zeroWeightClasses', JSON.stringify([...next]))
      return next
    })
  }

  function addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    setLogs(l => [...l, { text, type, time }])
  }

  function handleMsg(msg) {
    // HuggingFace
    if (msg.type === 'hf_log')   { setHfStatus('loading'); setHfMsg(msg.text); addLog(msg.text) }
    if (msg.type === 'hf_total') { setHfTotal(msg.total); setHfDone(0) }
    if (msg.type === 'hf_file')  {
      setHfDone(msg.done + 1)
      const size = msg.size_kb ? ` (${msg.size_kb} кБ)` : ''
      setHfMsg(`[${msg.done+1}/${msg.total}] ${msg.text}${size}`)
      addLog(`↓ ${msg.text}${size}`)
    }
    if (msg.type === 'hf_done')  {
      setHfStatus('done')
      setHfMsg(`Готово! ${msg.audio} аудио-файлов скачано`)
      setHfDone(msg.total); setHfTotal(msg.total)
      addLog(`✓ Датасет сохранён: ${msg.local_path}`, 'success')
      fetch('http://localhost:8000/dataset').then(r => r.json()).then(d => setDatasetInfo(d.classes ?? {})).catch(() => {})
    }
    if (msg.type === 'hf_error') { setHfStatus('error'); setHfMsg(msg.text); addLog(`Ошибка: ${msg.text}`, 'error') }
    // Training
    if (msg.type === 'train_log')           addLog(msg.text)
    if (msg.type === 'train_progress_load') {
      setLoadProg({ done: msg.done, total: msg.total })
      addLog(msg.text)
    }
    if (msg.type === 'train_started') {
      setPhase('running'); setProgress({ epoch: 0, total: msg.epochs, best_acc: 0 })
      setTrainAcc([]); setTestAcc([]); setTrainLoss([]); setTestLoss([])
      addLog(`Старт: ${msg.samples} образцов · ${msg.epochs} эпох · ${msg.device}`, 'info')
    }
    if (msg.type === 'train_progress') {
      setProgress({ epoch: msg.epoch, total: msg.total, best_acc: msg.best_acc })
      setTrainAcc(a => [...a, msg.train_acc]); setTestAcc(a => [...a, msg.test_acc])
      setTrainLoss(a => [...a, msg.train_loss]); setTestLoss(a => [...a, msg.test_loss])
      addLog(`Эп ${msg.epoch}/${msg.total} | Train ${(msg.train_acc*100).toFixed(1)}% | Val ${(msg.test_acc*100).toFixed(1)}% | LR ${msg.lr}`, 'epoch')
    }
    if (msg.type === 'train_complete') {
      setPhase('done'); setTraining(false)
      addLog(`Готово! Лучшая точность: ${(msg.best_acc*100).toFixed(1)}% · Классы: ${msg.classes?.join(', ')}`, 'success')
    }
    if (msg.type === 'train_error') { setPhase('error'); setTraining(false); addLog(`Ошибка: ${msg.text}`, 'error') }
  }

  function openWS(onReady) {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket('ws://localhost:8000/ws/train')
    wsRef.current = ws
    ws.onopen    = () => onReady(ws)
    ws.onmessage = (e) => handleMsg(JSON.parse(e.data))
    ws.onerror   = () => { addLog('Ошибка WebSocket', 'error'); setPhase('error'); setTraining(false); setHfStatus('error') }
  }

  function handleDownloadHF() {
    setHfStatus('loading'); setHfMsg('Подключение...')
    setLogs([]); addLog(`Скачивание ${hfRepo} с HuggingFace...`)
    openWS(ws => ws.send(JSON.stringify({ type: 'hf_download', repo_id: hfRepo })))
  }

  function handleStart() {
    setTraining(true); setPhase('loading'); setLogs([])
    openWS(ws => {
      addLog('Подключено, запускаю обучение...')
      ws.send(JSON.stringify({ type: 'train_start', epochs, batch_size: batchSize, lr, augment }))
    })
  }

  function handleStop() {
    wsRef.current?.send(JSON.stringify({ type: 'train_stop' }))
    setTraining(false); setPhase('idle'); addLog('Остановка запрошена...')
  }

  useEffect(() => () => wsRef.current?.close(), [])

  const epochPct = progress.total ? Math.round((progress.epoch / progress.total) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4 max-w-3xl mx-auto w-full">

      {/* Заголовок */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
          <Brain size={18} className="text-[#3B82F6]" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-[#E2E8F0]">{t('train.title')}</h2>
          <p className="text-[11px] text-[#64748B]">{t('train.subtitle')}</p>
        </div>
      </div>

      {/* HuggingFace */}
      <div className="bg-[#111827] border border-[#1E2D45] rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#E2E8F0]">{t('train.hf_dataset')}</span>
            <a href={`https://huggingface.co/datasets/${hfRepo}`} target="_blank" rel="noreferrer"
               className="text-[#64748B] hover:text-[#3B82F6] transition-colors">
              <ExternalLink size={12} />
            </a>
          </div>
          {hfStatus === 'done' && <span className="text-[10px] text-[#22C55E] flex items-center gap-1"><CheckCircle size={11}/>{t('train.downloaded')}</span>}
          {hfStatus === 'error' && <span className="text-[10px] text-[#EF4444]">{t('train.error')}</span>}
        </div>

        <div className="flex gap-2">
          <input value={hfRepo} onChange={e => setHfRepo(e.target.value)}
            className="flex-1 bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-2 text-[12px] text-[#E2E8F0] outline-none focus:border-[#3B82F6] font-mono"
            placeholder="owner/dataset-name" />
          <button onClick={handleDownloadHF} disabled={hfStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A2235] border border-[#3B82F6]/50 text-[#3B82F6] rounded-lg text-[11px] font-semibold hover:bg-[#3B82F6]/10 disabled:opacity-50 transition-colors whitespace-nowrap">
            {hfStatus === 'loading'
              ? <><RefreshCw size={12} className="animate-spin" /> {t('train.downloading')}</>
              : <><Download size={12} /> {t('train.download')}</>
            }
          </button>
        </div>

        {hfMsg && (
          <p className={`text-[10px] truncate ${hfStatus === 'error' ? 'text-[#EF4444]' : hfStatus === 'done' ? 'text-[#22C55E]' : 'text-[#64748B]'}`}>
            {hfMsg}
          </p>
        )}

        {hfStatus === 'loading' && hfTotal > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
              <span>{t('train.progress')}</span>
              <span>{hfDone} / {hfTotal}</span>
            </div>
            <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
              <div className="h-full bg-[#3B82F6] rounded-full transition-all duration-200"
                   style={{ width: `${hfTotal ? (hfDone/hfTotal)*100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Параметры */}
      <div className="bg-[#111827] border border-[#1E2D45] rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-[#E2E8F0]">{t('train.params')}</p>

        {/* Dataset summary */}
        <div className="bg-[#0C1120] border border-[#1E2D45] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database size={12} className="text-[#64748B]" />
            <span className="text-[11px] text-[#64748B]">Датасет из раздела «Датасет»</span>
            <button
              onClick={() => fetch('http://localhost:8000/dataset').then(r => r.json()).then(d => setDatasetInfo(d.classes ?? {})).catch(() => {})}
              className="ml-auto text-[#475569] hover:text-[#E2E8F0] transition-colors"
              title="Обновить"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          {datasetInfo === null ? (
            <p className="text-[11px] text-[#475569]">Загрузка...</p>
          ) : Object.keys(datasetInfo).length === 0 ? (
            <p className="text-[11px] text-[#EF4444]">Датасет пуст — добавьте файлы в разделе «Датасет»</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(datasetInfo).map(([cls, info]) => {
                  const isZero = zeroWeights.has(cls)
                  return (
                    <button
                      key={cls}
                      onClick={() => toggleZeroWeight(cls)}
                      title={isZero ? 'Нулевой вес — нажмите чтобы снять' : 'Нажмите чтобы назначить нулевой вес'}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 border transition-all"
                      style={isZero
                        ? { background: '#1A2235', borderColor: '#374151', opacity: 0.5 }
                        : { background: '#1A2235', borderColor: '#1E2D45' }}
                    >
                      {isZero && <span className="text-[9px] font-bold text-[#64748B]">0×</span>}
                      <span className={`text-[11px] font-semibold ${isZero ? 'line-through text-[#64748B]' : 'text-[#E2E8F0]'}`}>{cls}</span>
                      <span className="flex items-center gap-0.5 text-[10px] text-[#64748B]">
                        <FileAudio size={9} />
                        {info.count}
                      </span>
                    </button>
                  )
                })}
              </div>
              {zeroWeights.size > 0 && (
                <p className="text-[10px] text-[#475569] mt-1">
                  Классы с 0× не влияют на индикаторы неисправностей в диагностике
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('train.epochs'), val: epochs, set: setEpochs, min: 5, max: 200, step: 5 },
            { label: t('train.batch'),  val: batchSize, set: setBatchSize, min: 8, max: 128, step: 8 },
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
              className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-md px-2 py-1.5 text-[11px] text-[#E2E8F0] outline-none">
              {[0.0001, 0.0005, 0.001, 0.003, 0.01].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#E2E8F0]">{t('train.aug')}</p>
            <p className="text-[10px] text-[#475569]">{t('train.aug_hint')}</p>
          </div>
          <button onClick={() => setAugment(a => !a)} disabled={training}
            className={`w-11 h-6 rounded-full relative transition-colors disabled:opacity-50 ${augment ? 'bg-[#3B82F6]' : 'bg-[#1E2D45]'}`}>
            <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full transition-all ${augment ? 'left-[23px]' : 'left-[3px]'}`} />
          </button>
        </div>

        <button onClick={training ? handleStop : handleStart}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-[13px] text-white transition-colors ${
            training ? 'bg-[#EF4444] hover:bg-[#DC2626]' : 'bg-[#3B82F6] hover:bg-[#2563EB]'
          }`}>
          {training
            ? <><Square size={14} fill="white" /> {t('train.stop')}</>
            : <><Play   size={14} fill="white" /> {t('train.start')}</>}
        </button>
      </div>

      {/* Прогресс */}
      {phase !== 'idle' && (
        <div className="bg-[#111827] border border-[#1E2D45] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {phase === 'done'    && <CheckCircle   size={15} className="text-[#22C55E]" />}
            {phase === 'error'   && <AlertTriangle size={15} className="text-[#EF4444]" />}
            {(phase === 'running' || phase === 'loading') && <RefreshCw size={15} className="text-[#3B82F6] animate-spin" />}
            <span className={`text-[12px] font-semibold ${phase === 'done' ? 'text-[#22C55E]' : phase === 'error' ? 'text-[#EF4444]' : 'text-[#E2E8F0]'}`}>
              {phase === 'loading' && (loadProg.total > 0
                ? `MFCC: ${loadProg.done} / ${loadProg.total}`
                : `${t('train.params')}...`)}
              {phase === 'running' && `Epoch ${progress.epoch} / ${progress.total} · Best ${(progress.best_acc*100).toFixed(1)}%`}
              {phase === 'done'    && `✓ Best ${(progress.best_acc*100).toFixed(1)}%`}
              {phase === 'error'   && t('train.error')}
            </span>
          </div>

          {/* Прогресс загрузки датасета */}
          {phase === 'loading' && loadProg.total > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
                <span>MFCC</span>
                <span>{Math.round(loadProg.done / loadProg.total * 100)}%</span>
              </div>
              <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                <div className="h-full bg-[#F59E0B] rounded-full transition-all duration-300"
                     style={{ width: `${loadProg.total ? (loadProg.done/loadProg.total)*100 : 0}%` }} />
              </div>
            </div>
          )}

          {/* Прогресс эпох */}
          {(phase === 'running' || phase === 'done') && progress.total > 0 && (
            <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
              <div className="h-full bg-[#3B82F6] rounded-full transition-all duration-300" style={{ width: `${epochPct}%` }} />
            </div>
          )}

          {trainAcc.length > 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-[#64748B] mb-1">{t('train.accuracy')}</p>
                <LineChart height={85} series={[
                  { data: trainAcc, color: '#3B82F6' },
                  { data: testAcc,  color: '#22C55E' },
                ]} />
                <div className="flex gap-3 mt-1">
                  {[['#3B82F6','Train'],['#22C55E','Val']].map(([c,l]) => (
                    <div key={l} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[9px] text-[#64748B]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-[#64748B] mb-1">{t('train.loss')}</p>
                <LineChart height={85} series={[
                  { data: trainLoss, color: '#F59E0B' },
                  { data: testLoss,  color: '#EF4444' },
                ]} />
                <div className="flex gap-3 mt-1">
                  {[['#F59E0B','Train'],['#EF4444','Val']].map(([c,l]) => (
                    <div key={l} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[9px] text-[#64748B]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-[11px] text-[#64748B] mb-1">{t('train.log')}</p>
            <TrainLog logs={logs} />
          </div>
        </div>
      )}
    </div>
  )
}
