import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, AlertCircle, ClipboardList } from 'lucide-react'
import { useLang } from '../i18n'

const CLASS_COLORS = {
  НОРМА:   '#22C55E',
  СТУК:    '#EF4444',
  ДРЕБЕЗГ: '#F59E0B',
  СВИСТ:   '#F59E0B',
  СКРИП:   '#60A5FA',
}

const FAULT_HINTS = {
  СКРИП:   'Может быть связан с износом тормозных колодок, сухими сайлентблоками подвески или ослабленным ремнём ГРМ.',
  СТУК:    'Может указывать на износ шаровых опор, стуки в двигателе (поршневые пальцы, вкладыши) или повреждение амортизаторов.',
  СВИСТ:   'Возможные причины: проскальзывание приводного ремня, износ подшипника генератора или турбины, утечка воздуха во впуске.',
  ДРЕБЕЗГ: 'Может быть связан с ослабленным теплозащитным экраном, элементами выхлопной системы или деталями кузова.',
}

const BACKGROUND = new Set(['НОРМА', 'РЕЧЬ'])

function fmtTime(s) {
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
}
function fmtDate(d) {
  return new Intl.DateTimeFormat('ru', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function topDiagnosis(predictions) {
  const sorted = Object.entries(predictions).sort((a, b) => b[1] - a[1])
  return sorted[0] ?? ['—', 0]
}

// Горизонтальный бар-чарт предсказаний
function PredictionChart({ predictions }) {
  const sorted = Object.entries(predictions).sort((a, b) => b[1] - a[1])
  return (
    <div className="flex flex-col gap-1.5">
      {sorted.map(([cls, prob]) => (
        <div key={cls} className="flex items-center gap-2">
          <span className="text-[10px] text-[#64748B] w-16 shrink-0 text-right">{cls}</span>
          <div className="flex-1 h-2 bg-[#1A2235] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${prob * 100}%`, background: CLASS_COLORS[cls] ?? '#3B82F6' }}
            />
          </div>
          <span className="text-[10px] font-semibold w-8 shrink-0"
                style={{ color: CLASS_COLORS[cls] ?? '#E2E8F0' }}>
            {Math.round(prob * 100)}%
          </span>
        </div>
      ))}
    </div>
  )
}

// Временной график (sparkline) — как менялся топ-класс за сессию
function TimelineChart({ timeline }) {
  const t = useLang()
  if (!timeline?.length) return null

  const classes  = Object.keys(timeline[0])
  const n        = timeline.length
  const w        = 300
  const h        = 80
  const pad      = 4

  // Строим SVG-линии для каждого класса
  const lines = classes.map(cls => {
    const pts = timeline.map((p, i) => {
      const x = pad + (i / Math.max(n - 1, 1)) * (w - pad * 2)
      const y = h - pad - (p[cls] ?? 0) * (h - pad * 2)
      return `${x},${y}`
    }).join(' ')
    return { cls, pts }
  })

  return (
    <div className="mt-3">
      <p className="text-[10px] text-[#64748B] mb-1.5">{t('history.dynamics')}</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        {/* Сетка */}
        {[0.25, 0.5, 0.75].map(v => (
          <line key={v}
            x1={pad} y1={h - pad - v * (h - pad * 2)}
            x2={w - pad} y2={h - pad - v * (h - pad * 2)}
            stroke="#1E2D45" strokeWidth="1" strokeDasharray="3,3" />
        ))}
        {/* Линии классов */}
        {lines.map(({ cls, pts }) => (
          <polyline key={cls} points={pts}
            fill="none"
            stroke={CLASS_COLORS[cls] ?? '#3B82F6'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85" />
        ))}
      </svg>
      {/* Легенда */}
      <div className="flex flex-wrap gap-2 mt-1">
        {classes.map(cls => (
          <div key={cls} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS[cls] ?? '#3B82F6' }} />
            <span className="text-[9px] text-[#64748B]">{cls}</span>
          </div>
        ))}
      </div>
    </div>
  )
}



function faultColor(prob) {
  if (prob > 0.65) return '#EF4444'
  if (prob > 0.40) return '#F59E0B'
  return '#60A5FA'
}

function FaultReport({ predictions, isNormal, topCls, topProb }) {
  if (isNormal) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full py-4">
        <div className="w-10 h-10 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center">
          <CheckCircle size={18} className="text-[#22C55E]" />
        </div>
        <p className="text-[12px] font-semibold text-[#22C55E] text-center">Посторонних звуков не обнаружено</p>
      </div>
    )
  }

  const color = faultColor(topProb)
  const faults = Object.entries(predictions)
    .filter(([cls, p]) => !BACKGROUND.has(cls) && p > 0.20)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col gap-2">
      {/* Главная */}
      <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
           style={{ background: `${color}12`, border: `1px solid ${color}40` }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
             style={{ background: `${color}20` }}>
          {topProb > 0.65
            ? <AlertCircle size={16} style={{ color }} />
            : <AlertTriangle size={16} style={{ color }} />}
        </div>
        <div>
          <p className="text-[12px] font-bold" style={{ color }}>
            Обнаружен {topCls.charAt(0) + topCls.slice(1).toLowerCase()}
          </p>
          <p className="text-[10px] text-[#64748B]">Уверенность: {Math.round(topProb * 100)}%</p>
        </div>
      </div>

      {/* Описание */}
      {FAULT_HINTS[topCls] && (
        <p className="text-[11px] text-[#94A3B8] leading-relaxed">{FAULT_HINTS[topCls]}</p>
      )}

      {/* Второстепенные */}
      {faults.slice(1).map(([cls, prob]) => (
        <div key={cls} className="flex items-center gap-2 bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: faultColor(prob) }} />
          <span className="text-[11px] text-[#E2E8F0] flex-1">
            Обнаружен {cls.charAt(0) + cls.slice(1).toLowerCase()}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: faultColor(prob) }}>
            {Math.round(prob * 100)}%
          </span>
        </div>
      ))}

      <p className="text-[10px] text-[#475569] mt-1">Рекомендуется диагностика у механика</p>
    </div>
  )
}

