import { useState } from 'react'

const TABS = ['Общие', 'Аудио', 'Визуализация']

const THEMES = {
  'По умолчанию': '#3B82F6',
  'Синяя':        '#06B6D4',
  'Зелёная':      '#22C55E',
  'Фиолетовая':   '#A855F7',
  'Оранжевая':    '#F59E0B',
}

function applyTheme(color) {
  document.documentElement.style.setProperty('--accent', color)
}

function Slider({ label, desc, min, max, step=0.01, value, onChange }) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#E2E8F0]">{label}</span>
        <span className="text-[11px] font-semibold text-[#E2E8F0] bg-[#0C1120] border border-[#1E2D45] px-2 py-0.5 rounded min-w-[42px] text-center">
          {value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded appearance-none bg-[#1E2D45] cursor-pointer"
      />
      {desc && <p className="text-[10px] text-[#64748B] mt-1">{desc}</p>}
    </div>
  )
}

function Select({ label, options, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[12px] text-[#E2E8F0] flex-1">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="bg-[#1A2235] border border-[#1E2D45] text-[#E2E8F0] text-[11px] rounded-md px-2 py-1.5 w-[175px] outline-none"
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[12px] text-[#E2E8F0]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className="w-[44px] h-[24px] rounded-full relative transition-colors duration-200 bg-[#1E2D45]"
        style={checked ? { background: 'var(--accent)' } : {}}
      >
        <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full transition-all duration-200 ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
      </button>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-[13px] font-semibold text-[#E2E8F0] pt-4 pb-1">{children}</h3>
}

function Divider() {
  return <div className="h-px bg-[#1E2D45] my-2" />
}

export default function SettingsPanel({ dots, onDotsChange }) {
  const [tab,         setTab]         = useState(0)
  const [autoStart,   setAutoStart]   = useState(false)
  const [notify,      setNotify]      = useState(true)
  const [colorScheme, setColorScheme] = useState('По умолчанию')

  function handleTheme(name) {
    setColorScheme(name)
    applyTheme(THEMES[name])
  }

  return (
    <aside className="w-[355px] shrink-0 flex flex-col bg-[#111827] border-l border-[#1E2D45] h-full">
      <div className="px-5 pt-4 pb-0">
        <h2 className="text-[17px] font-bold text-[#E2E8F0] mb-3">Настройки</h2>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[#1E2D45]">
          {TABS.map((t, i) => (
            <button
              key={t} onClick={() => setTab(i)}
              className="text-[11px] px-2.5 py-2 transition-colors border-b-2 -mb-px"
              style={tab === i
                ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { color: '#64748B', borderColor: 'transparent' }}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">

        {/* Общие */}
        {tab === 0 && (
          <div>
            <SectionTitle>Общие настройки</SectionTitle>
            <Toggle label="Автозапуск диагностики" checked={autoStart} onChange={setAutoStart} />
            <Toggle label="Уведомления" checked={notify} onChange={setNotify} />
            <Select label="Язык" value="Русский" options={['Русский','English']} onChange={() => {}} />
          </div>
        )}

        {/* Аудио */}
        {tab === 1 && (
          <div>
            <SectionTitle>Параметры аудио</SectionTitle>
            <Slider label="Частота дискретизации (кГц)" min={8} max={48} step={1} value={22} onChange={() => {}} />
            <Slider label="Усиление микрофона" min={0} max={100} step={1} value={70} onChange={() => {}} />
            <Select label="Устройство ввода" value="Микрофон по умолчанию"
              options={['Микрофон по умолчанию']} onChange={() => {}} />
          </div>
        )}

        {/* Визуализация */}
        {tab === 2 && (
          <div>
            <SectionTitle>Визуализация</SectionTitle>
            <Toggle label="Демонстрация источников звука" checked={dots} onChange={onDotsChange} />

            <div className="flex items-center justify-between py-2">
              <span className="text-[12px] text-[#E2E8F0] flex-1">Цветовая схема</span>
              <select
                value={colorScheme}
                onChange={e => handleTheme(e.target.value)}
                className="bg-[#1A2235] border border-[#1E2D45] text-[#E2E8F0] text-[11px] rounded-md px-2 py-1.5 w-[175px] outline-none"
              >
                {Object.keys(THEMES).map(name => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>

          </div>
        )}
      </div>
    </aside>
  )
}
