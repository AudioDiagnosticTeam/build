import { useState, useEffect, useRef, useCallback } from 'react'
import { Database, Plus, Trash2, Upload, Scissors, RefreshCw, X, FolderOpen, FileAudio, ChevronRight, Cloud, CloudUpload, CheckCircle, AlertTriangle, Settings2 } from 'lucide-react'

const CLASS_COLORS = ['#EF4444','#F59E0B','#22C55E','#3B82F6','#A855F7','#06B6D4','#F97316','#EC4899']

function classColor(idx) { return CLASS_COLORS[idx % CLASS_COLORS.length] }

// ── Модалка создания класса ──────────────────────────────────────────────────
function NewClassModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    await fetch(`http://localhost:8000/dataset/class/${encodeURIComponent(name.trim())}`, { method: 'POST' })
    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[360px] bg-[#111827] border border-[#1E2D45] rounded-xl p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0]"><X size={16}/></button>
        <h3 className="text-[14px] font-bold text-[#E2E8F0] mb-4">Новый класс</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Например: СТУК"
          className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-2 text-[12px] text-[#E2E8F0] outline-none mb-4 font-mono uppercase"
        />
        <button
          onClick={handleCreate} disabled={!name.trim() || loading}
          className="w-full py-2 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-50 bg-[#3B82F6] hover:bg-[#2563EB]">
          {loading ? 'Создаём...' : 'Создать'}
        </button>
      </div>
    </div>
  )
}

