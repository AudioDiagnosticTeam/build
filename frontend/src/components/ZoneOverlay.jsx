import { X } from 'lucide-react'

const ZONES = [
  { id: 0, x: '36%', y: '50%', color: '#EF4444', label: 'Двигатель',                    sub: 'Блок двигателя, поршни, клапаны' },
  { id: 1, x: '46%', y: '44%', color: '#F59E0B', label: 'Ремень / Навесное',             sub: 'Приводной ремень, ролики, генератор' },
  { id: 2, x: '27%', y: '56%', color: '#60A5FA', label: 'Впускная система',              sub: 'Воздухозаборник, дроссель, турбина' },
  { id: 3, x: '68%', y: '62%', color: '#A855F7', label: 'Выхлопная система',             sub: 'Глушитель, катализатор, карданный вал' },
]

export default function ZoneOverlay({ onSelect, onClose, selected }) {
  return (
    <div className="absolute inset-0 z-20 rounded-xl overflow-hidden">
      {/* Затемнение */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Заголовок */}
      <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
        <div className="bg-[#0C1120]/80 border border-[#1E2D45] rounded-full px-4 py-1.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
          <span className="text-[12px] text-[#E2E8F0] font-medium">
            Нажмите на зону, где установлен микрофон
          </span>
        </div>
      </div>

      {/* Кнопка закрыть */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 z-30 w-7 h-7 flex items-center justify-center
          bg-[#1A2235]/80 border border-[#1E2D45] rounded-full text-[#64748B]
          hover:text-[#E2E8F0] transition-colors"
      >
        <X size={13} />
      </button>

      {/* Кликабельные зоны */}
      {ZONES.map(({ id, x, y, color, label, sub }) => {
        const isSelected = selected === id
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center gap-2"
            style={{ left: x, top: y }}
          >
            {/* Кольцо пульса */}
            <div className="relative flex items-center justify-center">
              <div
                className="absolute rounded-full animate-ping"
                style={{
                  width: 52, height: 52,
                  background: color,
                  opacity: isSelected ? 0.4 : 0.2,
                }}
              />
              {/* Основной круг */}
              <div
                className="relative w-11 h-11 rounded-full flex items-center justify-center
                  border-2 transition-all duration-200 group-hover:scale-110"
                style={{
                  background: isSelected ? color : `${color}30`,
                  borderColor: color,
                  boxShadow: isSelected ? `0 0 20px ${color}80` : `0 0 10px ${color}40`,
                }}
              >
                {isSelected && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                    <path d="M3 8l4 4 6-6" stroke="white" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                )}
              </div>
            </div>

            {/* Подпись */}
            <div
              className="px-2.5 py-1.5 rounded-lg border text-center transition-all duration-200
                group-hover:border-opacity-80"
              style={{
                background: isSelected ? `${color}20` : 'rgba(12,17,32,0.85)',
                borderColor: isSelected ? color : '#1E2D45',
              }}
            >
              <p className="text-[11px] font-semibold leading-tight" style={{ color }}>
                {label}
              </p>
              <p className="text-[9px] text-[#64748B] leading-tight mt-0.5 max-w-[110px]">
                {sub}
              </p>
            </div>
          </button>
        )
      })}

      {/* Нижняя подсказка */}
      {selected !== null && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <div className="bg-[#0C1120]/80 border border-[#1E2D45] rounded-full px-4 py-1.5">
            <span className="text-[11px] text-[#64748B]">
              Нажмите ещё раз или&nbsp;
              <span className="text-[#E2E8F0]">закройте</span>
              &nbsp;для подтверждения
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export { ZONES as ZONE_CONFIG }
