import asyncio
import json
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from engine  import DiagnosticEngine
from trainer import Trainer

DATASET_PATH  = Path(__file__).parent.parent / 'dataset'
MODELS_DIR    = Path(__file__).parent.parent / 'models'
HF_CONFIG     = Path(__file__).parent.parent / 'hf_config.json'
EXCLUDED_DIRS = {'diagnostic', 'Отчёты', 'Diagnost_2_0', 'diagnostics', '.cache'}
MODELS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="AudioDiagnostic API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=2)

# Загружаем модель один раз при старте сервера
engine = DiagnosticEngine()
_model_ok, _model_msg = engine.load_model()
print(f"[{'OK' if _model_ok else 'WARN'}] {_model_msg}")


@app.get("/dialog/folder")
def open_folder_dialog():
    """Открывает нативный диалог выбора папки через tkinter"""
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.wm_attributes('-topmost', True)
    path = filedialog.askdirectory(title="Выберите папку с датасетом")
    root.destroy()
    return {"path": path or ""}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "3.0",
        "model_loaded": engine.model is not None,
        "classes": engine.classes,
    }


# ─── HF Config API ────────────────────────────────────────────────────────────

@app.get("/hf/config")
def get_hf_config():
    if HF_CONFIG.exists():
        cfg = json.loads(HF_CONFIG.read_text(encoding='utf-8'))
        tok = cfg.get('token', '')
        return {"repo": cfg.get('repo', ''), "token_set": bool(tok),
                "token_preview": (tok[:8] + '…') if tok else ''}
    return {"repo": "", "token_set": False, "token_preview": ""}

@app.post("/hf/config")
def save_hf_config(repo: str = Form(...), token: str = Form(...)):
    HF_CONFIG.write_text(json.dumps({"repo": repo, "token": token}, ensure_ascii=False), encoding='utf-8')
    return {"ok": True}


# ─── Models API ───────────────────────────────────────────────────────────────

@app.get("/models")
def list_models():
    from engine import ACTIVE_MODEL_FILE
    active = ""
    if ACTIVE_MODEL_FILE.exists():
        try: active = json.loads(ACTIVE_MODEL_FILE.read_text()).get("name", "")
        except: pass

    models = []
    for p in sorted(MODELS_DIR.glob("*.pth")):
        classes_file = MODELS_DIR / f"{p.stem}_classes.json"
        classes = []
        if classes_file.exists():
            try: classes = json.loads(classes_file.read_text(encoding="utf-8"))
            except: pass
        models.append({
            "name":    p.stem,
            "size_mb": round(p.stat().st_size / 1024 / 1024, 1),
            "classes": classes,
            "active":  p.stem == active,
        })
    return {"models": models, "active": active}

@app.get("/models/active")
def get_active_model():
    from engine import ACTIVE_MODEL_FILE
    name = ""
    if ACTIVE_MODEL_FILE.exists():
        try: name = json.loads(ACTIVE_MODEL_FILE.read_text()).get("name", "")
        except: pass
    return {"name": name, "classes": engine.classes, "loaded": engine.model is not None}

@app.post("/models/activate")
def activate_model(name: str = Form(...)):
    ok, msg = engine.load_model_by_name(name)
    if ok:
        return {"ok": True, "msg": msg, "classes": engine.classes, "name": name}
    return JSONResponse({"ok": False, "msg": msg}, status_code=400)

@app.delete("/models/{name}")
def delete_model(name: str):
    from engine import ACTIVE_MODEL_FILE
    pth       = MODELS_DIR / f"{name}.pth"
    cls_file  = MODELS_DIR / f"{name}_classes.json"
    if pth.exists():      pth.unlink()
    if cls_file.exists(): cls_file.unlink()
    if ACTIVE_MODEL_FILE.exists():
        try:
            active = json.loads(ACTIVE_MODEL_FILE.read_text()).get("name", "")
            if active == name:
                ACTIVE_MODEL_FILE.unlink()
                engine.model       = None
                engine.model_name  = ''
        except: pass
    return {"ok": True}


# ─── Dataset API ──────────────────────────────────────────────────────────────

_files_cache: dict = {}  # cls → {"mtime": float, "files": [...]}


