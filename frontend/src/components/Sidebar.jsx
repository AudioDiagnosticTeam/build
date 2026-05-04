import { useState } from 'react'
import { Activity, ClipboardList, Brain, Database, Info, X } from 'lucide-react'
import { useLang } from '../i18n'

const NAV_IDS = [
  { icon: Activity,      key: 'nav.diag',     id: 'diag'     },
  { icon: ClipboardList, key: 'nav.history',  id: 'history'  },
  { icon: Brain,         key: 'nav.training', id: 'training' },
  { icon: Database,      key: 'nav.dataset',  id: 'dataset'  },
]

function AboutOverlay({ onClose }) {
  const t = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-[420px] bg-[#111827] border border-[#1E2D45] rounded-2xl p-8 shadow-2xl">
        <button onClick={onClose}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0] transition-colors">
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center"
               style={{ borderColor: 'var(--accent)' }}>
            <Activity size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-[#E2E8F0]">{t('about.title')}</h2>
            <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>v3.0</span>
          </div>
        </div>

        <p className="text-[13px] text-[#94A3B8] leading-relaxed mb-5">{t('about.desc')}</p>

        <div className="space-y-2 mb-6">
          {[
            [t('about.model'),     t('about.model_val')],
            [t('about.dataset'),   'AudioDiagnosticTeam / dataset'],
            [t('about.framework'), 'PyTorch + FastAPI + React'],
            [t('about.author'),    'AudioDiagnosticTeam'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-[#64748B]">{k}</span>
              <span className="text-[#E2E8F0]">{v}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-[#1E2D45] mb-4" />

        <p className="text-[10px] text-[#475569] text-center">{t('about.disclaimer')}</p>
      </div>
    </div>
  )
}

export default function Sidebar({ active, onChange }) {
  const [showAbout, setShowAbout] = useState(false)
  const t = useLang()

  return (
    <>
      <aside className="flex flex-col w-[68px] shrink-0 bg-[#111827] border-r border-[#1E2D45] h-screen">
        {/* Logo */}
        <div className="flex items-center justify-center h-[54px] shrink-0">
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
               style={{ borderColor: 'var(--accent)' }}>
            <Activity size={14} style={{ color: 'var(--accent)' }} />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col flex-1">
          {NAV_IDS.map(({ icon: Icon, key, id }) => (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex flex-col items-center justify-center gap-1 h-[62px] text-[9px] w-full border-l-[3px] transition-all duration-150"
              style={active === id
                ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }
                : { borderColor: 'transparent', color: '#64748B' }}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
            </button>
          ))}
        </nav>

        {/* About */}
        <button
          onClick={() => setShowAbout(true)}
          className="flex flex-col items-center justify-center gap-1 h-[62px] text-[9px] text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1A2235] mb-2 transition-colors border-l-[3px] border-transparent"
        >
          <Info size={16} />
          <span>{t('nav.about')}</span>
        </button>
      </aside>

      {showAbout && <AboutOverlay onClose={() => setShowAbout(false)} />}
    </>
  )
}
