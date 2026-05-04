import { useState, useEffect } from 'react'
import { useLang, useLangCtx } from '../i18n'
import MicTestOverlay from './MicTestOverlay'
import { CheckCircle, RefreshCw, Trash2 } from 'lucide-react'

const THEMES = {
  default:  '#3B82F6',
  blue:     '#06B6D4',
  green:    '#22C55E',
  purple:   '#A855F7',
  orange:   '#F59E0B',
}

function applyTheme(color) {
  document.documentElement.style.setProperty('--accent', color)
}

function Slider({ label, desc, min, max, step=0.01, value, onChange }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#E2E8F0]">{label}</span>
        <span className="text-[11px] font-semibold text-[#E2E8F0] bg-[#0C1120] border border-[#1E2D45] px-2 py-0.5 rounded min-w-[42px] text-center">
          {value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer"
      />
      {desc && <p className="text-[10px] text-[#64748B] mt-1">{desc}</p>}
    </div>
  )
}

function Select({ label, options, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[12px] text-[#E2E8F0] flex-1">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="bg-[#1A2235] border border-[#1E2D45] text-[#E2E8F0] text-[11px] rounded-md px-2 py-1.5 w-[175px] outline-none"
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, checked, onChange, wip }) {
  const [showWip, setShowWip] = useState(false)
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[12px] text-[#E2E8F0]">{label}</span>
      <button
        onClick={() => wip ? setShowWip(true) : onChange(!checked)}
        className="w-[44px] h-[24px] rounded-full relative transition-colors duration-200 bg-[#1E2D45]"
        style={checked ? { background: 'var(--accent)' } : {}}
      >
      {showWip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { e.stopPropagation(); setShowWip(false) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative z-10 bg-[#111827] border border-[#1E2D45] rounded-xl px-8 py-6 text-center shadow-2xl max-w-[320px]">
            <div className="text-2xl mb-3">🚧</div>
            <p className="text-[14px] font-semibold text-[#E2E8F0] mb-1">В разработке</p>
            <p className="text-[12px] text-[#64748B]">Данная функция находится в разработке</p>
          </div>
        </div>
      )}
        <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full transition-all duration-200 ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
      </button>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-[13px] font-semibold text-[#E2E8F0] pt-4 pb-1">{children}</h3>
}

function Divider() {
  return <div className="h-px bg-[#1E2D45] my-2" />
}

function loadClassWeightOverrides() {
  try { return JSON.parse(localStorage.getItem('classWeightOverrides') || '{}') }
  catch { return {} }
}

export default function SettingsPanel({ dots, onDotsChange, micGain, onMicGainChange, audioDevice, onAudioDeviceChange }) {
  const [tab,          setTab]          = useState(0)
  const [autoStart,    setAutoStart]    = useState(false)
  const [notify,       setNotify]       = useState(true)
  const [colorScheme,  setColorScheme]  = useState('default')
  const [devices,      setDevices]      = useState([])
  const [showMicTest,  setShowMicTest]  = useState(false)
  const [models,       setModels]       = useState([])
  const [activeModel,  setActiveModel]  = useState('')
  const [activating,   setActivating]   = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting,     setDeleting]     = useState('')
  const [classWeights, setClassWeights] = useState(loadClassWeightOverrides)
  const [weightClasses, setWeightClasses] = useState([])
  const [inferenceInterval,    setInferenceInterval]    = useState(() => parseInt(localStorage.getItem('inferenceInterval') || '5'))
  const [consecutiveThreshold, setConsecutiveThreshold] = useState(() => parseInt(localStorage.getItem('consecutiveThreshold') || '3'))
  const [parallelMode, setParallelMode] = useState(
    () => localStorage.getItem('trainingParallelMode') || 'threads'
  )
  const [mfccDevice, setMfccDevice] = useState(
    () => localStorage.getItem('trainingMfccDevice') || 'auto'
  )
  const [splitMode, setSplitMode] = useState(
    () => localStorage.getItem('trainingSplitMode') || 'standard'
  )
  const cpuCount   = navigator.hardwareConcurrency || 4
  const [workerCount,   setWorkerCount]   = useState(
    () => parseInt(localStorage.getItem('trainingWorkers') || String(Math.min(8, navigator.hardwareConcurrency || 4)))
  )
  const [showPerfWarn,  setShowPerfWarn]  = useState(false)
  const t               = useLang()
  const { lang, changeLang } = useLangCtx()

  useEffect(() => {
    fetch('http://localhost:8000/audio/devices')
      .then(r => r.json())
      .then(d => {
        setDevices(d.devices ?? [])
        if (audioDevice === null && d.default != null)
          onAudioDeviceChange(d.default)
      })
      .catch(() => {})
  }, [])

  function loadModels() {
    fetch('http://localhost:8000/models')
      .then(r => r.json())
      .then(d => { setModels(d.models ?? []); setActiveModel(d.active ?? '') })
      .catch(() => {})
  }

  useEffect(() => {
    if (tab === 3) {
      loadModels()
      fetch('http://localhost:8000/dataset')
        .then(r => r.json())
        .then(d => setWeightClasses(Object.keys(d.classes ?? {})))
        .catch(() => {})
    }
  }, [tab])

  async function activateModel(name) {
    setActivating(name)
    const fd = new FormData(); fd.append('name', name)
    const res = await fetch('http://localhost:8000/models/activate', { method: 'POST', body: fd }).catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      if (data.ok) {
        setActiveModel(name)
        setModels(m => m.map(x => ({ ...x, active: x.name === name })))
      }
    }
    setActivating('')
  }

  async function deleteModel(name) {
    setDeleting(name)
    const res = await fetch(`http://localhost:8000/models/${name}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) {
      setModels(m => m.filter(x => x.name !== name))
      if (activeModel === name) setActiveModel('')
    }
    setDeleting('')
    setDeleteConfirm('')
  }

  function setClassWeight(cls, val) {
    setClassWeights(prev => {
      const next = { ...prev, [cls]: val }
      if (val === 1) delete next[cls]   // 1× = дефолт, не хранить
      localStorage.setItem('classWeightOverrides', JSON.stringify(next))
      return next
    })
  }

  // Синхронизируем classWeights при переходе на вкладку Модель
  // (бейджи в TrainingPage могли изменить localStorage)
  useEffect(() => {
    if (tab === 3) setClassWeights(loadClassWeightOverrides())
  }, [tab])

  function handleTheme(name) {
    setColorScheme(name)
    applyTheme(THEMES[name])
  }

  return (
    <>
    <aside className="w-[355px] shrink-0 flex flex-col bg-[#111827] border-l border-[#1E2D45] h-full">
      <div className="px-5 pt-4 pb-0">
        <h2 className="text-[17px] font-bold text-[#E2E8F0] mb-3">{t('settings.title')}</h2>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[#1E2D45]">
          {[t('settings.tab.general'), t('settings.tab.audio'), t('settings.tab.visual'), 'Модель', 'Обучение'].map((label, i) => (
            <button
              key={i} onClick={() => setTab(i)}
              className="text-[11px] px-2.5 py-2 transition-colors border-b-2 -mb-px"
              style={tab === i
                ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { color: '#64748B', borderColor: 'transparent' }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">

        {/* General */}
        {tab === 0 && (
          <div>
            <SectionTitle>{t('settings.tab.general')}</SectionTitle>
            <Toggle label={t('settings.autostart')} checked={autoStart} onChange={setAutoStart} wip />
            <Toggle label={t('settings.notifications')} checked={notify} onChange={setNotify} wip />
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px] text-[#E2E8F0] flex-1">{t('settings.language')}</span>
              <select value={lang} onChange={e => changeLang(e.target.value)}
                className="bg-[#1A2235] border border-[#1E2D45] text-[#E2E8F0] text-[11px] rounded-md px-2 py-1.5 w-[175px] outline-none">
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>

            <Divider />
            <SectionTitle>Диагностика в реальном времени</SectionTitle>

            {/* Интервал анализа */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#E2E8F0]">Интервал анализа</span>
                <span className="text-[11px] font-semibold text-[#E2E8F0] bg-[#0C1120] border border-[#1E2D45] px-2 py-0.5 rounded min-w-[42px] text-center">
                  {inferenceInterval} с
                </span>
              </div>
              <input type="range" min={1} max={60} step={1} value={inferenceInterval}
                onChange={e => {
                  const v = Number(e.target.value)
                  setInferenceInterval(v)
                  localStorage.setItem('inferenceInterval', String(v))
                }}
                className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-[#334155] mt-1">
                <span>1с</span>
                <span className="text-[#475569]">по умолчанию 5с</span>
                <span>60с</span>
              </div>
              <p className="text-[10px] text-[#475569] mt-1">
                Нейросеть анализирует звук каждые {inferenceInterval} секунд
              </p>
            </div>

            {/* Порог подтверждения */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#E2E8F0]">Порог подтверждения</span>
                <span className="text-[11px] font-semibold text-[#E2E8F0] bg-[#0C1120] border border-[#1E2D45] px-2 py-0.5 rounded min-w-[42px] text-center">
                  {consecutiveThreshold}×
                </span>
              </div>
              <input type="range" min={1} max={10} step={1} value={consecutiveThreshold}
                onChange={e => {
                  const v = Number(e.target.value)
                  setConsecutiveThreshold(v)
                  localStorage.setItem('consecutiveThreshold', String(v))
                }}
                className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-[#334155] mt-1">
                <span>1</span>
                <span className="text-[#475569]">по умолчанию 3</span>
                <span>10</span>
              </div>
              <p className="text-[10px] text-[#475569] mt-1">
                {consecutiveThreshold} одинаковых результатов подряд → событие сохраняется в историю
              </p>
            </div>
          </div>
        )}

        {/* Audio */}
        {tab === 1 && (
          <div>
            <SectionTitle>{t('settings.tab.audio')}</SectionTitle>

            {/* Gain */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#E2E8F0]">{t('settings.mic_gain')}</span>
                <span className="text-[11px] font-semibold text-[#E2E8F0] bg-[#0C1120] border border-[#1E2D45] px-2 py-0.5 rounded min-w-[42px] text-center">
                  {micGain}%
                </span>
              </div>
              <input type="range" min={0} max={100} step={1} value={micGain}
                onChange={e => onMicGainChange(Number(e.target.value))}
                className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer" />
              <p className="text-[10px] text-[#475569] mt-1">50% = без усиления · 100% = ×2</p>
            </div>

            <Divider />

            {/* Device selection */}
            <div className="py-2">
              <span className="text-[12px] text-[#E2E8F0] block mb-2">{t('settings.input_device')}</span>
              <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto">
                {devices.length === 0 && (
                  <p className="text-[11px] text-[#475569]">Загрузка устройств...</p>
                )}
                {devices.map(d => (
                  <button
                    key={d.id}
                    onClick={() => onAudioDeviceChange(d.id)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors border"
                    style={audioDevice === d.id
                      ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                      : { background: '#1A2235', borderColor: '#1E2D45' }}>
                    <span className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: audioDevice === d.id ? 'var(--accent)' : '#475569' }} />
                    <span className="text-[11px] text-[#E2E8F0] truncate">{d.name}</span>
                    <span className="text-[9px] text-[#475569] shrink-0 ml-auto">{d.channels}ch</span>
                  </button>
                ))}
              </div>
            </div>

            <Divider />

            {/* Mic test */}
            <button
              onClick={() => setShowMicTest(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold transition-colors mt-1"
              style={{ color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }}>
              Проверить микрофон
            </button>
          </div>
        )}

        {/* Model */}
        {tab === 3 && (
          <div>
            <div className="flex items-center justify-between pt-4 pb-1">
              <h3 className="text-[13px] font-semibold text-[#E2E8F0]">Выбор модели</h3>
              <button onClick={loadModels} className="text-[#475569] hover:text-[#E2E8F0] transition-colors">
                <RefreshCw size={12} />
              </button>
            </div>
            <p className="text-[10px] text-[#475569] mb-3">Активная модель используется для диагностики в реальном времени</p>
            {models.length === 0 ? (
              <p className="text-[11px] text-[#475569]">Нет обученных моделей. Обучите модель в разделе «Обучение».</p>
            ) : (
              <div className="flex flex-col gap-2">
                {models.map(m => (
                  <div key={m.name} className="rounded-lg border overflow-hidden"
                       style={m.active
                         ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                         : { background: '#1A2235', borderColor: '#1E2D45' }}>
                    <button
                      onClick={() => !m.active && activateModel(m.name)}
                      disabled={!!activating || !!deleting}
                      className="flex items-start gap-3 px-3 py-2.5 w-full text-left transition-all disabled:opacity-60"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold text-[#E2E8F0] truncate">{m.name}</span>
                          {m.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>АКТИВНА</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#475569]">{m.size_mb} МБ</span>
                          {m.classes?.length > 0 && (
                            <span className="text-[10px] text-[#475569]">· {m.classes.join(', ')}</span>
                          )}
                        </div>
                      </div>
                      {activating === m.name
                        ? <RefreshCw size={13} className="text-[#64748B] animate-spin shrink-0 mt-0.5" />
                        : m.active
                          ? <CheckCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                          : null}
                    </button>

                    {/* Delete confirm */}
                    {deleteConfirm === m.name ? (
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-[#1E2D45] bg-[#0C1120]">
                        <span className="text-[10px] text-[#EF4444] flex-1">Удалить «{m.name}»?</span>
                        <button onClick={() => deleteModel(m.name)}
                          disabled={!!deleting}
                          className="text-[10px] font-semibold text-[#EF4444] hover:text-[#DC2626] transition-colors px-2 py-0.5 rounded border border-[#EF4444]/40 hover:bg-[#EF4444]/10 disabled:opacity-50">
                          {deleting === m.name ? '...' : 'Да'}
                        </button>
                        <button onClick={() => setDeleteConfirm('')}
                          className="text-[10px] text-[#64748B] hover:text-[#E2E8F0] transition-colors px-2 py-0.5">
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(m.name)}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 border-t border-[#1E2D45] text-[#475569] hover:text-[#EF4444] hover:bg-[#EF4444]/5 transition-colors text-[10px]"
                      >
                        <Trash2 size={10} /> Удалить модель
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Веса классов для обучения */}
            {weightClasses.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-5 pb-1">
                  <h3 className="text-[13px] font-semibold text-[#E2E8F0]">Веса классов</h3>
                  <button onClick={() => {
                    setClassWeights({})
                    localStorage.removeItem('classWeightOverrides')
                  }} className="text-[9px] text-[#475569] hover:text-[#E2E8F0] transition-colors">сброс</button>
                </div>
                <p className="text-[10px] text-[#475569] mb-3">Множитель веса при обучении нейросети — увеличьте для классов, которые часто ошибаются</p>
                <div className="flex flex-col gap-2">
                  {weightClasses.map(cls => {
                    const val = classWeights[cls] ?? 1
                    const isZero = val === 0
                    return (
                      <div key={cls} className={`flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors ${isZero ? 'bg-[#EF4444]/8' : ''}`}>
                        <span className={`text-[11px] w-20 shrink-0 ${isZero ? 'line-through text-[#475569]' : 'text-[#E2E8F0]'}`}>{cls}</span>
                        <input type="range" min={0} max={5} step={0.5} value={val}
                          onChange={e => setClassWeight(cls, Number(e.target.value))}
                          className="flex-1 h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer" />
                        <span className="text-[11px] font-semibold w-10 text-right shrink-0"
                              style={{ color: isZero ? '#EF4444' : val > 1 ? 'var(--accent)' : '#64748B' }}>
                          {isZero ? '0× ✕' : `${val}×`}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-[#475569] mt-1">0× — класс исключён из диагностики и обучения</p>
              </>
            )}
          </div>
        )}

        {/* Training */}
        {tab === 4 && (
          <div>
            {/* ── Количество воркеров ── */}
            <SectionTitle>Количество воркеров</SectionTitle>
            <p className="text-[10px] text-[#475569] mb-3">
              Ваш CPU: <span className="text-[#E2E8F0] font-semibold">{cpuCount}</span> логических ядра.
              Узкое место при первом запуске — <span className="text-[#F59E0B]">диск</span>, не CPU.
              Больше потоков создают очередь к диску и не ускоряют работу.
            </p>
            <div className="py-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-[#E2E8F0]">Воркеров</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded border min-w-[38px] text-center"
                    style={workerCount > cpuCount
                      ? { color: '#EF4444', borderColor: '#EF4444/40', background: '#EF444410' }
                      : { color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                  >
                    {workerCount}
                  </span>
                  <span className="text-[10px] text-[#475569]">/ {cpuCount}</span>
                </div>
              </div>
              <input
                type="range" min={1} max={Math.max(24, cpuCount * 2)} step={1}
                value={workerCount}
                onChange={e => {
                  const v = Number(e.target.value)
                  setWorkerCount(v)
                  localStorage.setItem('trainingWorkers', String(v))
                  if (v > cpuCount) setShowPerfWarn(true)
                }}
                className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-[#334155] mt-1">
                <span>1</span>
                <span className="text-[#475569]">рек. {Math.min(cpuCount, 16)}</span>
                <span>{Math.max(24, cpuCount * 2)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 mt-1.5">
              {workerCount > cpuCount && (
                <p className="text-[10px] text-[#EF4444]">
                  ⚠ Превышает логические ядра — 50% CPU при MFCC это нормально: узкое место диск
                </p>
              )}
              <p className="text-[10px] text-[#475569]">
                HDD: 4–6 · SATA SSD: 8–12 · NVMe: 12–16 · После первого запуска кэш убирает I/O узкое место
              </p>
            </div>

            <Divider />

            {/* ── Алгоритм разбивки ── */}
            <SectionTitle>Алгоритм разбивки данных</SectionTitle>
            <div className="flex flex-col gap-2 mb-1">
              {[
                {
                  value: 'standard',
                  label: 'Стандартный',
                  desc: 'random_split по всем образцам. Быстро, но при балансировке даёт завышенную точность (data leakage).',
                },
                {
                  value: 'no_leakage',
                  label: 'Без утечки данных',
                  desc: 'Сплит по файлам до аугментации. Val — только оригиналы без аугментации. Честная точность.',
                },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => { setSplitMode(value); localStorage.setItem('trainingSplitMode', value) }}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border"
                  style={splitMode === value
                    ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                    : { background: '#1A2235', borderColor: '#1E2D45' }}
                >
                  <span className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: splitMode === value ? 'var(--accent)' : '#475569' }} />
                  <div>
                    <span className="text-[12px] font-semibold text-[#E2E8F0] block">{label}</span>
                    <span className="text-[10px] text-[#64748B] leading-relaxed">{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <Divider />

            {/* ── Устройство MFCC ── */}
            <SectionTitle>Устройство для MFCC</SectionTitle>
            <div className="flex flex-col gap-2 mb-1">
              {[
                { value: 'auto',  label: 'Авто',             desc: 'GPU если доступна, иначе CPU' },
                { value: 'gpu',   label: 'Видеокарта (GPU)', desc: 'CUDA · батч 512 · ~2–3 мин первый прогон · требует NVIDIA' },
                { value: 'cpu',   label: 'Процессор (CPU)',  desc: 'ThreadPool / ProcessPool · работает всегда' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => { setMfccDevice(value); localStorage.setItem('trainingMfccDevice', value) }}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border"
                  style={mfccDevice === value
                    ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                    : { background: '#1A2235', borderColor: '#1E2D45' }}
                >
                  <span className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: mfccDevice === value ? 'var(--accent)' : '#475569' }} />
                  <div>
                    <span className="text-[12px] font-semibold text-[#E2E8F0] block">{label}</span>
                    <span className="text-[10px] text-[#64748B] leading-relaxed">{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <Divider />

            {/* ── Алгоритм параллелизма ── */}
            <SectionTitle>Алгоритм параллелизма</SectionTitle>
            <p className="text-[10px] text-[#475569] mb-3">
              Метод извлечения MFCC-признаков перед обучением.
            </p>
            <div className="flex flex-col gap-2">
              {[
                {
                  value: 'threads',
                  label: 'Потоки',
                  desc: 'ThreadPoolExecutor — по умолчанию. Меньше памяти, librosa освобождает GIL для C-кода.',
                },
                {
                  value: 'processes',
                  label: 'Процессы',
                  desc: 'ProcessPoolExecutor — истинный параллелизм. Потенциально быстрее, но ~200 МБ RAM на процесс.',
                },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => {
                    setParallelMode(value)
                    localStorage.setItem('trainingParallelMode', value)
                  }}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border"
                  style={parallelMode === value
                    ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }
                    : { background: '#1A2235', borderColor: '#1E2D45' }}
                >
                  <span className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ background: parallelMode === value ? 'var(--accent)' : '#475569' }} />
                  <div>
                    <span className="text-[12px] font-semibold text-[#E2E8F0] block">{label}</span>
                    <span className="text-[10px] text-[#64748B] leading-relaxed">{desc}</span>
                  </div>
                </button>
              ))}
            </div>

            <Divider />
            <SectionTitle>Кэш MFCC</SectionTitle>
            <p className="text-[10px] text-[#475569]">
              После первого запуска признаки сохраняются в <span className="text-[#3B82F6] font-mono">.mfcc_cache/</span>.
              Повторный старт загружает кэш за 1–2 мин вместо 17+.
            </p>
          </div>
        )}

        {/* Visualization */}
        {tab === 2 && (
          <div>
            <SectionTitle>{t('settings.tab.visual')}</SectionTitle>
            <Toggle label={t('settings.dots')} checked={dots} onChange={onDotsChange} />

            <div className="flex items-center justify-between py-2">
              <span className="text-[12px] text-[#E2E8F0] flex-1">{t('settings.color_scheme')}</span>
              <select
                value={colorScheme}
                onChange={e => handleTheme(e.target.value)}
                className="bg-[#1A2235] border border-[#1E2D45] text-[#E2E8F0] text-[11px] rounded-md px-2 py-1.5 w-[175px] outline-none"
              >
                {Object.keys(THEMES).map(key => (
                  <option key={key} value={key}>{t(`settings.theme.${key}`)}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </aside>

    {showMicTest && (
      <MicTestOverlay deviceId={audioDevice} onClose={() => setShowMicTest(false)} />
    )}

    {/* Оверлей: слишком много воркеров */}
    {showPerfWarn && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 bg-[#111827] border border-[#EF4444]/40 rounded-2xl px-8 py-7 shadow-2xl max-w-[360px] w-full mx-4">
          <div className="text-3xl mb-4 text-center">⚡</div>
          <p className="text-[15px] font-bold text-[#E2E8F0] text-center mb-2">
            Недостаточно производительности
          </p>
          <p className="text-[13px] text-[#94A3B8] text-center mb-1">
            Выбрано <span className="text-[#EF4444] font-bold">{workerCount}</span> воркеров
            при <span className="text-[#E2E8F0] font-bold">{cpuCount}</span> логических ядрах.
          </p>
          <p className="text-[11px] text-[#475569] text-center mb-2">
            При MFCC узкое место — диск (I/O), а не CPU. Это значит CPU будет ~50% даже при 32 воркерах — потоки просто стоят в очереди к диску.
          </p>
          <p className="text-[11px] text-[#475569] text-center mb-6">
            Рекомендуется: NVMe → 12–16, SATA SSD → 8–12, HDD → 4–6.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setWorkerCount(cpuCount)
                localStorage.setItem('trainingWorkers', String(cpuCount))
                setShowPerfWarn(false)
              }}
              className="w-full py-2.5 rounded-xl text-white text-[13px] font-semibold transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Уменьшить до {cpuCount}
            </button>
            <button
              onClick={() => setShowPerfWarn(false)}
              className="w-full py-2.5 rounded-xl bg-[#1A2235] hover:bg-[#1E2D45] text-[#64748B] text-[13px] font-semibold transition-colors border border-[#1E2D45]"
            >
              Всё равно использовать {workerCount}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
