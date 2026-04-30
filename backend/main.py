import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from engine  import DiagnosticEngine
from trainer import Trainer

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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "3.0",
        "model_loaded": engine.model is not None,
        "classes": engine.classes,
    }


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
                    from huggingface_hub import list_repo_tree, hf_hub_download

                    on_msg({'type': 'hf_log', 'text': f'Подключение к {repo_id}...'})

                    # Собираем список файлов
                    try:
                        items = list(list_repo_tree(repo_id, repo_type='dataset', recursive=True))
                    except Exception as e:
                        on_msg({'type': 'hf_error', 'text': f'Ошибка при получении списка файлов: {e}'}); return

                    files = [it for it in items if hasattr(it, 'path') and
                             any(it.path.lower().endswith(ext) for ext in ('.wav', '.mp3', '.json'))]

                    audio = [f for f in files if f.path.lower().endswith(('.wav', '.mp3'))]
                    on_msg({'type': 'hf_log', 'text': f'Найдено {len(audio)} аудио-файлов в {len(set(f.path.split("/")[0] for f in audio))} классах'})
                    on_msg({'type': 'hf_total', 'total': len(files)})

                    for i, item in enumerate(files):
                        if _hf_stop: return
                        try:
                            size_kb = round(getattr(item, 'size', 0) / 1024, 1)
                            on_msg({'type': 'hf_file', 'text': item.path,
                                    'done': i, 'total': len(files), 'size_kb': size_kb})
                            hf_hub_download(
                                repo_id=repo_id, filename=item.path,
                                repo_type='dataset', local_dir=str(local_dir),
                            )
                        except Exception as e:
                            on_msg({'type': 'hf_log', 'text': f'Пропуск {item.path}: {e}'})

                    on_msg({'type': 'hf_done', 'local_path': str(local_dir),
                            'total': len(files), 'audio': len(audio)})

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

    except WebSocketDisconnect:
        trainer.stop()
    finally:
        send_task.cancel()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
