import json
import os
import threading
from pathlib import Path

import numpy as np

SAMPLE_RATE = 22050
DURATION    = 5
N_MFCC      = 20
TARGET_TIME = 215
EXCLUDED    = {'diagnostic', 'Отчёты', 'Diagnost_2_0', 'diagnostics'}


def extract_mfcc(file_path, augment=False):
    import librosa
    try:
        signal, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)

        if augment:
            import random
            aug = random.choice(['noise', 'shift', 'volume', 'none', 'none'])
            if aug == 'noise':
                signal = signal + 0.015 * np.random.randn(len(signal)).astype(np.float32)
            elif aug == 'shift':
                signal = np.roll(signal, int(len(signal) * np.random.uniform(-0.3, 0.3)))
            elif aug == 'volume':
                signal = signal * np.random.uniform(0.7, 1.3)

        mfcc = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=N_MFCC)
        mfcc = (mfcc - mfcc.mean()) / (mfcc.std() + 1e-8)

        if mfcc.shape[1] < TARGET_TIME:
            mfcc = np.pad(mfcc, ((0, 0), (0, TARGET_TIME - mfcc.shape[1])))
        else:
            mfcc = mfcc[:, :TARGET_TIME]

        return mfcc.astype(np.float32)
    except Exception:
        return None


class Trainer:
    def __init__(self):
        self._stop  = threading.Event()
        self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, dataset_path: str, epochs: int, batch_size: int, lr: float,
              augment: bool, on_msg):
        if self.is_running():
            on_msg({'type': 'train_error', 'text': 'Обучение уже идёт'})
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            args=(dataset_path, epochs, batch_size, lr, augment, on_msg),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        self._stop.set()

    # ─────────────────────────────────────────────────────────────
    def _run(self, dataset_path, epochs, batch_size, lr, augment, on_msg):
        try:
            import torch
            import torch.nn as nn
            import torch.optim as optim
            from torch.utils.data import Dataset, DataLoader, random_split

            # ── Датасет ──────────────────────────────────────────
            on_msg({'type': 'train_log', 'text': 'Сканирование датасета...'})

            classes = sorted([
                d for d in os.listdir(dataset_path)
                if os.path.isdir(os.path.join(dataset_path, d)) and d not in EXCLUDED
            ])

            if not classes:
                on_msg({'type': 'train_error', 'text': f'Папки классов не найдены в {dataset_path}'}); return

            on_msg({'type': 'train_log', 'text': f'Классы: {classes}'})

            X, y = [], []
            for idx, cls in enumerate(classes):
                cls_path = os.path.join(dataset_path, cls)
                files = [f for f in os.listdir(cls_path) if f.lower().endswith(('.wav', '.mp3'))]
                on_msg({'type': 'train_log', 'text': f'  {cls}: {len(files)} файлов'})

                for fname in files:
                    if self._stop.is_set(): break
                    fpath = os.path.join(cls_path, fname)

                    feat = extract_mfcc(fpath, augment=False)
                    if feat is not None:
                        X.append(feat); y.append(idx)

                    if augment:
                        for _ in range(3):
                            feat = extract_mfcc(fpath, augment=True)
                            if feat is not None:
                                X.append(feat); y.append(idx)

            if not X:
                on_msg({'type': 'train_error', 'text': 'Не удалось извлечь признаки из файлов'}); return

            on_msg({'type': 'train_log', 'text': f'Загружено {len(X)} образцов'})

            class _DS(Dataset):
                def __getitem__(self, i):
                    return torch.tensor(X[i]).unsqueeze(0), torch.tensor(y[i])
                def __len__(self): return len(X)

            dataset   = _DS()
            tr_size   = int(0.8 * len(dataset))
            ts_size   = len(dataset) - tr_size
            tr_ds, ts_ds = random_split(dataset, [tr_size, ts_size])
            tr_loader = DataLoader(tr_ds, batch_size=batch_size, shuffle=True,  num_workers=0)
            ts_loader = DataLoader(ts_ds, batch_size=batch_size, shuffle=False, num_workers=0)

            # ── Модель ────────────────────────────────────────────
            from engine import DiagnosticEngine
            model  = DiagnosticEngine()._build_cnn(len(classes))
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            model.to(device)

            criterion = nn.CrossEntropyLoss()
            optimizer = optim.Adam(model.parameters(), lr=lr)
            scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5, verbose=False)

            on_msg({'type': 'train_started', 'epochs': epochs, 'classes': classes,
                    'samples': len(X), 'device': str(device)})

            best_acc  = 0.0
            build_dir = Path(__file__).parent.parent
            out_path  = build_dir / 'fault_diagnosis_model_best.pth'

            for epoch in range(1, epochs + 1):
                if self._stop.is_set():
                    on_msg({'type': 'train_log', 'text': 'Остановлено пользователем'}); break

                # Train
                model.train()
                tr_loss, tr_correct, tr_total = 0.0, 0, 0
                for xb, yb in tr_loader:
                    if self._stop.is_set(): break
                    xb, yb = xb.to(device), yb.to(device)
                    optimizer.zero_grad()
                    out  = model(xb)
                    loss = criterion(out, yb)
                    loss.backward()
                    optimizer.step()
                    tr_loss    += loss.item()
                    _, pred     = torch.max(out, 1)
                    tr_total   += yb.size(0)
                    tr_correct += (pred == yb).sum().item()

                # Eval
                model.eval()
                ts_loss, ts_correct, ts_total = 0.0, 0, 0
                with torch.no_grad():
                    for xb, yb in ts_loader:
                        xb, yb = xb.to(device), yb.to(device)
                        out  = model(xb)
                        loss = criterion(out, yb)
                        ts_loss    += loss.item()
                        _, pred     = torch.max(out, 1)
                        ts_total   += yb.size(0)
                        ts_correct += (pred == yb).sum().item()

                tr_acc = tr_correct / tr_total
                ts_acc = ts_correct / ts_total
                scheduler.step(ts_loss / len(ts_loader))

                if ts_acc > best_acc:
                    best_acc = ts_acc
                    torch.save(model.state_dict(), out_path)

                on_msg({
                    'type':       'train_progress',
                    'epoch':      epoch,
                    'total':      epochs,
                    'train_acc':  round(tr_acc, 4),
                    'test_acc':   round(ts_acc, 4),
                    'train_loss': round(tr_loss / len(tr_loader), 4),
                    'test_loss':  round(ts_loss / len(ts_loader), 4),
                    'lr':         round(optimizer.param_groups[0]['lr'], 6),
                    'best_acc':   round(best_acc, 4),
                })

            # Сохраняем классы
            (build_dir / 'model_classes.json').write_text(
                json.dumps(classes, ensure_ascii=False), encoding='utf-8'
            )

            on_msg({
                'type':     'train_complete',
                'classes':  classes,
                'best_acc': round(best_acc, 4),
                'model':    str(out_path),
            })

        except Exception as e:
            import traceback
            on_msg({'type': 'train_error', 'text': str(e), 'trace': traceback.format_exc()})
