import { useState } from 'react'
import { RotateCcw, CheckCircle, Activity } from 'lucide-react'
import CarView from './CarView'
import Waveform from './Waveform'

const SOURCES = [
  { name: 'Двигатель',                      color: '#EF4444' },
  { name: 'Ремень / Навесное оборудование', color: '#F59E0B' },
  { name: 'Впускная система',               color: '#60A5FA' },
  { name: 'Выхлопная система',              color: '#A855F7' },
]

const DEFAULT_DIAGNOSES = [
  { title: 'Возможная проблема в двигателе',     sub: 'Характерные звуки стука или детонации', sev: 'Высокая вероятность', color: '#EF4444' },
  { title: 'Износ приводного ремня / ролика',    sub: 'Свист или скрежет при работе',          sev: 'Средняя вероятность', color: '#F59E0B' },
  { title: 'Подсос воздуха во впускной системе', sub: 'Шипение или свистящий звук',            sev: 'Низкая вероятность',  color: '#60A5FA' },
]

const SUBTITLES = {
  НОРМА:   'Оборудование работает штатно',
  ДРЕБЕЗГ: 'Дребезжание деталей кузова или навесного оборудования',
  СВИСТ:   'Свист ремня, турбины или впускной системы',
  СКРИП:   'Скрип тормозов, подвески или шестерёнок',
  СТУК:    'Стук двигателя, подшипников или карданного вала',
}

function isNormal(probs) {
  return (probs?.['НОРМА'] ?? 0) > 0.60
}

function buildDiagnoses(probs) {
  const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1])
  const top    = sorted.filter(([c]) => c !== 'НОРМА').slice(0, 3)
  if (!top.length || isNormal(probs)) return null
  return top.map(([cls, prob]) => {
    const color = prob > 0.65 ? '#EF4444' : prob > 0.40 ? '#F59E0B' : '#60A5FA'
    const sev   = prob > 0.65 ? 'Высокая вероятность' : prob > 0.40 ? 'Средняя вероятность' : 'Низкая вероятность'
    return { title: cls, sub: SUBTITLES[cls] ?? '', sev: `${sev} (${Math.round(prob * 100)}%)`, color }
  })
}

// Цвет здоровья по уровню
function healthColor(pct) {
  if (pct >= 70) return '#22C55E'
  if (pct >= 40) return '#F59E0B'
  return '#EF4444'
}
function healthLabel(pct) {
  if (pct >= 70) return 'Норма'
  if (pct >= 40) return 'Предупреждение'
  return 'Неисправность'
}