// ── Модалка загрузки файлов ──────────────────────────────────────────────────
function UploadModal({ cls, onClose, onDone }) {
  const [mode,       setMode]       = useState('upload') // 'upload' | 'cut'
  const [segSec,     setSegSec]     = useState(6)
  const [file,       setFile]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const fileRef = useRef()

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    const fd = new FormData()
    if (mode === 'upload') {
      for (const f of file) fd.append('files', f)
      await fetch(`http://localhost:8000/dataset/upload/${encodeURIComponent(cls)}`, { method: 'POST', body: fd })
      setResult(`Загружено файлов: ${file.length}`)
    } else {
      fd.append('file', file[0])
      fd.append('segment_sec', segSec)
      const res = await fetch(`http://localhost:8000/dataset/cut/${encodeURIComponent(cls)}`, { method: 'POST', body: fd })
      const json = await res.json()
      setResult(`Нарезано сегментов: ${json.segments}`)
    }
    setLoading(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-[420px] bg-[#111827] border border-[#1E2D45] rounded-xl p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0]"><X size={16}/></button>
        <h3 className="text-[14px] font-bold text-[#E2E8F0] mb-1">Добавить файлы → <span style={{ color: 'var(--accent)' }}>{cls}</span></h3>
        <p className="text-[11px] text-[#64748B] mb-4">Прямая загрузка или автоматическая нарезка длинного файла</p>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 bg-[#0C1120] p-1 rounded-lg">
          {[['upload','Загрузить файлы','Upload'],['cut','Нарезать аудио','Scissors']].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setFile(null); setResult(null) }}
              className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors"
              style={mode === m
                ? { background: 'var(--accent)', color: '#fff' }
                : { color: '#64748B' }}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'upload' && (
          <div>
            <div
              onClick={() => fileRef.current.click()}
              className="border-2 border-dashed border-[#1E2D45] hover:border-[#3B82F6] rounded-xl p-6 text-center cursor-pointer transition-colors mb-3">
              <FileAudio size={24} className="mx-auto mb-2 text-[#475569]" />
              <p className="text-[11px] text-[#64748B]">
                {file ? `${file.length} файлов выбрано` : 'Нажмите или перетащите WAV / MP3'}
              </p>
              <input ref={fileRef} type="file" accept=".wav,.mp3" multiple className="hidden"
                onChange={e => { setFile([...e.target.files]); setResult(null) }} />
            </div>
          </div>
        )}

        {mode === 'cut' && (
          <div>
            <div
              onClick={() => fileRef.current.click()}
              className="border-2 border-dashed border-[#1E2D45] hover:border-[#3B82F6] rounded-xl p-6 text-center cursor-pointer transition-colors mb-3">
              <Scissors size={24} className="mx-auto mb-2 text-[#475569]" />
              <p className="text-[11px] text-[#64748B]">
                {file ? file[0].name : 'Выберите длинный аудио-файл для нарезки'}
              </p>
              <input ref={fileRef} type="file" accept=".wav,.mp3" className="hidden"
                onChange={e => { setFile([...e.target.files]); setResult(null) }} />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] text-[#64748B] shrink-0">Длина сегмента</span>
              <input type="range" min={2} max={15} step={1} value={segSec}
                onChange={e => setSegSec(Number(e.target.value))}
                className="flex-1 h-1 bg-[#1E2D45] rounded appearance-none cursor-pointer" />
              <span className="text-[11px] font-semibold text-[#E2E8F0] w-10 text-right">{segSec} сек</span>
            </div>
            <p className="text-[10px] text-[#475569] mb-3">
              Файл будет нарезан на {segSec}-секундные фрагменты и сохранён в класс <strong className="text-[#94A3B8]">{cls}</strong>
            </p>
          </div>
        )}

        {result && (
          <div className="mb-3 px-3 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[11px] text-[#22C55E]">
            ✓ {result}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full py-2 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-50 bg-[#3B82F6] hover:bg-[#2563EB]">
          {loading
            ? <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" /> Обработка...</span>
            : mode === 'cut' ? 'Нарезать и сохранить' : 'Загрузить'}
        </button>
      </div>
    </div>
  )
}

// ── Список файлов класса ─────────────────────────────────────────────────────
// ── HuggingFace Sync Panel ───────────────────────────────────────────────────
function HFSyncPanel() {
  const [open,    setOpen]    = useState(false)
  const [repo,    setRepo]    = useState('')
  const [token,   setToken]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const [status,  setStatus]  = useState(null) // null | 'pushing' | 'done' | 'error'
  const [log,     setLog]     = useState([])
  const [prog,    setProg]    = useState({ done: 0, total: 0 })
  const wsRef = useRef(null)

  useEffect(() => {
    fetch('http://localhost:8000/hf/config')
      .then(r => r.json())
      .then(d => { setRepo(d.repo || ''); setSaved(d.token_set) })
      .catch(() => {})
  }, [])

  async function handleSave() {
    const fd = new FormData()
    fd.append('repo', repo)
    fd.append('token', token)
    await fetch('http://localhost:8000/hf/config', { method: 'POST', body: fd })
    setSaved(true); setToken('')
  }

  function handlePush() {
    setStatus('pushing'); setLog([]); setProg({ done: 0, total: 0 })
    const ws = new WebSocket('ws://localhost:8000/ws/train')
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hf_push' }))
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'hf_push_start')    setProg({ done: 0, total: msg.total })
      if (msg.type === 'hf_push_progress') setProg({ done: msg.done, total: msg.total })
      if (msg.type === 'hf_push_log')      setLog(l => [...l.slice(-30), msg.text])
      if (msg.type === 'hf_push_done') {
        setStatus('done')
        setLog(l => [...l, `✓ Загружено ${msg.total - msg.skipped} файлов в ${msg.repo}`])
        ws.close()
      }
      if (msg.type === 'hf_push_error') {
        setStatus('error')
        setLog(l => [...l, `✗ ${msg.text}`])
        ws.close()
      }
    }
  }

  const pct = prog.total ? Math.round(prog.done / prog.total * 100) : 0

  return (
    <div className="border-b border-[#1E2D45]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#1A2235] transition-colors">
        <Cloud size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-[12px] font-semibold text-[#E2E8F0] flex-1 text-left">HuggingFace синхронизация</span>
        {saved && <span className="text-[10px] text-[#22C55E] flex items-center gap-1"><CheckCircle size={10}/>Токен сохранён</span>}
        <ChevronRight size={13} className={`text-[#475569] transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-4 flex flex-col gap-3">
          {/* Config */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-[#64748B] block mb-1">Репозиторий</label>
              <input value={repo} onChange={e => setRepo(e.target.value)}
                placeholder="owner/dataset-name"
                className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-1.5 text-[11px] text-[#E2E8F0] outline-none font-mono" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-[#64748B] block mb-1">
                Токен {saved ? '(сохранён, введите новый чтобы обновить)' : '(Write access)'}
              </label>
              <input value={token} onChange={e => setToken(e.target.value)}
                type="password" placeholder={saved ? '••••••••' : 'hf_...'}
                className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-1.5 text-[11px] text-[#E2E8F0] outline-none font-mono" />
            </div>
            <div className="flex flex-col justify-end">
              <button onClick={handleSave} disabled={!repo}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors disabled:opacity-40 bg-[#3B82F6] hover:bg-[#2563EB]">
                Сохранить
              </button>
            </div>
          </div>

          {/* Push button + progress */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePush}
              disabled={!saved || status === 'pushing'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold text-white transition-colors disabled:opacity-40 bg-[#3B82F6] hover:bg-[#2563EB]">
              {status === 'pushing'
                ? <><RefreshCw size={12} className="animate-spin" /> Загружаем...</>
                : <><CloudUpload size={12} /> Загрузить датасет на HF</>}
            </button>
            {!saved && <span className="text-[10px] text-[#F59E0B]">Сначала сохраните токен</span>}
          </div>

          {status === 'pushing' && prog.total > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
                <span>Прогресс</span>
                <span>{prog.done} / {prog.total} · {pct}%</span>
              </div>
              <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-200 bg-[#3B82F6]"
                     style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div className="bg-[#0C1120] rounded-lg p-2 max-h-[100px] overflow-y-auto">
              {log.map((l, i) => (
                <p key={i} className={`text-[10px] font-mono leading-relaxed
                  ${l.startsWith('✓') ? 'text-[#22C55E]' : l.startsWith('✗') ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
                  {l}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Список файлов класса ─────────────────────────────────────────────────────
function FileList({ cls, files, color, onDeleted }) {
  async function handleDelete(filename) {
    if (!confirm(`Удалить ${filename}?`)) return
    await fetch(`http://localhost:8000/dataset/file/${encodeURIComponent(cls)}/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    onDeleted()
  }

  if (!files.length)
    return <p className="text-[11px] text-[#475569] py-4 text-center">Нет файлов в этом классе</p>

  return (
    <div className="flex flex-col gap-0.5 max-h-[340px] overflow-y-auto pr-1">
      {files.map(f => (
        <div key={f} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1A2235] group">
          <FileAudio size={12} className="shrink-0" style={{ color }} />
          <span className="text-[11px] text-[#94A3B8] flex-1 truncate font-mono">{f}</span>
          <button onClick={() => handleDelete(f)}
            className="opacity-0 group-hover:opacity-100 text-[#475569] hover:text-[#EF4444] transition-all">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Главная страница ─────────────────────────────────────────────────────────
export default function DatasetPage() {
  const [data,        setData]        = useState({ classes: {} })
  const [loading,     setLoading]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [showNew,     setShowNew]     = useState(false)
  const [uploadFor,   setUploadFor]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/dataset')
      setData(await res.json())
    } catch { /* backend недоступен */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const classes = Object.entries(data.classes)
  const totalFiles = classes.reduce((s, [, v]) => s + v.count, 0)

  async function handleDeleteClass(cls) {
    if (!confirm(`Удалить класс "${cls}" со всеми файлами?`)) return
    await fetch(`http://localhost:8000/dataset/class/${encodeURIComponent(cls)}`, { method: 'DELETE' })
    if (selected === cls) setSelected(null)
    load()
  }

  const selectedData = selected ? data.classes[selected] : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HFSyncPanel />

      <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* ── Левая панель: классы ── */}
      <div className="flex flex-col w-[280px] shrink-0 border-r border-[#1E2D45] h-full">

        {/* Шапка */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1E2D45] shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
            <Database size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#E2E8F0]">Датасет</p>
            <p className="text-[10px] text-[#64748B]">{classes.length} классов · {totalFiles} файлов</p>
          </div>
          <button onClick={load} className="ml-auto text-[#475569] hover:text-[#E2E8F0] transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Список классов */}
        <div className="flex-1 overflow-y-auto py-2">
          {classes.length === 0 && !loading && (
            <p className="text-[11px] text-[#475569] text-center py-8">Датасет пуст</p>
          )}
          {classes.map(([cls, { count }], idx) => (
            <button
              key={cls}
              onClick={() => setSelected(cls === selected ? null : cls)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#1A2235] group"
              style={selected === cls ? { background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : {}}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: classColor(idx) }} />
              <span className="text-[12px] text-[#E2E8F0] flex-1 font-medium">{cls}</span>
              <span className="text-[10px] text-[#64748B] font-mono">{count}</span>
              <ChevronRight size={12} className={`text-[#475569] transition-transform ${selected === cls ? 'rotate-90' : ''}`} />
            </button>
          ))}
        </div>

        {/* Кнопка нового класса */}
        <div className="p-3 border-t border-[#1E2D45] shrink-0">
          <button
            onClick={() => setShowNew(true)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-[11px] font-semibold transition-colors"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}
          >
            <Plus size={13} /> Новый класс
          </button>
        </div>
      </div>

      {/* ── Правая панель: файлы ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <FolderOpen size={36} className="text-[#1E2D45]" />
            <p className="text-[13px] text-[#475569]">Выберите класс слева чтобы посмотреть файлы</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Шапка класса */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1E2D45] shrink-0">
              <span className="w-3 h-3 rounded-full" style={{ background: classColor(classes.findIndex(([c]) => c === selected)) }} />
              <span className="text-[14px] font-bold text-[#E2E8F0]">{selected}</span>
              <span className="text-[11px] text-[#64748B]">{selectedData?.count ?? 0} файлов</span>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setUploadFor(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-white bg-[#3B82F6] hover:bg-[#2563EB]">
                  <Upload size={12} /> Добавить
                </button>
                <button
                  onClick={() => handleDeleteClass(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-[#EF4444] border border-[#EF4444]/30 hover:bg-[#EF4444]/10">
                  <Trash2 size={12} /> Удалить класс
                </button>
              </div>
            </div>

            {/* Файлы */}
            <div className="flex-1 overflow-hidden p-4">
              <FileList
                cls={selected}
                files={selectedData?.files ?? []}
                color={classColor(classes.findIndex(([c]) => c === selected))}
                onDeleted={load}
              />
            </div>
          </div>
        )}
      </div>

      {/* Модалки */}
      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreated={load} />}
      {uploadFor && (
        <UploadModal
          cls={uploadFor}
          onClose={() => setUploadFor(null)}
          onDone={load}
        />
      )}
      </div>
    </div>
  )
}
