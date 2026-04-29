import { Activity, GitBranch, AlertTriangle } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="shrink-0 flex items-center justify-between px-5 h-[38px] bg-[#0C1120] border-t border-[#1E2D45]">

      {/* Left — brand */}
      <div className="flex items-center gap-2">
        <Activity size={12} className="text-[#3B82F6]" />
        <span className="text-[11px] text-[#475569]">
          AudioDiagnosticTeam
        </span>
        <span className="text-[#1E2D45]">·</span>
        <span className="text-[11px] font-semibold text-[#3B82F6]">v3.0</span>
      </div>

      {/* Center — disclaimer */}
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={11} className="text-[#F59E0B] shrink-0" />
        <span className="text-[10px] text-[#475569]">
          Диагностика является предварительной и не заменяет профессионального осмотра
        </span>
      </div>

      {/* Right — GitHub */}
      <a
        href="https://github.com/AudioDiagnosticTeam/build"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-[#475569] hover:text-[#E2E8F0] transition-colors"
      >
        <GitBranch size={13} />
        <span className="text-[11px]">GitHub</span>
      </a>

    </footer>
  )
}
