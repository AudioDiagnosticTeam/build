import { useState } from 'react'
import { Activity, ClipboardList, Brain, Info, X } from 'lucide-react'

const NAV = [
  { icon: Activity,      label: 'Диагностика', id: 'diag'     },
  { icon: ClipboardList, label: 'История',     id: 'history'  },
  { icon: Brain,         label: 'Обучение',    id: 'training' },
]

function AboutOverlay({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative z-10 w-[420px] bg-[#111827] border border-[#1E2D45] rounded-2xl p-8 shadow-2xl">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0] transition-colors">
          <X size={18} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full border-2 border-[#3B82F6] flex items-center justify-center">
            <Activity size={16} className="text-[#3B82F6]" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-[#E2E8F0]">Диагностика по звуку</h2>
            <span className="text-[11px] text-[#3B82F6] font-medium">v3.0</span>
          </div>
        </div>

        <p className="text-[13px] text-[#94A3B8] leading-relaxed mb-5">
          Система акустической диагностики автомобиля на основе нейронной сети.
          Анализирует звук двигателя и трансмиссии в реальном времени, определяя
          характер возможных неисправностей.
        </p>

        <div className="space-y-2 mb-6">
          {[
            ['Модель',    'CNN · 4 класса неисправностей'],
            ['Датасет',   'AudioDiagnosticTeam / dataset'],
            ['Фреймворк', 'PyTorch + FastAPI + React'],
            ['Автор',     'AudioDiagnosticTeam'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-[#64748B]">{k}</span>
              <span className="text-[#E2E8F0]">{v}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-[#1E2D45] mb-4" />

        <p className="text-[10px] text-[#475569] text-center">
          Диагностика является предварительной и не заменяет профессионального осмотра
        </p>
      </div>
    </div>
  )
}

export default function Sidebar({ active, onChange }) {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <>
      <aside className="flex flex-col w-[68px] shrink-0 bg-[#111827] border-r border-[#1E2D45] h-screen">
        {/* Logo */}
        <div className="flex items-center justify-center h-[54px] shrink-0">
          <div className="w-8 h-8 rounded-full border-2 border-[#3B82F6] flex items-center justify-center">
            <Activity size={14} className="text-[#3B82F6]" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1">
          {NAV.map(({ icon: Icon, label, id }) => (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center gap-1 h-[62px] text-[9px] w-full
                border-l-[3px] transition-all duration-150
                ${active === id
                  ? 'border-[#3B82F6] text-[#3B82F6] bg-[#3B82F6]/10'
                  : 'border-transparent text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1A2235]'
                }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* About */}
        <button
          onClick={() => setShowAbout(true)}
          className="flex flex-col items-center justify-center gap-1 h-[62px] text-[9px] text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1A2235] mb-2 transition-colors border-l-[3px] border-transparent"
        >
          <Info size={16} />
          <span>О программе</span>
        </button>
      </aside>

      {showAbout && <AboutOverlay onClose={() => setShowAbout(false)} />}
    </>
  )
}