export default function DiagnosticsPage({ waveData, predictions, sourceValues, elapsed }) {
  const [micVol, setMicVol] = useState(70)
  const [view, setView]     = useState('side')

  // p(НОРМА) — индикатор здоровья
  const normaPct   = predictions ? Math.round((predictions['НОРМА'] ?? 0) * 100) : null
  const faultScale = normaPct !== null ? (100 - normaPct) / 100 : 1 // отклонение от нормы

  // Источники масштабируем с учётом отклонения: когда всё норм — бары малы
  const sources = SOURCES.map((s, i) => {
    const raw   = sourceValues?.[i] ?? 0
    // Если модель говорит НОРМА 90%, усиливаем сигнал отклонения
    const scaled = normaPct !== null
      ? Math.min(1, raw * (1 + faultScale * 1.5))
      : raw
    return { ...s, pct: Math.round(scaled * 100), raw: Math.round(raw * 100) }
  })

  const diagnoses = predictions ? buildDiagnoses(predictions) : DEFAULT_DIAGNOSES
  const normal    = predictions ? isNormal(predictions) : false

  const s       = elapsed ?? 0
  const timeStr = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="flex flex-col gap-2.5 p-3 h-full overflow-hidden">

      {/* ── Top row ──────────────────────────────────────────── */}
      <div className="flex gap-2.5 flex-1 min-h-0">

        {/* Sources card */}
        <div className="w-[215px] shrink-0 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-[13px] font-semibold text-[#E2E8F0]">Источник звуков</span>
            <span className="text-[#64748B] text-[11px] cursor-help"
                  title="Бары показывают отклонение от нормального звука по каждой зоне">ⓘ</span>
          </div>

          {/* ── Индикатор здоровья ── */}
          {normaPct !== null ? (
            <div className="mb-3 rounded-lg border p-2.5"
                 style={{ background: `${healthColor(normaPct)}12`, borderColor: `${healthColor(normaPct)}40` }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Activity size={11} style={{ color: healthColor(normaPct) }} />
                  <span className="text-[10px] font-semibold" style={{ color: healthColor(normaPct) }}>
                    {healthLabel(normaPct)}
                  </span>
                </div>
                <span className="text-[11px] font-bold" style={{ color: healthColor(normaPct) }}>
                  {normaPct}%
                </span>
              </div>
              {/* Прогресс-бар здоровья */}
              <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${normaPct}%`, background: healthColor(normaPct) }} />
              </div>
              <p className="text-[9px] text-[#475569] mt-1">
                Вероятность нормальной работы по модели
              </p>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-[#1E2D45] p-2.5 bg-[#1A2235]">
              <div className="flex items-center gap-1.5">
                <Activity size={11} className="text-[#475569]" />
                <span className="text-[10px] text-[#475569]">Ожидание диагностики...</span>
              </div>
            </div>
          )}

          {/* ── Источники (отклонение от нормы) ── */}
          <p className="text-[9px] text-[#475569] mb-1.5 uppercase tracking-wide">Отклонение по зонам</p>
          <div className="flex flex-col gap-0.5 flex-1">
            {sources.map(({ name, color, pct }) => (
              <div key={name} className="py-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[11px] text-[#E2E8F0] flex-1 leading-tight">{name}</span>
                  <span className="text-[10px] font-semibold" style={{ color: pct > 50 ? color : '#64748B' }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1 bg-[#1A2235] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                       style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Car visualization */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] flex flex-col overflow-hidden">
          <div className="flex justify-end gap-1.5 p-2 shrink-0">
            <button onClick={() => setView(v => v === 'side' ? '3d' : 'side')}
              className="px-2.5 h-7 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-md text-[11px] text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors">
              {view === 'side' ? '3D' : 'Вид сбоку'}
            </button>
            <button onClick={() => setView('side')}
              className="w-8 h-7 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-md text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors">
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden px-2 pb-2">
            <CarView zones={sourceValues ?? [0.3, 0.2, 0.1, 0.05]} view={view} />

            {/* Бейдж нормы на машине */}
            {normaPct !== null && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2
                px-3 py-1.5 bg-[#0C1120]/80 backdrop-blur rounded-full border"
                   style={{ borderColor: `${healthColor(normaPct)}50` }}>
                <span className="w-2 h-2 rounded-full" style={{ background: healthColor(normaPct) }} />
                <span className="text-[11px] font-medium" style={{ color: healthColor(normaPct) }}>
                  {healthLabel(normaPct)} · {normaPct}%
                </span>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Bottom row ───────────────────────────────────────── */}
      <div className="flex gap-2.5 shrink-0" style={{ height: '210px' }}>

        {/* Waveform */}
        <div className="w-[250px] shrink-0 bg-[#111827] rounded-xl border border-[#1E2D45] p-3 flex flex-col">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <span className="text-[12px] font-medium text-[#E2E8F0]">Запись звука</span>
            <span className="text-[12px] text-[#64748B] font-mono">{timeStr}</span>
          </div>
          <div className="flex-1 min-h-0">
            <Waveform data={waveData} />
          </div>
          <div className="shrink-0 mt-2">
            <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
              <span>Чувствительность микрофона</span>
              <span className="text-[#E2E8F0]">{micVol}%</span>
            </div>
            <input type="range" min={0} max={100} value={micVol}
              onChange={e => setMicVol(Number(e.target.value))}
              className="w-full h-1 rounded appearance-none bg-[#1E2D45] accent-[#3B82F6] cursor-pointer"
            />
          </div>
        </div>

        {/* Analysis */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col min-h-0 overflow-hidden">
          <span className="text-[13px] font-semibold text-[#E2E8F0] mb-2.5 shrink-0">
            Предварительный анализ
          </span>

          {normal && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center">
                <CheckCircle size={22} className="text-[#22C55E]" />
              </div>
              <p className="text-[13px] font-semibold text-[#22C55E]">Неисправностей не обнаружено</p>
              <p className="text-[11px] text-[#64748B] text-center">
                Звуковой профиль соответствует штатной работе агрегатов
              </p>
            </div>
          )}

          {!normal && (
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
              {(diagnoses ?? DEFAULT_DIAGNOSES).map((d, i) => (
                <div key={i} className="flex items-center gap-3 bg-[#1A2235] rounded-lg px-3.5 py-2.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#E2E8F0] leading-tight">{d.title}</p>
                    <p className="text-[11px] text-[#64748B] leading-tight mt-0.5">{d.sub}</p>
                  </div>
                  <span className="text-[11px] font-medium shrink-0 text-right whitespace-nowrap" style={{ color: d.color }}>
                    {d.sev}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
