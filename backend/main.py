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
from fastapi.responses import JSONResponse

from engine  import DiagnosticEngine
from trainer import Trainer

DATASET_PATH  = Path(__file__).parent.parent / 'dataset'
HF_CONFIG     = Path(__file__).parent.parent / 'hf_config.json'
EXCLUDED_DIRS = {'diagnostic', 'Отчёты', 'Diagnost_2_0', 'diagnostics', '.cache'}

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


# ─── Dataset API ──────────────────────────────────────────────────────────────

@app.get("/dataset")
def get_dataset():
    if not DATASET_PATH.exists():
        return {"classes": {}}
    result = {}
    for cls_dir in sorted(DATASET_PATH.iterdir()):
        if cls_dir.is_dir() and cls_dir.name not in EXCLUDED_DIRS and not cls_dir.name.startswith('.'):
            files = sorted([
                f.name for f in cls_dir.iterdir()
                if f.is_file() and f.suffix.lower() in {'.wav', '.mp3'}
            ])
            result[cls_dir.name] = {"count": len(files), "files": files}
    return {"classes": result}


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
    import librosa
    import soundfile as sf

    dest = DATASET_PATH / cls
    dest.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename).suffix or '.wav'
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        signal, sr = librosa.load(str(tmp_path), sr=22050, mono=True)
        chunk = int(segment_sec * sr)
        segments = 0

        # Find next free index
        existing = [f.stem for f in dest.iterdir() if f.suffix.lower() in {'.wav', '.mp3'}]
        nums = []
        for s in existing:
            try: nums.append(int(s.split('_')[-1]))
            except: pass
        idx = (max(nums) + 1) if nums else 0

        for start in range(0, len(signal), chunk):
            piece = signal[start:start + chunk]
            if len(piece) < sr:       # drop clips < 1 second
                continue
            out_path = dest / f"output_{idx:03d}.wav"
            sf.write(str(out_path), piece, sr)
            idx += 1
            segments += 1

        return {"ok": True, "segments": segments, "class": cls}
    finally:
        tmp_path.unlink(missing_ok=True)


# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_event_loop()

    # Сообщаем фронту статус модели
    await _send(ws, {
        "type":  "status",
        "title": "Модель загружена" if _model_ok else "Без модели",
        "sub":   _model_msg,
        "level": "ok" if _model_ok else "warn",
    })

    recording   = False
    stream      = None
    send_task   = None
    audio_queue: asyncio.Queue = asyncio.Queue(maxsize=200)

    # ── Цикл отправки аудио + предсказаний ────────────────────
    async def sender():
        buf           = np.zeros(engine.SR * engine.WINDOW_SEC, dtype=np.float32)
        step_samples  = int(engine.SR * engine.STEP_SEC)
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

                chunk_size = int(engine.SR * 0.05)     # 50 мс

                def audio_callback(indata, frames, time_info, status):
                    chunk = indata[:, 0].copy()
                    try:
                        loop.call_soon_threadsafe(audio_queue.put_nowait, chunk)
                    except asyncio.QueueFull:
                        pass

                stream = sd.InputStream(
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
                    dataset_path = data.get('dataset_path', ''),
                    epochs       = int(data.get('epochs', 40)),
                    batch_size   = int(data.get('batch_size', 32)),
                    lr           = float(data.get('lr', 0.001)),
                    augment      = bool(data.get('augment', True)),
                    on_msg       = on_msg,
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
