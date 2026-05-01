import { useState } from 'react'
import { RotateCcw, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import CarView from './CarView'
import Waveform from './Waveform'
import { useLang } from '../i18n'

const BACKGROUND = new Set(['НОРМА', 'РЕЧЬ'])

const FAULT_HINTS = {
  СКРИП:   'Может быть связан с износом тормозных колодок, сухими сайлентблоками подвески или ослабленным ремнём ГРМ.',
  СТУК:    'Может указывать на износ шаровых опор, стуки в двигателе (поршневые пальцы, вкладыши) или повреждение амортизаторов.',
  СВИСТ:   'Возможные причины: проскальзывание приводного ремня, износ подшипника генератора или турбины, утечка воздуха во впуске.',
  ДРЕБЕЗГ: 'Может быть связан с ослабленным теплозащитным экраном, элементами выхлопной системы или деталями кузова.',
}

function getZeroWeights() {
  try { return new Set(JSON.parse(localStorage.getItem('zeroWeightClasses') || '[]')) }
  catch { return new Set() }
}

function isBg(cls) { return BACKGROUND.has(cls) || getZeroWeights().has(cls) }

function faultColor(prob) {
  if (prob > 0.65) return '#EF4444'
  if (prob > 0.40) return '#F59E0B'
  return '#60A5FA'
}

export default function DiagnosticsPage({ waveData, predictions, sourceValues, elapsed, showDots = true }) {
  const [micVol, setMicVol] = useState(70)
  const [view, setView]     = useState('side')
  const t = useLang()

  const sorted    = predictions ? Object.entries(predictions).sort((a, b) => b[1] - a[1]) : []
  const topFaults = sorted.filter(([cls, p]) => !isBg(cls) && p > 0.20)
  const main      = topFaults[0] ?? null
  const isNormal  = !main || (predictions?.['НОРМА'] ?? 0) > 0.60

  const s       = elapsed ?? 0
  const timeStr = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="flex flex-col gap-2.5 p-3 h-full overflow-hidden">

      {/* ── Top row ──────────────────────────────────────────── */}
      <div className="flex gap-2.5 flex-1 min-h-0">

        {/* Probabilities card */}
        <div className="w-[215px] shrink-0 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col">
          <span className="text-[13px] font-semibold text-[#E2E8F0] mb-3">Классификация</span>

          {!predictions ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] text-[#475569]">{t('diag.waiting')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 flex-1">
              {sorted.map(([cls, prob]) => {
                const pct  = Math.round(prob * 100)
                const bg   = isBg(cls)
                const color = bg ? '#334155' : faultColor(prob)
                return (
                  <div key={cls}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] font-medium ${bg ? 'text-[#475569]' : 'text-[#E2E8F0]'}`}>{cls}</span>
                      <span className="text-[10px] font-semibold" style={{ color: pct > 10 ? color : '#334155' }}>{pct}%</span>
                    </div>
                    <div className="h-1 bg-[#1A2235] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                           style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Car visualization */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] flex flex-col overflow-hidden">
          <div className="flex justify-end gap-1.5 p-2 shrink-0">
            <button onClick={() => setView(v => v === 'side' ? '3d' : 'side')}
              className="px-2.5 h-7 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-md text-[11px] text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors">
              {view === 'side' ? '3D' : 'Вид сбоку'}
            </button>
            <button onClick={() => window.location.reload()}
              className="w-8 h-7 flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-md text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors">
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden px-2 pb-2">
            <CarView zones={sourceValues ?? [0.3, 0.2, 0.1, 0.05]} view={view} showDots={showDots} />

            {predictions && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2
                px-3 py-1.5 bg-[#0C1120]/80 backdrop-blur rounded-full border"
                   style={{ borderColor: isNormal ? '#22C55E50' : `${faultColor(main?.[1] ?? 0)}50` }}>
                <span className="w-2 h-2 rounded-full"
                      style={{ background: isNormal ? '#22C55E' : faultColor(main?.[1] ?? 0) }} />
                <span className="text-[11px] font-medium"
                      style={{ color: isNormal ? '#22C55E' : faultColor(main?.[1] ?? 0) }}>
                  {isNormal ? 'Норма' : `Обнаружен ${main[0].toLowerCase()}`}
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
            <span className="text-[12px] font-medium text-[#E2E8F0]">{t('diag.waveform')}</span>
            <span className="text-[12px] text-[#64748B] font-mono">{timeStr}</span>
          </div>
          <div className="flex-1 min-h-0">
            <Waveform data={waveData} />
          </div>
          <div className="shrink-0 mt-2">
            <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
              <span>{t('diag.mic_sens')}</span>
              <span className="text-[#E2E8F0]">{micVol}%</span>
            </div>
            <input type="range" min={0} max={100} value={micVol}
              onChange={e => setMicVol(Number(e.target.value))}
              className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer" />
          </div>
        </div>

        {/* Analysis */}
        <div className="flex-1 bg-[#111827] rounded-xl border border-[#1E2D45] p-3.5 flex flex-col min-h-0">
          <span className="text-[13px] font-semibold text-[#E2E8F0] mb-2.5 shrink-0">{t('diag.analysis')}</span>

          {/* Нет данных */}
          {!predictions && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-[#475569]">{t('diag.waiting')}</p>
            </div>
          )}

          {/* Норма */}
          {predictions && isNormal && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center">
                <CheckCircle size={22} className="text-[#22C55E]" />
              </div>
              <p className="text-[14px] font-semibold text-[#22C55E]">Посторонних звуков не обнаружено</p>
              <p className="text-[11px] text-[#64748B] text-center">Работа систем в норме</p>
            </div>
          )}

          {/* Неисправность */}
          {predictions && !isNormal && main && (
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
              {/* Главная неисправность */}
              <div className="flex items-center gap-3 rounded-xl px-4 py-3 shrink-0"
                   style={{ background: `${faultColor(main[1])}12`, border: `1px solid ${faultColor(main[1])}40` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                     style={{ background: `${faultColor(main[1])}20` }}>
                  {main[1] > 0.65
                    ? <AlertCircle  size={20} style={{ color: faultColor(main[1]) }} />
                    : <AlertTriangle size={20} style={{ color: faultColor(main[1]) }} />}
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold" style={{ color: faultColor(main[1]) }}>
                    Обнаружен {main[0].charAt(0) + main[0].slice(1).toLowerCase()}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    Уверенность: {Math.round(main[1] * 100)}%
                  </p>
                </div>
              </div>

              {FAULT_HINTS[main[0]] && (
                <p className="text-[11px] text-[#94A3B8] leading-relaxed px-1 shrink-0">
                  {FAULT_HINTS[main[0]]}
                </p>
              )}

              {/* Второстепенные */}
              {topFaults.slice(1).map(([cls, prob]) => (
                <div key={cls} className="flex items-center gap-3 bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-2 shrink-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: faultColor(prob) }} />
                  <span className="text-[12px] text-[#E2E8F0] flex-1">
                    Обнаружен {cls.charAt(0) + cls.slice(1).toLowerCase()}
                  </span>
                  <span className="text-[11px] font-semibold" style={{ color: faultColor(prob) }}>
                    {Math.round(prob * 100)}%
                  </span>
                </div>
              ))}

              <p className="text-[10px] text-[#475569] mt-auto shrink-0">
                Рекомендуется диагностика у механика
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
