import { useState } from 'react'
import { Trash2, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, ClipboardList } from 'lucide-react'

const CLASS_COLORS = {
  НОРМА:   '#22C55E',
  СТУК:    '#EF4444',
  ДРЕБЕЗГ: '#F59E0B',
  СВИСТ:   '#F59E0B',
  СКРИП:   '#60A5FA',
}

const SOURCE_NAMES  = ['Двигатель', 'Ремень / Навесное', 'Впускная', 'Выхлоп']
const SOURCE_COLORS = ['#EF4444', '#F59E0B', '#60A5FA', '#A855F7']

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
      <p className="text-[10px] text-[#64748B] mb-1.5">Динамика за сессию</p>
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

// Источники звука мини-бары
function SourceBars({ sourceValues }) {
  return (
    <div className="flex gap-3 mt-3">
      {SOURCE_NAMES.map((name, i) => {
        const pct = Math.round((sourceValues?.[i] ?? 0) * 100)
        return (
          <div key={name} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full h-14 bg-[#1A2235] rounded-md overflow-hidden flex items-end">
              <div className="w-full rounded-sm transition-all duration-700"
                   style={{ height: `${pct}%`, background: SOURCE_COLORS[i] }} />
            </div>
            <span className="text-[9px] text-[#64748B] text-center leading-tight">{name}</span>
            <span className="text-[9px] font-semibold" style={{ color: SOURCE_COLORS[i] }}>{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}

// Карточка одной сессии
function HistoryCard({ entry }) {
  const [expanded, setExpanded] = useState(false)
  const [topCls, topProb] = topDiagnosis(entry.predictions)
  const isNormal = topCls === 'НОРМА' || topProb < 0.4

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
              {isNormal ? 'Штатная работа' : topCls}
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
            <span className="text-[10px] text-[#64748B]">{entry.timeline?.length ?? 0} измерений</span>
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
              <p className="text-[11px] font-semibold text-[#E2E8F0] mb-2">Вероятности классов</p>
              <PredictionChart predictions={entry.predictions} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#E2E8F0] mb-2">Источники</p>
              <SourceBars sourceValues={entry.sourceValues} />
            </div>
          </div>
          <TimelineChart timeline={entry.timeline} />
        </div>
      )}
    </div>
  )
}

export default function HistoryPage({ history, onClear }) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D45] shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-[#3B82F6]" />
          <span className="text-[13px] font-semibold text-[#E2E8F0]">История диагностик</span>
          {history.length > 0 && (
            <span className="text-[10px] bg-[#3B82F6]/20 text-[#3B82F6] px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-[11px] text-[#64748B] hover:text-[#EF4444] transition-colors"
          >
            <Trash2 size={12} /> Очистить
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <ClipboardList size={36} className="text-[#1E2D45]" />
            <p className="text-[14px] text-[#64748B]">Нет записей</p>
            <p className="text-[12px] text-[#475569]">
              Начните запись на вкладке «Диагностика» — после остановки<br />
              сессия сохранится здесь автоматически
            </p>
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