def _cls_dirs():
    if not DATASET_PATH.exists(): return []
    return [d for d in sorted(DATASET_PATH.iterdir())
            if d.is_dir() and d.name not in EXCLUDED_DIRS and not d.name.startswith('.')]

def _natural_key(p: Path):
    import re
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', p.name)]

def _audio_files(cls_dir: Path):
    files = [f for f in cls_dir.iterdir() if f.is_file() and f.suffix.lower() in {'.wav', '.mp3'}]
    return sorted(files, key=_natural_key)

def _get_class_files(cls: str) -> list:
    cls_dir = DATASET_PATH / cls
    if not cls_dir.exists(): return []
    mtime = cls_dir.stat().st_mtime
    cached = _files_cache.get(cls)
    if cached and cached["mtime"] == mtime:
        return cached["files"]
    audio = _audio_files(cls_dir)
    # Только stat — без чтения WAV заголовков, мгновенно даже для 5000+ файлов
    files = [{"name": f.name, "size": f.stat().st_size, "duration": None} for f in audio]
    _files_cache[cls] = {"mtime": mtime, "files": files}
    return files


@app.get("/dataset")
def get_dataset():
    result = {}
    for cls_dir in _cls_dirs():
        count = sum(1 for f in cls_dir.iterdir() if f.is_file() and f.suffix.lower() in {'.wav', '.mp3'})
        result[cls_dir.name] = {"count": count}
    return {"classes": result}


@app.get("/dataset/files/{cls}")
def get_class_files(cls: str):
    files = _get_class_files(cls)
    return {"files": files, "count": len(files)}


@app.get("/dataset/audio/{cls}/{filename}")
def serve_audio(cls: str, filename: str):
    from fastapi.responses import FileResponse
    path = DATASET_PATH / cls / filename
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(str(path), media_type="audio/wav")


@app.get("/dataset/spectrogram/{cls}/{filename}")
def get_spectrogram(cls: str, filename: str):
    import io
    import numpy as np
    import librosa
    import librosa.display
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from fastapi.responses import StreamingResponse

    path = DATASET_PATH / cls / filename
    if not path.exists():
        return JSONResponse({"error": "not found"}, status_code=404)

    y, sr = librosa.load(str(path), sr=22050)
    S    = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)
    S_db = librosa.power_to_db(S, ref=np.max)

    fig, ax = plt.subplots(figsize=(9, 2.8))
    fig.patch.set_facecolor('#0C1120')
    ax.set_facecolor('#111827')
    img = librosa.display.specshow(S_db, sr=sr, x_axis='time', y_axis='mel',
                                   ax=ax, cmap='magma', fmax=8000)
    cbar = plt.colorbar(img, ax=ax, format='%+2.0f dB')
    cbar.ax.yaxis.set_tick_params(color='#64748B', labelcolor='#64748B')
    ax.tick_params(colors='#64748B', labelsize=7)
    ax.set_xlabel('Время (сек)', color='#64748B', fontsize=8)
    ax.set_ylabel('Частота', color='#64748B', fontsize=8)
    for spine in ax.spines.values():
        spine.set_color('#1E2D45')
    plt.tight_layout(pad=0.5)

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110, bbox_inches='tight', facecolor='#0C1120')
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.post("/history/spectrogram")
async def history_spectrogram(file: UploadFile = File(...)):
    import io, tempfile
    import librosa, librosa.display
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    content = await file.read()
    suffix  = Path(file.filename or 'audio.webm').suffix.lower() or '.webm'

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    load_path = tmp_path
    wav_path  = None
    try:
        if suffix not in {'.wav', '.mp3', '.flac', '.ogg'}:
            import subprocess
            ffmpeg_bin = shutil.which('ffmpeg') or r'C:\Users\Mi\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
            wav_path = tmp_path.with_suffix('.wav')
            r = subprocess.run(
                [ffmpeg_bin, '-i', str(tmp_path), '-ac', '1', '-ar', '22050', str(wav_path), '-y'],
                capture_output=True,
            )
            if r.returncode == 0:
                load_path = wav_path

        y, sr = librosa.load(str(load_path), sr=22050)
        S     = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=8000)
        S_db  = librosa.power_to_db(S, ref=np.max)

        fig, ax = plt.subplots(figsize=(9, 2.8))
        fig.patch.set_facecolor('#0C1120')
        ax.set_facecolor('#111827')
        img  = librosa.display.specshow(S_db, sr=sr, x_axis='time', y_axis='mel',
                                        ax=ax, cmap='magma', fmax=8000)
        cbar = plt.colorbar(img, ax=ax, format='%+2.0f dB')
        cbar.ax.yaxis.set_tick_params(color='#64748B', labelcolor='#64748B')
        ax.tick_params(colors='#64748B', labelsize=7)
        ax.set_xlabel('Время (сек)', color='#64748B', fontsize=8)
        ax.set_ylabel('Частота', color='#64748B', fontsize=8)
        for spine in ax.spines.values():
            spine.set_color('#1E2D45')
        plt.tight_layout(pad=0.5)

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=110, bbox_inches='tight', facecolor='#0C1120')
        plt.close(fig)
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        tmp_path.unlink(missing_ok=True)
        if wav_path: wav_path.unlink(missing_ok=True)


