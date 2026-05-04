import { Settings, Square, Play } from 'lucide-react'
import { useLang } from '../i18n'

export default function Header({ recording, onToggleRecord, onToggleSettings, status }) {
  const t = useLang()
  return (
    <header className="flex items-center h-[52px] px-5 gap-4 bg-[#111827] border-b border-[#1E2D45] shrink-0">
      <span className="text-[15px] font-bold text-[#E2E8F0] tracking-tight">
        {t('header.title')}
      </span>

      <div className="flex-1" />

      {/* Status badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A2235] border border-[#1E2D45] rounded-2xl">
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          status.level === 'ok'   ? 'bg-[#22C55E] shadow-[0_0_6px_#22C55E]' :
          status.level === 'err'  ? 'bg-[#EF4444] shadow-[0_0_6px_#EF4444]' :
                                    'bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]'
        }`} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold text-[#E2E8F0] leading-none">{status.title}</span>
          <span className="text-[10px] text-[#64748B] leading-none truncate max-w-[160px]">{status.sub}</span>
        </div>
      </div>

      {/* Record button */}
      <button
        onClick={onToggleRecord}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-colors ${
          recording ? 'bg-[#EF4444] hover:bg-[#DC2626]' : 'bg-[#22C55E] hover:bg-[#16A34A]'
        }`}
      >
        {recording
          ? <><Square size={13} fill="white" /> {t('header.stop')}</>
          : <><Play   size={13} fill="white" /> {t('header.start')}</>
        }
      </button>

      <button
        onClick={onToggleSettings}
        className="w-[34px] h-[34px] flex items-center justify-center bg-[#1A2235] border border-[#1E2D45] rounded-lg text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1E2D45] transition-colors"
      >
        <Settings size={16} />
      </button>
    </header>
  )
}
