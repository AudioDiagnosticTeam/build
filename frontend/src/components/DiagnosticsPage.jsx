import { useState } from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import CarView from './CarView'
import Waveform from './Waveform'

const SOURCES = [
  { name: 'Двигатель',                      color: '#EF4444', dot: 'bg-[#EF4444]' },
  { name: 'Ремень / Навесное оборудование', color: '#F59E0B', dot: 'bg-[#F59E0B]' },
  { name: 'Впускная система',               color: '#60A5FA', dot: 'bg-[#60A5FA]' },
  { name: 'Выхлопная система',              color: '#A855F7', dot: 'bg-[#A855F7]' },
]

const DEFAULT_DIAGNOSES = [
  { title: 'Возможная проблема в двигателе',       sub: 'Характерные звуки стука или детонации', sev: 'Высокая вероятность', color: '#EF4444' },
  { title: 'Износ приводного ремня / ролика',      sub: 'Свист или скрежет при работе',          sev: 'Средняя вероятность', color: '#F59E0B' },
  { title: 'Подсос воздуха во впускной системе',   sub: 'Шипение или свистящий звук',            sev: 'Низкая вероятность',  color: '#60A5FA' },
]

export default function DiagnosticsPage({ waveData, predictions, sourceValues, elapsed }) {
  const [micVol, setMicVol] = useState(70)

  const sources = SOURCES.map((s, i) => ({ ...s, pct: Math.round((sourceValues?.[i] ?? 0) * 100) }))
  const diagnoses = predictions ? buildDiagnoses(predictions) : DEFAULT_DIAGNOSES

  const s = elapsed ?? 0
  const timeStr = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="flex flex-col gap-2.5 p-3 h-full overflow-hidden">

      {/* ── Top row ──────────────────────────────────────────── */}
      <div className="flex gap-2.5 flex-1 min-h-0">

        {/* Sources card */}
        <div className="w-[210px] shrink-0 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[13px] font-semibold text-[#E2E8F0]">Источник звуков</span>
            <span className="text-[#64748B] text-[11px] cursor-help" title="Вероятность источника звука">ⓘ</span>
          </div>

          <div className="flex flex-col gap-0.5 flex-1">
            {sources.map(({ name, color, dot, pct }) => (
              <div key={name} className="py-1.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0`} style={{ background: color }} />
                  <span className="text-[11px] text-[#E2E8F0] flex-1 leading-tight">{name}</span>
                  <span className="text-[11px] font-semibold text-[#E2E8F0]">{pct}%</span>
                </div>
                <div className="h-1 bg-[#1A2235] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[#3B82F6] bg-[#1A2235] border border-[#1E2D45] hover:bg-[#3B82F6]/10 rounded-lg py-2 transition-colors">
            <Eye size={13} /> Показать все зоны
          </button>
        </div>

        {/* Car visualization */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] flex flex-col overflow-hidden">
          <div className="flex justify-end gap-1.5 p-2 shrink-0">
            {[['🚗','Вид сбоку'],['3D','3D вид'],<RotateCcw key="r" size={14} />].map((item, i) => (
              <button key={i} title={Array.isArray(item) ? item[1] : ''}
                className="w-8 h-7 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-md text-[11px] text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors">
                {Array.isArray(item) ? item[0] : item}
              </button>
            ))}
          </div>
          <div className="flex-1 relative overflow-hidden px-2 pb-2">
            <CarView zones={sourceValues ?? [0.5,0.3,0.2,0.1]} />
            <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-[#111827]/70 backdrop-blur border border-[#1E2D45] rounded-full px-3 py-1.5">
              <span className="text-[10px] text-[#64748B]">Вид сбоку</span>
              <span className="text-[11px]">🚗</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom row ───────────────────────────────────────── */}
      <div className="flex gap-2.5 shrink-0" style={{ height: '220px' }}>

        {/* Waveform card */}
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

        {/* Analysis card */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col">
          <span className="text-[13px] font-semibold text-[#E2E8F0] mb-2.5 shrink-0">Предварительный анализ</span>
          <div className="flex flex-col gap-2 flex-1">
            {diagnoses.map((d, i) => (
              <div key={i} className="flex items-center gap-3 bg-[#1A2235] rounded-lg px-3.5 py-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ background: d.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#E2E8F0] leading-tight">{d.title}</p>
                  <p className="text-[11px] text-[#64748B] leading-tight mt-0.5">{d.sub}</p>
                </div>
                <span className="text-[11px] font-medium shrink-0 text-right" style={{ color: d.color }}>
                  {d.sev}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#64748B] mt-2 shrink-0">
            Важно: Данная диагностика является предварительной и не заменяет профессионального осмотра.
          </p>
        </div>
      </div>
    </div>
  )
}

const SUBTITLES = {
  НОРМА:   'Оборудование работает штатно',
  ДРЕБЕЗГ: 'Дребезжание деталей кузова или навесного оборудования',
  СВИСТ:   'Свист ремня, турбины или впускной системы',
  СКРИП:   'Скрип тормозов, подвески или шестерёнок',
  СТУК:    'Стук двигателя, подшипников или карданного вала',
}

function buildDiagnoses(probs) {
  const sorted = Object.entries(probs).sort((a,b) => b[1]-a[1])
  const top = sorted.filter(([c]) => c !== 'НОРМА').slice(0, 3)
  if (!top.length || (probs['НОРМА'] ?? 0) > 0.75)
    return [{ title: 'НОРМА', sub: SUBTITLES['НОРМА'], sev: `${Math.round((probs['НОРМА']??1)*100)}%`, color: '#22C55E' }]

  return top.map(([cls, prob]) => {
    const color = prob > 0.7 ? '#EF4444' : prob > 0.45 ? '#F59E0B' : '#60A5FA'
    const sev   = prob > 0.7 ? 'Высокая вероятность' : prob > 0.45 ? 'Средняя вероятность' : 'Низкая вероятность'
    return { title: cls, sub: SUBTITLES[cls] ?? '', sev: `${sev} (${Math.round(prob*100)}%)`, color }
  })
}