@app.post("/dataset/balance/{cls}")
async def balance_class(cls: str):
    import random as _random, shutil as _shutil
    loop = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def worker():
        def put(msg): asyncio.run_coroutine_threadsafe(q.put(msg), loop).result()
        try:
            cls_dirs = _cls_dirs()
            counts = {}
            for d in cls_dirs:
                counts[d.name] = sum(
                    1 for f in d.iterdir()
                    if f.is_file() and f.suffix.lower() in {'.wav', '.mp3'}
                )
            if cls not in counts:
                put({"type": "error", "text": f"Класс '{cls}' не найден"}); return

            max_count = max(counts.values())
            cls_count = counts[cls]
            if cls_count >= max_count:
                put({"type": "done", "added": 0,
                     "text": f"Класс уже сбалансирован ({cls_count} файлов)"}); return

            needed = max_count - cls_count
            put({"type": "log",
                 "text": f"Макс. в датасете: {max_count} · Текущий: {cls_count} · Нужно добавить: {needed}"})

            cls_dir     = DATASET_PATH / cls
            src_files   = _audio_files(cls_dir)
            if not src_files:
                put({"type": "error", "text": "Нет исходных файлов для копирования"}); return

            existing_stems = [f.stem for f in cls_dir.iterdir() if f.suffix.lower() in {'.wav', '.mp3'}]
            nums = []
            for s in existing_stems:
                try: nums.append(int(s.split('_')[-1]))
                except: pass
            idx = (max(nums) + 1) if nums else 0

            added = 0
            for _ in range(needed):
                src  = _random.choice(src_files)
                ext  = src.suffix.lower()
                dest = cls_dir / f"output_{idx:04d}{ext}"
                _shutil.copy2(str(src), str(dest))
                idx   += 1
                added += 1
                put({"type": "progress", "done": added, "total": needed,
                     "text": f"Скопировано {added}/{needed}: {dest.name}"})

            _files_cache.pop(cls, None)
            put({"type": "done", "added": added})
        except Exception as e:
            import traceback
            put({"type": "error", "text": str(e), "trace": traceback.format_exc()})

    executor.submit(worker)

    async def stream():
        while True:
            msg = await q.get()
            yield json.dumps(msg, ensure_ascii=False) + "\n"
            if msg["type"] in ("done", "error"):
                break

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.post("/dataset/class/{name}")
def create_class(name: str):
    (DATASET_PATH / name).mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@app.delete("/dataset/class/{name}")
def delete_class(name: str):
    path = DATASET_PATH / name
    if path.exists():
        shutil.rmtree(path)
    return {"ok": True}


@app.delete("/dataset/file/{cls}/{filename}")
def delete_file(cls: str, filename: str):
    path = DATASET_PATH / cls / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@app.post("/dataset/upload/{cls}")
async def upload_files(cls: str, files: list[UploadFile] = File(...)):
    dest = DATASET_PATH / cls
    dest.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        out = dest / f.filename
        # Avoid overwrite
        stem, ext = Path(f.filename).stem, Path(f.filename).suffix
        n = 1
        while out.exists():
            out = dest / f"{stem}_{n}{ext}"
            n += 1
        out.write_bytes(await f.read())
        saved.append(out.name)
    return {"ok": True, "saved": saved}