// Карточка одной сессии
function HistoryCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const [topCls, topProb] = topDiagnosis(entry.predictions)
  const isNormal = topCls === 'НОРМА' || topProb < 0.4
  const t = useLang()

  return (
    <div className="bg-[#111827] border border-[#1E2D45] rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-3.5 hover:bg-[#1A2235]/50 transition-colors text-left"
      >
        {/* Статус иконка */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isNormal ? 'bg-[#22C55E]/15' : 'bg-[#EF4444]/15'
        }`}>
          {isNormal
            ? <CheckCircle size={16} className="text-[#22C55E]" />
            : <AlertTriangle size={16} className="text-[#EF4444]" />
          }
        </div>

        {/* Инфо */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold"
                  style={{ color: isNormal ? '#22C55E' : (CLASS_COLORS[topCls] ?? '#E2E8F0') }}>
              {isNormal ? t('history.normal') : topCls}
            </span>
            <span className="text-[10px] text-[#64748B]">
              {Math.round(topProb * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-[#64748B]">{fmtDate(entry.startedAt)}</span>
            <span className="text-[10px] text-[#475569]">·</span>
            <span className="text-[10px] text-[#64748B]">⏱ {fmtTime(entry.duration)}</span>
            <span className="text-[10px] text-[#475569]">·</span>
            <span className="text-[10px] text-[#64748B]">{entry.timeline?.length ?? 0} {t('history.readings')}</span>
          </div>
        </div>

        {/* Мини бары предсказаний */}
        <div className="hidden sm:flex items-end gap-0.5 h-6 mr-2">
          {Object.entries(entry.predictions)
            .sort((a, b) => b[1] - a[1])
            .map(([cls, prob]) => (
              <div key={cls}
                className="w-1.5 rounded-sm"
                style={{
                  height: `${Math.max(10, prob * 100)}%`,
                  background: CLASS_COLORS[cls] ?? '#3B82F6',
                  opacity: 0.8,
                }} />
            ))}
        </div>

        {expanded ? <ChevronUp size={14} className="text-[#64748B] shrink-0" />
                  : <ChevronDown size={14} className="text-[#64748B] shrink-0" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1E2D45] pt-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-semibold text-[#E2E8F0] mb-2">{t('history.analysis')}</p>
              <PredictionChart predictions={entry.predictions} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#E2E8F0] mb-2">Предварительный анализ</p>
              <FaultReport predictions={entry.predictions} isNormal={isNormal} topCls={topCls} topProb={topProb} />
            </div>
          </div>
          <TimelineChart timeline={entry.timeline} />
        </div>
      )}
    </div>
  )
}

export default function HistoryPage({ history, onClear }) {
  const t = useLang()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D45] shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-[#3B82F6]" />
          <span className="text-[13px] font-semibold text-[#E2E8F0]">{t('history.title')}</span>
          {history.length > 0 && (
            <span className="text-[10px] bg-[#3B82F6]/20 text-[#3B82F6] px-2 py-0.5 rounded-full">
              {history.length} {t('history.sessions')}
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-[11px] text-[#64748B] hover:text-[#EF4444] transition-colors"
          >
            <Trash2 size={12} /> {t('history.clear')}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <ClipboardList size={36} className="text-[#1E2D45]" />
            <p className="text-[14px] text-[#64748B]">{t('history.empty')}</p>
            <p className="text-[12px] text-[#475569]">{t('history.empty_sub')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-w-3xl mx-auto">
            {history.map(entry => (
              <HistoryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
