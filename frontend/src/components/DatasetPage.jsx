import { useState, useEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Database, Plus, Trash2, Upload, Scissors, RefreshCw, X, FolderOpen, FileAudio, ChevronRight, Cloud, CloudUpload, CheckCircle, Play, Square, BarChart2, Shuffle } from 'lucide-react'
import { useLang } from '../i18n'

const CLASS_COLORS = ['#EF4444','#F59E0B','#22C55E','#3B82F6','#A855F7','#06B6D4','#F97316','#EC4899']

function classColor(idx) { return CLASS_COLORS[idx % CLASS_COLORS.length] }

// ── Модалка создания класса ──────────────────────────────────────────────────
function NewClassModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const t = useLang()

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
        <h3 className="text-[14px] font-bold text-[#E2E8F0] mb-4">{t('dataset.new_class')}</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder={t('dataset.new_class_ph')}
          className="w-full bg-[#1A2235] border border-[#1E2D45] rounded-lg px-3 py-2 text-[12px] text-[#E2E8F0] outline-none mb-4 font-mono uppercase"
        />
        <button
          onClick={handleCreate} disabled={!name.trim() || loading}
          className="w-full py-2 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-50 bg-[#3B82F6] hover:bg-[#2563EB]">
          {loading ? t('dataset.creating') : t('dataset.create')}
        </button>
      </div>
    </div>
  )
}