@app.post("/dataset/cut/{cls}")
async def cut_audio(
    cls: str,
    segment_sec: int = Form(6),
    file: UploadFile = File(...),
):
    import librosa, soundfile as sf

    content  = await file.read()
    filename = file.filename
    dest     = DATASET_PATH / cls
    dest.mkdir(parents=True, exist_ok=True)
    loop     = asyncio.get_event_loop()
    q: asyncio.Queue = asyncio.Queue()

    def worker():
        def put(msg): asyncio.run_coroutine_threadsafe(q.put(msg), loop).result()
        tmp_path = None
        wav_path = None
        try:
            put({"type": "log", "text": f"Получен файл: {filename}"})
            suffix = Path(filename).suffix.lower() or '.wav'
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)

            # MP4/видео → извлекаем аудио через ffmpeg
            if suffix in {'.mp4', '.mkv', '.avi', '.mov', '.m4a'}:
                put({"type": "log", "text": "Извлечение аудио из видео (ffmpeg)..."})
                import subprocess, shutil
                ffmpeg_bin = shutil.which('ffmpeg') or r'C:\Users\Mi\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe'
                wav_path = tmp_path.with_suffix('.wav')
                result = subprocess.run(
                    [ffmpeg_bin, '-i', str(tmp_path), '-ac', '1', '-ar', '22050',
                     '-vn', str(wav_path), '-y'],
                    capture_output=True
                )
                if result.returncode != 0:
                    raise RuntimeError(f"ffmpeg ошибка: {result.stderr.decode(errors='ignore')[-200:]}")
                put({"type": "log", "text": "Аудио извлечено успешно"})
                load_path = wav_path
            else:
                load_path = tmp_path

            put({"type": "log", "text": "Загрузка аудио..."})
            signal, sr = librosa.load(str(load_path), sr=22050, mono=True)
            duration = round(len(signal) / sr, 1)
            chunk    = int(segment_sec * sr)

            total = sum(1 for s in range(0, len(signal), chunk) if len(signal[s:s+chunk]) >= sr)
            put({"type": "log", "text": f"Длительность: {duration} сек → {total} сегментов по {segment_sec} сек"})

            existing = [f.stem for f in dest.iterdir() if f.suffix.lower() in {'.wav', '.mp3'}]
            nums = []
            for s in existing:
                try: nums.append(int(s.split('_')[-1]))
                except: pass
            idx = (max(nums) + 1) if nums else 0

            segments = 0
            for start in range(0, len(signal), chunk):
                piece = signal[start:start + chunk]
                if len(piece) < sr:
                    continue
                sf.write(str(dest / f"output_{idx:03d}.wav"), piece, sr)
                idx += 1; segments += 1
                put({"type": "progress", "done": segments, "total": total,
                     "text": f"Сегмент {segments}/{total} сохранён"})

            put({"type": "done", "segments": segments})
        except Exception as e:
            put({"type": "error", "text": str(e)})
        finally:
            if tmp_path: tmp_path.unlink(missing_ok=True)
            if wav_path: wav_path.unlink(missing_ok=True)

    executor.submit(worker)

    async def stream():
        while True:
            msg = await q.get()
            yield json.dumps(msg, ensure_ascii=False) + "\n"
            if msg["type"] in ("done", "error"):
                break

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.get("/audio/devices")
def get_audio_devices():
    import sounddevice as sd
    devices = sd.query_devices()
    inputs = [
        {"id": i, "name": d["name"], "channels": int(d["max_input_channels"])}
        for i, d in enumerate(devices)
        if d["max_input_channels"] > 0
    ]
    try:
        default_in = sd.default.device[0]
    except Exception:
        default_in = None
    return {"devices": inputs, "default": default_in}


# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_event_loop()

    # Сообщаем фронту статус модели (динамически от текущего engine)
    await _send(ws, {
        "type":  "status",
        "title": "Модель загружена" if engine.model is not None else "Без модели",
        "sub":   engine.model_name if engine.model_name else "Готова к работе",
        "level": "ok" if engine.model is not None else "warn",
    })

    recording       = False
    stream          = None
    send_task       = None
    audio_queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    inference_step  = {'sec': getattr(engine, 'STEP_SEC', 5.0)}

    # ── Цикл отправки аудио + предсказаний ────────────────────
    async def sender():
        buf           = np.zeros(engine.SR * engine.WINDOW_SEC, dtype=np.float32)
        step_samples  = int(engine.SR * inference_step['sec'])
        since_predict = 0

        while True:
            try:
                chunk = await asyncio.wait_for(audio_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            if chunk is None:       # сигнал остановки
                break

            # Скользящий буфер
            buf = np.roll(buf, -len(chunk))
            buf[-len(chunk):] = chunk
            since_predict += len(chunk)

            # Осциллограмма (~20 fps, отправляем каждый чанк)
            display = chunk[::4].tolist()
            await _send(ws, {"type": "waveform", "data": display})

            # Инференс каждые STEP_SEC секунд
            if engine.model and since_predict >= step_samples:
                since_predict = 0
                buf_copy = buf.copy()
                try:
                    result = await loop.run_in_executor(executor, engine.predict, buf_copy)
                    await _send(ws, {"type": "prediction", "data": result})
                except Exception as e:
                    print(f"Inference error: {e}")

    # ── Основной цикл приёма команд от фронта ─────────────────
    try:
        while True:
            raw  = await ws.receive_text()
            data = json.loads(raw)

            if data["type"] == "start" and not recording:
                recording = True
                import sounddevice as sd

                chunk_size  = int(engine.SR * 0.05)     # 50 мс
                device_id   = data.get("device", None)  # None = default
                gain        = float(data.get("gain", 1.0))
                inference_step['sec'] = max(1.0, min(60.0, float(data.get("step_sec", getattr(engine, 'STEP_SEC', 5.0)))))

                def audio_callback(indata, frames, time_info, status):
                    chunk = (indata[:, 0] * gain).copy()
                    try:
                        loop.call_soon_threadsafe(audio_queue.put_nowait, chunk)
                    except asyncio.QueueFull:
                        pass

                stream = sd.InputStream(
                    device=device_id,
                    samplerate=engine.SR,
                    channels=1,
                    dtype="float32",
                    blocksize=chunk_size,
                    callback=audio_callback,
                )
                stream.start()
                send_task = asyncio.create_task(sender())

                await _send(ws, {
                    "type": "status", "level": "ok",
                    "title": "Запись идёт...", "sub": "Микрофон активен",
                })

            elif data["type"] == "stop" and recording:
                recording = False
                if stream:
                    stream.stop(); stream.close(); stream = None

                await audio_queue.put(None)     # остановить sender
                if send_task:
                    await send_task; send_task = None

                await _send(ws, {
                    "type": "status", "level": "warn",
                    "title": "Остановлено", "sub": "Нажмите для новой записи",
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS error: {e}")
    finally:
        if stream:
            stream.stop(); stream.close()
        if send_task:
            send_task.cancel()


async def _send(ws: WebSocket, data: dict):
    try:
        await ws.send_text(json.dumps(data, ensure_ascii=False))
    except Exception:
        pass


@app.websocket("/ws/train")
async def ws_train(ws: WebSocket):
    await ws.accept()
    loop    = asyncio.get_event_loop()
    trainer = Trainer()
    queue: asyncio.Queue = asyncio.Queue()

    def on_msg(data: dict):
        loop.call_soon_threadsafe(queue.put_nowait, data)

    async def sender():
        while True:
            msg = await queue.get()
            await _send(ws, msg)
            if msg.get('type') == 'train_complete':
                ok, info = engine.load_model()
                await _send(ws, {'type': 'train_log', 'text': f'Модель перезагружена: {info}'})
            # sender живёт всё время соединения — не разрываем

    send_task = asyncio.create_task(sender())

    try:
        while True:
            raw  = await ws.receive_text()
            data = json.loads(raw)

            if data['type'] == 'hf_download':
                repo_id   = data.get('repo_id', 'AudioDiagnosticTeam/dataset')
                local_dir = Path(__file__).parent.parent / 'dataset'
                local_dir.mkdir(exist_ok=True)
                _hf_stop = False

                def _download_hf():
                    try:
                        from huggingface_hub import list_repo_files, hf_hub_download

                        on_msg({'type': 'hf_log', 'text': f'Получение списка файлов из {repo_id}...'})

                        all_files = list(list_repo_files(repo_id, repo_type='dataset'))
                        audio = [f for f in all_files if f.lower().endswith(('.wav', '.WAV', '.mp3'))]
                        classes = set(f.split('/')[0] for f in audio if '/' in f)

                        on_msg({'type': 'hf_log',
                                'text': f'Найдено {len(audio)} аудио-файлов, {len(classes)} классов: {", ".join(sorted(classes))}'})
                        on_msg({'type': 'hf_total', 'total': len(audio)})

                        skipped = 0
                        for i, fpath in enumerate(audio):
                            try:
                                on_msg({'type': 'hf_file', 'text': fpath,
                                        'done': i, 'total': len(audio), 'size_kb': 0})
                                hf_hub_download(
                                    repo_id=repo_id, filename=fpath,
                                    repo_type='dataset', local_dir=str(local_dir),
                                )
                            except Exception as e:
                                skipped += 1
                                on_msg({'type': 'hf_log', 'text': f'Пропуск {fpath}: {e}'})

                        on_msg({'type': 'hf_done', 'local_path': str(local_dir),
                                'total': len(audio), 'audio': len(audio) - skipped})

                    except Exception as e:
                        import traceback
                        on_msg({'type': 'hf_error', 'text': str(e), 'trace': traceback.format_exc()})

                await loop.run_in_executor(executor, _download_hf)

            elif data['type'] == 'train_start':
                trainer.start(
                    dataset_path           = data.get('dataset_path') or str(DATASET_PATH),
                    epochs                 = int(data.get('epochs', 40)),
                    batch_size             = int(data.get('batch_size', 32)),
                    lr                     = float(data.get('lr', 0.001)),
                    augment                = bool(data.get('augment', True)),
                    on_msg                 = on_msg,
                    model_name             = data.get('model_name', ''),
                    class_weight_overrides = data.get('class_weight_overrides', {}),
                    parallel_mode          = data.get('parallel_mode', 'threads'),
                    n_workers              = int(data.get('n_workers', 0)),
                    mfcc_device            = data.get('mfcc_device', 'auto'),
                    split_mode             = data.get('split_mode', 'standard'),
                )

            elif data['type'] == 'train_stop':
                trainer.stop()

            elif data['type'] == 'hf_push':
                cfg     = json.loads(HF_CONFIG.read_text(encoding='utf-8')) if HF_CONFIG.exists() else {}
                token   = cfg.get('token', '')
                repo_id = cfg.get('repo', '')

                def _push_hf():
                    try:
                        from huggingface_hub import HfApi
                        api = HfApi(token=token)

                        audio_files = [
                            f for f in DATASET_PATH.rglob('*')
                            if f.is_file()
                            and f.suffix.lower() in {'.wav', '.mp3'}
                            and not any(p.startswith('.') for p in f.relative_to(DATASET_PATH).parts)
                        ]
                        on_msg({'type': 'hf_push_log', 'text': f'Подготовка {len(audio_files)} файлов для загрузки...'})
                        on_msg({'type': 'hf_push_start', 'total': len(audio_files)})

                        skipped = 0
                        for i, f in enumerate(audio_files):
                            rel = f.relative_to(DATASET_PATH).as_posix()
                            try:
                                api.upload_file(
                                    path_or_fileobj=str(f),
                                    path_in_repo=rel,
                                    repo_id=repo_id,
                                    repo_type='dataset',
                                )
                            except Exception as e:
                                skipped += 1
                                on_msg({'type': 'hf_push_log', 'text': f'Пропуск {rel}: {e}'})
                            on_msg({'type': 'hf_push_progress', 'done': i + 1, 'total': len(audio_files), 'file': rel})

                        on_msg({'type': 'hf_push_done',
                                'total': len(audio_files), 'skipped': skipped, 'repo': repo_id})
                    except Exception as e:
                        import traceback
                        on_msg({'type': 'hf_push_error', 'text': str(e), 'trace': traceback.format_exc()})

                await loop.run_in_executor(executor, _push_hf)

    except WebSocketDisconnect:
        trainer.stop()
    finally:
        send_task.cancel()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