// ── Модалка загрузки файлов ──────────────────────────────────────────────────
function UploadModal({ cls, onClose, onDone }) {
  const [mode,        setMode]        = useState('upload')
  const [segSec,      setSegSec]      = useState(6)
  const [file,        setFile]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [logs,        setLogs]        = useState([])
  const [progress,    setProgress]    = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [dragging,    setDragging]    = useState(false)
  const fileRef   = useRef()
  const abortRef  = useRef(null)
  const logsRef   = useRef(null)
  const dragCount = useRef(0)
  const t = useLang()

  // Запрещаем браузеру открывать файл если дроп произошёл вне зоны
  useEffect(() => {
    const stop = e => { e.preventDefault(); e.stopPropagation() }
    document.addEventListener('dragover', stop)
    document.addEventListener('drop', stop)
    return () => {
      document.removeEventListener('dragover', stop)
      document.removeEventListener('drop', stop)
    }
  }, [])

  function onDragEnter(e) { e.preventDefault(); e.stopPropagation(); dragCount.current++; setDragging(true) }
  function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); dragCount.current--; if (dragCount.current === 0) setDragging(false) }
  function onDragOver(e)  { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }
  function onDrop(e, multiple) {
    e.preventDefault(); e.stopPropagation()
    dragCount.current = 0; setDragging(false)
    const dropped = [...e.dataTransfer.files].filter(f => /\.(wav|mp3|mp4|mkv|avi|mov|m4a)$/i.test(f.name))
    if (!dropped.length) return
    setFile(multiple ? dropped : [dropped[0]])
    setResult(null); setLogs([])
  }

  useEffect(() => { logsRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }) }, [logs])

  function handleClose() {
    if (loading) { setShowConfirm(true); return }
    onClose()
  }

  function handleAbort() {
    abortRef.current?.abort()
    setShowConfirm(false)
    setLoading(false)
    onClose()
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true); setLogs([]); setResult(null); setProgress(null)
    const fd = new FormData()

    if (mode === 'upload') {
      for (const f of file) fd.append('files', f)
      setLogs(['Загрузка файлов на сервер...'])
      await fetch(`http://localhost:8000/dataset/upload/${encodeURIComponent(cls)}`, { method: 'POST', body: fd })
      setLogs(l => [...l, `✓ Готово — ${file.length} файл(ов) добавлено`])
      setResult(`Загружено: ${file.length} файл(ов)`)
      setLoading(false); onDone(); return
    }

    fd.append('file', file[0])
    fd.append('segment_sec', segSec)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(
        `http://localhost:8000/dataset/cut/${encodeURIComponent(cls)}`,
        { method: 'POST', body: fd, signal: ctrl.signal }
      )
      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines.filter(Boolean)) {
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'log')      setLogs(l => [...l, msg.text])
            if (msg.type === 'progress') { setProgress({ done: msg.done, total: msg.total }); setLogs(l => [...l, msg.text]) }
            if (msg.type === 'done')     { setResult(`Нарезано: ${msg.segments} сегментов`); setLogs(l => [...l, `✓ Готово — ${msg.segments} сегментов`]); onDone() }
            if (msg.type === 'error')    setLogs(l => [...l, `✗ Ошибка: ${msg.text}`])
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setLogs(l => [...l, `✗ ${e.message}`])
    } finally { setLoading(false) }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-10 w-[440px] bg-[#111827] border border-[#1E2D45] rounded-xl p-6 shadow-2xl">
        <button onClick={handleClose} className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0]"><X size={16}/></button>
        <h3 className="text-[14px] font-bold text-[#E2E8F0] mb-1">{t('dataset.add')} → <span style={{ color: 'var(--accent)' }}>{cls}</span></h3>
        <p className="text-[11px] text-[#64748B] mb-4">{t('dataset.drop_hint')}</p>

        <div className="flex gap-1 mb-4 bg-[#0C1120] p-1 rounded-lg">
          {[['upload', t('dataset.upload')], ['cut', t('dataset.cut')]].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setFile(null); setResult(null); setLogs([]) }}
              className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors"
              style={mode === m ? { background: 'var(--accent)', color: '#fff' } : { color: '#64748B' }}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'upload' && (
          <div
            onClick={() => fileRef.current.click()}
            onDragEnter={onDragEnter} onDragLeave={onDragLeave}
            onDragOver={onDragOver}  onDrop={e => onDrop(e, true)}
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-3"
            style={{ borderColor: dragging ? 'var(--accent)' : '#1E2D45', background: dragging ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : '' }}>
            <FileAudio size={24} className="mx-auto mb-2" style={{ color: dragging ? 'var(--accent)' : '#475569' }} />
            <p className="text-[11px]" style={{ color: dragging ? 'var(--accent)' : '#64748B' }}>
              {dragging ? 'Отпустите файлы' : file ? `${file.length} файл(ов) выбрано` : 'Перетащите WAV / MP3 или нажмите для выбора'}
            </p>
            <input ref={fileRef} type="file" accept=".wav,.mp3" multiple className="hidden"
              onChange={e => { setFile([...e.target.files]); setResult(null); setLogs([]) }} />
          </div>
        )}

        {mode === 'cut' && !loading && (
          <>
            <div
              onClick={() => fileRef.current.click()}
              onDragEnter={onDragEnter} onDragLeave={onDragLeave}
              onDragOver={onDragOver}  onDrop={e => onDrop(e, false)}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-3"
              style={{ borderColor: dragging ? 'var(--accent)' : '#1E2D45', background: dragging ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : '' }}>
              <Scissors size={24} className="mx-auto mb-2" style={{ color: dragging ? 'var(--accent)' : '#475569' }} />
              <p className="text-[11px]" style={{ color: dragging ? 'var(--accent)' : '#64748B' }}>
                {dragging ? 'Отпустите файл' : file ? file[0].name : 'Перетащите файл или нажмите · WAV, MP3, MP4, MKV, AVI, MOV'}
              </p>
              <input ref={fileRef} type="file" accept=".wav,.mp3,.mp4,.mkv,.avi,.mov,.m4a" className="hidden"
                onChange={e => { setFile([...e.target.files]); setResult(null); setLogs([]) }} />
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] text-[#64748B] shrink-0">{t('dataset.seg_len')}</span>
              <input type="range" min={2} max={15} step={1} value={segSec}
                onChange={e => setSegSec(Number(e.target.value))}
                className="flex-1 h-1 bg-[#1E2D45] rounded appearance-none cursor-pointer" />
              <span className="text-[11px] font-semibold text-[#E2E8F0] w-10 text-right">{segSec} сек</span>
            </div>
          </>
        )}

        {/* Логи */}
        {logs.length > 0 && (
          <div ref={logsRef} className="bg-[#080E1A] rounded-lg p-3 mb-3 h-[120px] overflow-y-auto font-mono text-[10px] flex flex-col gap-0.5">
            {logs.map((l, i) => (
              <span key={i} className={l.startsWith('✓') ? 'text-[#22C55E]' : l.startsWith('✗') ? 'text-[#EF4444]' : 'text-[#64748B]'}>{l}</span>
            ))}
          </div>
        )}

        {/* Прогресс-бар */}
        {progress && progress.total > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
              <span>Нарезка</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-200"
                   style={{ width: `${Math.round(progress.done/progress.total*100)}%`, background: 'var(--accent)' }} />
            </div>
          </div>
        )}

        {result && (
          <div className="mb-3 px-3 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-[11px] text-[#22C55E]">
            ✓ {result}
          </div>
        )}

        {result ? (
          <button onClick={onClose}
            className="w-full py-2 rounded-lg text-[12px] font-semibold text-white transition-colors bg-[#22C55E] hover:bg-[#16A34A]">
            Готово
          </button>
        ) : (
          <button onClick={handleUpload} disabled={!file || loading}
            className="w-full py-2 rounded-lg text-[12px] font-semibold text-white transition-colors disabled:opacity-50 bg-[#3B82F6] hover:bg-[#2563EB]">
            {loading
              ? <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" />{mode === 'cut' ? 'Нарезка...' : 'Загрузка...'}</span>
              : mode === 'cut' ? t('dataset.cut_btn') : t('dataset.upload_btn')}
          </button>
        )}
      </div>
    </div>

    {/* Подтверждение прерывания */}
    {showConfirm && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 bg-[#111827] border border-[#1E2D45] rounded-2xl px-8 py-7 shadow-2xl max-w-[320px] w-full mx-4 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-[14px] font-bold text-[#E2E8F0] mb-2">Прервать нарезку?</p>
          <p className="text-[11px] text-[#64748B] mb-5">Уже нарезанные файлы останутся. Незавершённые будут потеряны.</p>
          <div className="flex flex-col gap-2">
            <button onClick={handleAbort}
              className="w-full py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-[12px] font-semibold transition-colors">
              Да, прервать
            </button>
            <button onClick={() => setShowConfirm(false)}
              className="w-full py-2.5 rounded-xl bg-[#1A2235] hover:bg-[#1E2D45] text-[#E2E8F0] text-[12px] font-semibold border border-[#1E2D45] transition-colors">
              Продолжить нарезку
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ── Список файлов класса ─────────────────────────────────────────────────────
// ── HuggingFace Sync Panel ───────────────────────────────────────────────────
function HFSyncPanel() {
  const t = useLang()
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
        <span className="text-[12px] font-semibold text-[#E2E8F0] flex-1 text-left">{t('dataset.hf_sync')}</span>
        {saved && <span className="text-[10px] text-[#22C55E] flex items-center gap-1"><CheckCircle size={10}/>{t('dataset.hf_saved')}</span>}
        <ChevronRight size={13} className={`text-[#475569] transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-4 flex flex-col gap-3">
          {/* Config */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-[#64748B] block mb-1">{t('dataset.hf_repo')}</label>
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
                {t('dataset.hf_save')}
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
                ? <><RefreshCw size={12} className="animate-spin" /> {t('dataset.hf_pushing')}</>
                : <><CloudUpload size={12} /> {t('dataset.hf_push')}</>}
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

// ── Балансировка класса ──────────────────────────────────────────────────────
function BalanceModal({ cls, datasetClasses, onClose, onDone }) {
  // datasetClasses: { cls: { count } }
  const counts    = Object.values(datasetClasses).map(v => v.count)
  const maxCount  = counts.length ? Math.max(...counts) : 0
  const clsCount  = datasetClasses[cls]?.count ?? 0
  const needed    = Math.max(0, maxCount - clsCount)

  const [phase,    setPhase]    = useState('confirm') // confirm | running | done | error
  const [logs,     setLogs]     = useState([])
  const [progress, setProgress] = useState(null)
  const [added,    setAdded]    = useState(0)
  const logsRef = useRef(null)

  useEffect(() => { logsRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }) }, [logs])

  async function handleBalance() {
    setPhase('running'); setLogs([]); setProgress(null)
    try {
      const res = await fetch(
        `http://localhost:8000/dataset/balance/${encodeURIComponent(cls)}`,
        { method: 'POST' }
      )
      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines.filter(Boolean)) {
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'log')      setLogs(l => [...l, msg.text])
            if (msg.type === 'progress') {
              setProgress({ done: msg.done, total: msg.total })
              setLogs(l => [...l, msg.text])
            }
            if (msg.type === 'done') {
              setAdded(msg.added)
              setPhase('done')
              if (msg.added > 0) setLogs(l => [...l, `✓ Добавлено ${msg.added} файлов`])
              else               setLogs(l => [...l, `✓ ${msg.text}`])
              onDone()
            }
            if (msg.type === 'error') {
              setLogs(l => [...l, `✗ ${msg.text}`])
              setPhase('error')
            }
          } catch {}
        }
      }
    } catch (e) {
      setLogs(l => [...l, `✗ ${e.message}`])
      setPhase('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={phase === 'running' ? undefined : onClose} />
      <div className="relative z-10 w-[420px] bg-[#111827] border border-[#1E2D45] rounded-xl p-6 shadow-2xl">
        {phase !== 'running' && (
          <button onClick={onClose} className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0]">
            <X size={16} />
          </button>
        )}

        {/* Заголовок */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
            <Shuffle size={18} className="text-[#F59E0B]" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#E2E8F0]">Балансировка класса</p>
            <p className="text-[11px] text-[#64748B]">
              <span style={{ color: 'var(--accent)' }}>{cls}</span>
              {' '}· {clsCount} файлов
            </p>
          </div>
        </div>

        {/* Подтверждение */}
        {phase === 'confirm' && (
          <>
            <div className="bg-[#0C1120] border border-[#1E2D45] rounded-lg p-3 mb-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#64748B]">Файлов в классе:</span>
                <span className="font-mono text-[#E2E8F0]">{clsCount}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#64748B]">Макс. в датасете:</span>
                <span className="font-mono text-[#E2E8F0]">{maxCount}</span>
              </div>
              <div className="h-px bg-[#1E2D45] my-0.5" />
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#64748B]">Будет добавлено:</span>
                <span className={`font-mono font-bold ${needed > 0 ? 'text-[#F59E0B]' : 'text-[#22C55E]'}`}>
                  {needed > 0 ? `+${needed}` : 'уже сбалансирован'}
                </span>
              </div>
            </div>

            {needed > 0 ? (
              <p className="text-[11px] text-[#64748B] mb-4 leading-relaxed">
                Файлы из класса <strong className="text-[#E2E8F0]">{cls}</strong> будут случайно скопированы с новыми именами, пока класс не достигнет {maxCount} файлов.
              </p>
            ) : (
              <p className="text-[11px] text-[#22C55E] mb-4">Класс уже содержит максимальное количество файлов.</p>
            )}

            <div className="flex gap-2">
              {needed > 0 ? (
                <>
                  <button onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold text-[#E2E8F0] bg-[#1A2235] hover:bg-[#1E2D45] border border-[#1E2D45] transition-colors">
                    Нет
                  </button>
                  <button onClick={handleBalance}
                    className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold text-white bg-[#F59E0B] hover:bg-[#D97706] transition-colors">
                    Да, балансировать
                  </button>
                </>
              ) : (
                <button onClick={onClose}
                  className="w-full py-2.5 rounded-lg text-[12px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors">
                  Закрыть
                </button>
              )}
            </div>
          </>
        )}

        {/* Прогресс */}
        {(phase === 'running' || phase === 'done' || phase === 'error') && (
          <>
            {logs.length > 0 && (
              <div ref={logsRef} className="bg-[#080E1A] rounded-lg p-3 mb-3 h-[140px] overflow-y-auto font-mono text-[10px] flex flex-col gap-0.5">
                {logs.map((l, i) => (
                  <span key={i} className={l.startsWith('✓') ? 'text-[#22C55E]' : l.startsWith('✗') ? 'text-[#EF4444]' : 'text-[#64748B]'}>{l}</span>
                ))}
              </div>
            )}

            {progress && progress.total > 0 && phase === 'running' && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-[#64748B] mb-1">
                  <span>Копирование</span>
                  <span>{progress.done} / {progress.total}</span>
                </div>
                <div className="h-1.5 bg-[#1A2235] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200 bg-[#F59E0B]"
                       style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} />
                </div>
              </div>
            )}

            {phase === 'running' && (
              <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-[#64748B]">
                <RefreshCw size={12} className="animate-spin" /> Балансировка...
              </div>
            )}

            {(phase === 'done' || phase === 'error') && (
              <button onClick={onClose}
                className={`w-full py-2.5 rounded-lg text-[12px] font-semibold text-white transition-colors ${
                  phase === 'done' ? 'bg-[#22C55E] hover:bg-[#16A34A]' : 'bg-[#EF4444] hover:bg-[#DC2626]'
                }`}>
                {phase === 'done' ? `Готово — добавлено ${added} файлов` : 'Закрыть'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Оверлей спектрограммы ────────────────────────────────────────────────────
function SpectrogramOverlay({ cls, file, onClose }) {
  const url = `http://localhost:8000/dataset/spectrogram/${encodeURIComponent(cls)}/${encodeURIComponent(file.name)}`
  const [loaded, setLoaded] = useState(false)
  const [error,  setError]  = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-[680px] bg-[#111827] border border-[#1E2D45] rounded-2xl p-5 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#E2E8F0] transition-colors">
          <X size={16} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={15} style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-[13px] font-bold text-[#E2E8F0]">{file.name}</p>
            <p className="text-[10px] text-[#64748B]">{cls} · {fmtDur(file.duration)} · {fmtSize(file.size)}</p>
          </div>
        </div>

        <div className="relative bg-[#0C1120] rounded-xl overflow-hidden" style={{ minHeight: 160 }}>
          {!loaded && !error && (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <RefreshCw size={14} className="text-[#475569] animate-spin" />
              <span className="text-[11px] text-[#475569]">Генерация спектрограммы...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] text-[#EF4444]">Ошибка загрузки спектрограммы</span>
            </div>
          )}
          <img src={url} alt="spectrogram"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className="w-full rounded-xl"
            style={{ display: loaded ? 'block' : 'none' }} />
        </div>

        <p className="text-[10px] text-[#475569] mt-2 text-center">Mel-спектрограмма · 128 мел-полос · до 8 кГц</p>
      </div>
    </div>
  )
}

function fmtDur(s) {
  if (s == null) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return m > 0 ? `${m}:${String(sec).padStart(2,'0')}` : `${sec}с`
}
function fmtSize(b) {
  if (b == null) return '—'
  return b >= 1048576 ? `${(b/1048576).toFixed(1)} МБ` : `${Math.round(b/1024)} КБ`
}

// ── Список файлов класса ─────────────────────────────────────────────────────
function FileList({ cls, files, color, onDeleted }) {
  const t = useLang()
  const audioRef      = useRef(null)
  const [playing,     setPlaying]     = useState(null)
  const [spectro,     setSpectro]     = useState(null)
  const [checked,     setChecked]     = useState(new Set())
  const [deleting,    setDeleting]    = useState(false)
  const lastIdx       = useRef(null)

  const rows = files.map(f => typeof f === 'string' ? { name: f, size: null, duration: null } : f)
  const allChecked = rows.length > 0 && checked.size === rows.length
  const someChecked = checked.size > 0

  function togglePlay(file) {
    if (playing === file.name) { audioRef.current?.pause(); setPlaying(null); return }
    audioRef.current?.pause()
    const a = new Audio(`http://localhost:8000/dataset/audio/${encodeURIComponent(cls)}/${encodeURIComponent(file.name)}`)
    audioRef.current = a
    a.onended = () => setPlaying(null)
    a.play().catch(() => setPlaying(null))
    setPlaying(file.name)
  }

  function toggleCheck(name, idx, e) {
    if (e.shiftKey && lastIdx.current !== null) {
      const from = Math.min(lastIdx.current, idx)
      const to   = Math.max(lastIdx.current, idx)
      setChecked(prev => {
        const n = new Set(prev)
        for (let i = from; i <= to; i++) n.add(rows[i].name)
        return n
      })
    } else {
      setChecked(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
      lastIdx.current = idx
    }
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(rows.map(r => r.name)))
  }

  useEffect(() => () => audioRef.current?.pause(), [])
  useEffect(() => { setChecked(new Set()); lastIdx.current = null }, [cls])

  async function handleDeleteOne(filename) {
    if (!confirm(`Удалить ${filename}?`)) return
    audioRef.current?.pause(); setPlaying(null)
    await fetch(`http://localhost:8000/dataset/file/${encodeURIComponent(cls)}/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    setChecked(prev => { const n = new Set(prev); n.delete(filename); return n })
    onDeleted()
  }

  async function handleDeleteSelected() {
    if (!confirm(`Удалить ${checked.size} файл(ов)?`)) return
    setDeleting(true)
    audioRef.current?.pause(); setPlaying(null)
    await Promise.all([...checked].map(name =>
      fetch(`http://localhost:8000/dataset/file/${encodeURIComponent(cls)}/${encodeURIComponent(name)}`, { method: 'DELETE' })
    ))
    setChecked(new Set())
    setDeleting(false)
    onDeleted()
  }

  const scrollRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  if (!rows.length)
    return <p className="text-[11px] text-[#475569] py-4 text-center">{t('dataset.no_files')}</p>

  return (
    <>
    <div className="flex flex-col min-h-0 overflow-hidden h-full">

      {/* Панель мультиселекта */}
      {someChecked && (
        <div className="flex items-center gap-3 px-2.5 py-2 mb-1 bg-[#1A2235] rounded-lg border border-[#1E2D45] shrink-0">
          <span className="text-[11px] text-[#E2E8F0] flex-1">Выбрано: <strong>{checked.size}</strong></span>
          <button onClick={handleDeleteSelected} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 transition-colors">
            {deleting ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Удалить {checked.size}
          </button>
          <button onClick={() => setChecked(new Set())} className="text-[#475569] hover:text-[#E2E8F0] transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Шапка */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 mb-0.5 border-b border-[#1E2D45] shrink-0">
        <input type="checkbox" checked={allChecked} onChange={toggleAll}
          className="w-3.5 h-3.5 rounded shrink-0 cursor-pointer accent-[color:var(--accent)]" />
        <span className="w-5 shrink-0" />
        <span className="text-[9px] text-[#475569] uppercase tracking-wide flex-1">Файл</span>
        <span className="text-[9px] text-[#475569] uppercase tracking-wide w-10 text-right">Длит.</span>
        <span className="text-[9px] text-[#475569] uppercase tracking-wide w-14 text-right">Размер</span>
        <span className="w-14 shrink-0" />
      </div>

      {/* Виртуальный список */}
      <div ref={scrollRef} className="overflow-y-auto flex-1">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(vRow => {
            const file = rows[vRow.index]
            const { name, size, duration } = file
            const isPlaying = playing === name
            const isChecked = checked.has(name)
            return (
              <div key={name}
                style={{ position: 'absolute', top: vRow.start, left: 0, right: 0, height: vRow.size }}
                className="px-1 group">
                <div className="flex items-center gap-1.5 w-full h-full px-1.5 rounded-lg cursor-pointer select-none hover:bg-[#1A2235]"
                  style={isChecked ? { background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : {}}>

                  <input type="checkbox" checked={isChecked} onChange={() => {}}
                    onClick={e => { e.stopPropagation(); toggleCheck(name, vRow.index, e) }}
                    className="w-3.5 h-3.5 rounded shrink-0 cursor-pointer accent-[color:var(--accent)]" />

                  <button onClick={() => togglePlay(file)}
                    className="w-5 h-5 flex items-center justify-center rounded transition-colors shrink-0"
                    style={{ color: isPlaying ? 'var(--accent)' : undefined }}>
                    {isPlaying
                      ? <Square size={9} fill="currentColor" className="text-[color:var(--accent)]" />
                      : <Play size={9} className="text-[#475569] group-hover:text-[#94A3B8]" />}
                  </button>

                  <FileAudio size={10} className="shrink-0" style={{ color: isPlaying ? 'var(--accent)' : color }} />
                  <span className={`text-[11px] flex-1 truncate font-mono ${isPlaying ? 'text-[#E2E8F0]' : 'text-[#94A3B8]'}`}>{name}</span>

                  <span className="text-[10px] text-[#64748B] w-10 text-right font-mono shrink-0">{fmtDur(duration)}</span>
                  <span className="text-[10px] text-[#475569] w-14 text-right font-mono shrink-0">{fmtSize(size)}</span>

                  <button onClick={() => setSpectro(file)}
                    className="opacity-0 group-hover:opacity-100 text-[#475569] hover:text-[#60A5FA] transition-all shrink-0">
                    <BarChart2 size={11} />
                  </button>
                  <button onClick={() => handleDeleteOne(name)}
                    className="opacity-0 group-hover:opacity-100 text-[#475569] hover:text-[#EF4444] transition-all shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>

    {spectro && <SpectrogramOverlay cls={cls} file={spectro} onClose={() => setSpectro(null)} />}
    </>
  )
}

// ── Главная страница ─────────────────────────────────────────────────────────
export default function DatasetPage() {
  const t = useLang()
  const [data,        setData]        = useState({ classes: {} })
  const [loading,     setLoading]     = useState(false)
  const [selected,    setSelected]    = useState(null)
  const [showNew,     setShowNew]     = useState(false)
  const [uploadFor,   setUploadFor]   = useState(null)
  const [balanceFor,  setBalanceFor]  = useState(null)
  const [classFiles,  setClassFiles]  = useState([])
  const [filesLoading,setFilesLoading]= useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/dataset')
      setData(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadFiles(cls) {
    setFilesLoading(true)
    setClassFiles([])
    try {
      const res = await fetch(`http://localhost:8000/dataset/files/${encodeURIComponent(cls)}`)
      const d = await res.json()
      setClassFiles(d.files ?? [])
    } catch {}
    setFilesLoading(false)
  }

  function handleSelectClass(cls) {
    if (cls === selected) { setSelected(null); setClassFiles([]); return }
    setSelected(cls)
    loadFiles(cls)
  }

  const classes = Object.entries(data.classes)
  const totalFiles = classes.reduce((s, [, v]) => s + v.count, 0)

  async function handleDeleteClass(cls) {
    if (!confirm(`Удалить класс "${cls}" со всеми файлами?`)) return
    await fetch(`http://localhost:8000/dataset/class/${encodeURIComponent(cls)}`, { method: 'DELETE' })
    if (selected === cls) { setSelected(null); setClassFiles([]) }
    load()
  }

  function handleFilesChanged() {
    load()
    if (selected) loadFiles(selected)
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
            <p className="text-[10px] text-[#64748B]">{classes.length} {t('dataset.classes')} · {totalFiles} {t('dataset.files')}</p>
          </div>
          <button onClick={load} className="ml-auto text-[#475569] hover:text-[#E2E8F0] transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Список классов */}
        <div className="flex-1 overflow-y-auto py-2">
          {classes.length === 0 && !loading && (
            <p className="text-[11px] text-[#475569] text-center py-8">{t('dataset.empty')}</p>
          )}
          {classes.map(([cls, { count }], idx) => (
            <button
              key={cls}
              onClick={() => handleSelectClass(cls)}
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
            <Plus size={13} /> {t('dataset.new_class')}
          </button>
        </div>
      </div>

      {/* ── Правая панель: файлы ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <FolderOpen size={36} className="text-[#1E2D45]" />
            <p className="text-[13px] text-[#475569]">{t('dataset.select')}</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Шапка класса */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#1E2D45] shrink-0">
              <span className="w-3 h-3 rounded-full" style={{ background: classColor(classes.findIndex(([c]) => c === selected)) }} />
              <span className="text-[14px] font-bold text-[#E2E8F0]">{selected}</span>
              <span className="text-[11px] text-[#64748B]">{selectedData?.count ?? 0} {t('dataset.files')}</span>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setUploadFor(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-white bg-[#3B82F6] hover:bg-[#2563EB]">
                  <Upload size={12} /> {t('dataset.add')}
                </button>
                <button
                  onClick={() => setBalanceFor(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-[#F59E0B] border border-[#F59E0B]/30 hover:bg-[#F59E0B]/10">
                  <Shuffle size={12} /> Балансировка
                </button>
                <button
                  onClick={() => handleDeleteClass(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-[#EF4444] border border-[#EF4444]/30 hover:bg-[#EF4444]/10">
                  <Trash2 size={12} /> {t('dataset.delete_class')}
                </button>
              </div>
            </div>

            {/* Файлы */}
            <div className="flex-1 overflow-hidden p-4">
              {filesLoading ? (
                <div className="flex items-center justify-center h-full gap-2 text-[#475569]">
                  <RefreshCw size={14} className="animate-spin" />
                  <span className="text-[12px]">Загрузка файлов...</span>
                </div>
              ) : (
                <FileList
                  cls={selected}
                  files={classFiles}
                  color={classColor(classes.findIndex(([c]) => c === selected))}
                  onDeleted={handleFilesChanged}
                />
              )}
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
          onDone={handleFilesChanged}
        />
      )}
      {balanceFor && (
        <BalanceModal
          cls={balanceFor}
          datasetClasses={data.classes}
          onClose={() => setBalanceFor(null)}
          onDone={handleFilesChanged}
        />
      )}
      </div>
    </div>
  )
}
