import hashlib
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
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
            import random, librosa.effects

            # Громкость — почти всегда
            if random.random() < 0.8:
                signal = signal * np.random.uniform(0.65, 1.35)

            # Гауссов шум (разные микрофоны / помехи)
            if random.random() < 0.5:
                level = np.random.uniform(0.004, 0.02)
                signal = signal + (level * np.random.randn(len(signal))).astype(np.float32)

            # Сдвиг по времени (±10%)
            if random.random() < 0.4:
                signal = np.roll(signal, int(len(signal) * np.random.uniform(-0.10, 0.10)))

            # Фоновый шум дороги (низкочастотный гул)
            if random.random() < 0.45:
                road = np.random.randn(len(signal)).astype(np.float32)
                road = np.convolve(road, np.ones(80) / 80, mode='same').astype(np.float32)
                road /= (np.abs(road).max() + 1e-8)
                signal = signal + road * np.random.uniform(0.03, 0.12)

            # Псевдо-питч через ресэмплинг ±10% скорости (разные обороты мотора)
            # Быстрее pitch_shift в 30-50x, физически корректно для RPM
            if random.random() < 0.40:
                rate = np.random.uniform(0.90, 1.10)
                resampled = librosa.resample(signal, orig_sr=sr, target_sr=int(sr * rate))
                if len(resampled) >= len(signal):
                    signal = resampled[:len(signal)]
                else:
                    signal = np.pad(resampled, (0, len(signal) - len(resampled)))

        mfcc = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=N_MFCC)
        mfcc = (mfcc - mfcc.mean()) / (mfcc.std() + 1e-8)

        if mfcc.shape[1] < TARGET_TIME:
            mfcc = np.pad(mfcc, ((0, 0), (0, TARGET_TIME - mfcc.shape[1])))
        else:
            mfcc = mfcc[:, :TARGET_TIME]

        return mfcc.astype(np.float32)
    except Exception:
        return None


def _proc_worker(args):
    """Module-level worker for ProcessPoolExecutor (must be picklable on Windows)."""
    fpath, class_idx, cache_dir, augment = args
    import hashlib as _hlib
    import os as _os
    import numpy as _np

    def _cp(fp):
        try: mtime = str(_os.path.getmtime(fp))
        except: mtime = '0'
        key = _hlib.md5(
            f"{fp}|{mtime}|{SAMPLE_RATE}|{DURATION}|{N_MFCC}|{TARGET_TIME}".encode()
        ).hexdigest()
        return _os.path.join(cache_dir, f"{key}.npy")

    def _load_or_compute(cp, fn):
        if _os.path.exists(cp):
            try: return _np.load(cp)
            except: pass
        feat = fn()
        if feat is not None:
            try: _np.save(cp, feat)
            except: pass
        return feat

    results = []
    cp   = _cp(fpath)
    feat = _load_or_compute(cp, lambda: extract_mfcc(fpath, augment=False))
    if feat is not None:
        results.append((feat, class_idx))
    if augment:
        for i in range(3):
            aug_cp = cp.replace('.npy', f'_a{i}.npy')
            fa = _load_or_compute(aug_cp, lambda fp=fpath: extract_mfcc(fp, augment=True))
            if fa is not None:
                results.append((fa, class_idx))
    return results


def _load_audio_raw(fpath):
    """Fast audio loading: torchaudio first, librosa fallback. Returns float32 numpy array."""
    target = SAMPLE_RATE * DURATION
    try:
        import torch, torchaudio
        wf, sr = torchaudio.load(str(fpath))
        if wf.shape[0] > 1:
            wf = wf.mean(0, keepdim=True)
        if sr != SAMPLE_RATE:
            wf = torchaudio.functional.resample(wf, sr, SAMPLE_RATE)
        if wf.shape[1] >= target:
            wf = wf[:, :target]
        else:
            wf = torch.nn.functional.pad(wf, (0, target - wf.shape[1]))
        return wf[0].numpy().astype(np.float32)
    except Exception:
        pass
    try:
        import librosa
        s, _ = librosa.load(str(fpath), sr=SAMPLE_RATE, duration=DURATION)
        if len(s) < target:
            s = np.pad(s, (0, target - len(s)))
        return s[:target].astype(np.float32)
    except Exception:
        return None


def _augment_numpy(signal):
    """Signal augmentation on numpy array (used by GPU batch path)."""
    import random as _r
    signal = signal.copy()
    if _r.random() < 0.8:
        signal = (signal * np.random.uniform(0.65, 1.35)).astype(np.float32)
    if _r.random() < 0.5:
        level = np.random.uniform(0.004, 0.02)
        signal = signal + (level * np.random.randn(len(signal))).astype(np.float32)
    if _r.random() < 0.4:
        signal = np.roll(signal, int(len(signal) * np.random.uniform(-0.10, 0.10)))
    if _r.random() < 0.45:
        road = np.random.randn(len(signal)).astype(np.float32)
        road = np.convolve(road, np.ones(80) / 80, mode='same').astype(np.float32)
        road /= (np.abs(road).max() + 1e-8)
        signal = signal + road * np.random.uniform(0.03, 0.12)
    if _r.random() < 0.40:
        try:
            import librosa
            rate = np.random.uniform(0.90, 1.10)
            res = librosa.resample(signal, orig_sr=SAMPLE_RATE, target_sr=int(SAMPLE_RATE * rate))
            if len(res) >= len(signal): signal = res[:len(signal)]
            else: signal = np.pad(res, (0, len(signal) - len(res)))
        except Exception:
            pass
    return signal.astype(np.float32)


class Trainer:
    def __init__(self):
        self._stop  = threading.Event()
        self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, dataset_path: str, epochs: int, batch_size: int, lr: float,
              augment: bool, on_msg, model_name: str = '', class_weight_overrides: dict = None,
              parallel_mode: str = 'threads', n_workers: int = 0, mfcc_device: str = 'auto',
              split_mode: str = 'standard'):
        if self.is_running():
            on_msg({'type': 'train_error', 'text': 'Обучение уже идёт'})
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run,
            args=(dataset_path, epochs, batch_size, lr, augment, on_msg, model_name,
                  class_weight_overrides or {}, parallel_mode, n_workers, mfcc_device, split_mode),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        self._stop.set()

    # ─────────────────────────────────────────────────────────────
    def _run(self, dataset_path, epochs, batch_size, lr, augment, on_msg, model_name='', class_weight_overrides=None, parallel_mode='threads', n_workers=0, mfcc_device='auto', split_mode='standard'):
        class_weight_overrides = class_weight_overrides or {}
        try:
            import torch
            import torch.nn as nn
            import torch.optim as optim
            from torch.utils.data import Dataset, DataLoader

            # ── Датасет ──────────────────────────────────────────
            on_msg({'type': 'train_log', 'text': 'Сканирование датасета...'})

            classes = sorted([
                d for d in os.listdir(dataset_path)
                if os.path.isdir(os.path.join(dataset_path, d))
                and d not in EXCLUDED and not d.startswith('.')
            ])

            if not classes:
                on_msg({'type': 'train_error', 'text': f'Папки классов не найдены в {dataset_path}'}); return

            on_msg({'type': 'train_log', 'text': f'Классы: {classes}'})

            import time

            # Считаем общее количество файлов
            all_files_map = {}
            for cls in classes:
                cls_path = os.path.join(dataset_path, cls)
                all_files_map[cls] = [f for f in os.listdir(cls_path) if f.lower().endswith(('.wav', '.mp3'))]
            total_files = sum(len(v) for v in all_files_map.values())
            on_msg({'type': 'train_log', 'text': f'Всего файлов: {total_files} × {1 + (3 if augment else 0)} = {total_files * (4 if augment else 1)} MFCC'})

            # ── Кэш MFCC на диске ────────────────────────────────────
            cache_dir = os.path.join(dataset_path, '.mfcc_cache')
            os.makedirs(cache_dir, exist_ok=True)

            def _cache_path(fpath):
                try: mtime = str(os.path.getmtime(fpath))
                except: mtime = '0'
                key = hashlib.md5(
                    f"{fpath}|{mtime}|{SAMPLE_RATE}|{DURATION}|{N_MFCC}|{TARGET_TIME}".encode()
                ).hexdigest()
                return os.path.join(cache_dir, f"{key}.npy")

            def _load_or_compute(cp, fn):
                if os.path.exists(cp):
                    try: return np.load(cp)
                    except: pass
                feat = fn()
                if feat is not None:
                    try: np.save(cp, feat)
                    except: pass
                return feat

            def _extract_base_cached(fpath):
                return _load_or_compute(
                    _cache_path(fpath),
                    lambda: extract_mfcc(fpath, augment=False)
                )

            def _extract_aug_cached(fpath, aug_idx):
                base = _cache_path(fpath).replace('.npy', f'_a{aug_idx}.npy')
                return _load_or_compute(
                    base,
                    lambda: extract_mfcc(fpath, augment=True)
                )

            # ── Параметры ────────────────────────────────────────────────────
            n_workers = max(1, n_workers) if n_workers and n_workers > 0 else max(1, min((os.cpu_count() or 4), 8))

            # ── Устройство MFCC ───────────────────────────────────────────────
            _gpu_ok = False
            try:
                import torch as _tch
                import torchaudio
                _cuda = _tch.cuda.is_available()
                if mfcc_device == 'gpu':
                    _gpu_ok = _cuda
                    if not _cuda:
                        on_msg({'type': 'train_log', 'text': 'WARN: CUDA недоступна — переключаюсь на CPU'})
                elif mfcc_device == 'cpu':
                    _gpu_ok = False
                else:
                    _gpu_ok = _cuda
            except Exception:
                pass

            # ── GPU-функции (если нужно) ──────────────────────────────────────
            if _gpu_ok:
                import torch
                import torchaudio.transforms as _TT
                GPU_BATCH = 512
                _mfcc_tf  = _TT.MFCC(
                    sample_rate=SAMPLE_RATE, n_mfcc=N_MFCC,
                    melkwargs={'n_fft': 2048, 'hop_length': 512, 'n_mels': 128}
                ).cuda()

                def _gpu_mfcc(signals_np):
                    t = torch.tensor(np.stack(signals_np)).cuda()
                    with torch.no_grad():
                        m = _mfcc_tf(t)
                        m = (m - m.mean(dim=(1,2), keepdim=True)) / (m.std(dim=(1,2), keepdim=True) + 1e-8)
                    a = m.cpu().numpy()
                    if a.shape[2] < TARGET_TIME:
                        a = np.pad(a, ((0,0),(0,0),(0, TARGET_TIME - a.shape[2])))
                    return a[:, :, :TARGET_TIME].astype(np.float32)

            # ── Универсальная функция извлечения ─────────────────────────────
            def _do_extract(task_list, do_augment, label):
                _X, _y, _n = [], [], len(task_list)
                _t0 = time.time()

                def _prog(done):
                    el  = time.time() - _t0
                    rt  = done / el if el > 0 else 1
                    eta = int((_n - done) / rt)
                    es  = f'{eta//60}м {eta%60}с' if eta > 60 else f'{eta}с'
                    on_msg({'type': 'train_progress_load', 'done': done, 'total': _n,
                            'text': f'MFCC [{label}]: {done}/{_n} · ETA {es}'})

                if _gpu_ok:
                    on_msg({'type': 'train_log',
                            'text': f'[{label}] GPU batch · батч {GPU_BATCH} · {n_workers} потоков загрузки'})
                    for bi in range(0, _n, GPU_BATCH):
                        if self._stop.is_set(): break
                        batch = task_list[bi:bi + GPU_BATCH]
                        need_load = []
                        for fpath, cls_idx in batch:
                            bcp = _cache_path(fpath)
                            if os.path.exists(bcp):
                                try:
                                    _X.append(np.load(bcp)); _y.append(cls_idx)
                                    if do_augment:
                                        for ai in range(3):
                                            acp = bcp.replace('.npy', f'_a{ai}.npy')
                                            if os.path.exists(acp):
                                                try: _X.append(np.load(acp)); _y.append(cls_idx)
                                                except: pass
                                    continue
                                except: pass
                            need_load.append((fpath, cls_idx, bcp))
                        if need_load:
                            with ThreadPoolExecutor(max_workers=n_workers) as pool:
                                raw = list(pool.map(lambda x: _load_audio_raw(x[0]), need_load))
                            valid = [(s, c, p) for s, (_, c, p) in zip(raw, need_load) if s is not None]
                            if valid:
                                sigs, clss, cps = zip(*valid)
                                base = _gpu_mfcc(list(sigs))
                                for feat, cls, cp in zip(base, clss, cps):
                                    try: np.save(cp, feat)
                                    except: pass
                                    _X.append(feat); _y.append(cls)
                                if do_augment:
                                    for ai in range(3):
                                        aug_m = _gpu_mfcc([_augment_numpy(s) for s in sigs])
                                        for feat, cls, cp in zip(aug_m, clss, cps):
                                            acp = cp.replace('.npy', f'_a{ai}.npy')
                                            try: np.save(acp, feat)
                                            except: pass
                                            _X.append(feat); _y.append(cls)
                        _prog(min(bi + GPU_BATCH, _n))
                else:
                    def _tw(args):
                        fpath, class_idx = args
                        results = []
                        feat = _extract_base_cached(fpath)
                        if feat is not None:
                            results.append((feat, class_idx))
                        if do_augment:
                            for i in range(3):
                                fa = _extract_aug_cached(fpath, i)
                                if fa is not None:
                                    results.append((fa, class_idx))
                        return results

                    use_proc = (parallel_mode == 'processes')
                    if use_proc:
                        from concurrent.futures import ProcessPoolExecutor
                        _ExecCls   = ProcessPoolExecutor
                        _run_t     = [(fp, ci, cache_dir, do_augment) for fp, ci in task_list]
                        _worker_fn = _proc_worker
                        mode_str   = f'{n_workers} процессов · ProcessPool'
                    else:
                        _ExecCls   = ThreadPoolExecutor
                        _run_t     = task_list
                        _worker_fn = _tw
                        mode_str   = f'{n_workers} потоков · ThreadPool'
                    on_msg({'type': 'train_log', 'text': f'[{label}] CPU MFCC: {mode_str}'})
                    _done = 0
                    with _ExecCls(max_workers=n_workers) as pool:
                        futs = {pool.submit(_worker_fn, t): t for t in _run_t}
                        for fut in as_completed(futs):
                            if self._stop.is_set():
                                for f in futs: f.cancel()
                                break
                            try:
                                for feat, idx in fut.result():
                                    _X.append(feat); _y.append(idx)
                            except Exception:
                                pass
                            _done += 1
                            if _done % 50 == 0 or _done == _n:
                                _prog(_done)
                return _X, _y

            # ── Разбивка и извлечение ─────────────────────────────────────────
            import random as _rng

            if split_mode == 'no_leakage':
                # Стратифицированный сплит: копии балансировки (output_*) только в train
                train_tasks, val_tasks = [], []
                for class_idx, cls in enumerate(classes):
                    files = list(all_files_map[cls])
                    # Разделяем оригиналы и копии от балансировки
                    originals = [f for f in files if not f.startswith('output_')]
                    copies    = [f for f in files if f.startswith('output_')]
                    # Если оригиналов нет — считаем все файлы оригиналами
                    if not originals:
                        originals, copies = files, []
                    _rng.shuffle(originals)
                    n_tr = max(1, int(0.8 * len(originals)))
                    for f in originals[:n_tr]:
                        train_tasks.append((os.path.join(dataset_path, cls, f), class_idx))
                    for f in originals[n_tr:]:
                        val_tasks.append((os.path.join(dataset_path, cls, f), class_idx))
                    # Все копии — только в train
                    for f in copies:
                        train_tasks.append((os.path.join(dataset_path, cls, f), class_idx))
                on_msg({'type': 'train_log',
                        'text': f'Без утечки: {len(train_tasks)} трен / {len(val_tasks)} вал '
                                f'(вал только оригиналы, копии балансировки → train)'})
                X_tr, y_tr   = _do_extract(train_tasks, augment,  'Трен')
                X_val, y_val = _do_extract(val_tasks,   False,     'Вал')
                if not X_tr:
                    on_msg({'type': 'train_error', 'text': 'Не удалось извлечь признаки'}); return
                y_for_weights = y_tr
                total_samples = len(X_tr) + len(X_val)
            else:
                # Стандартный: все файлы → random_split
                all_tasks = [
                    (os.path.join(dataset_path, cls, fname), class_idx)
                    for class_idx, cls in enumerate(classes)
                    for fname in all_files_map[cls]
                ]
                X_tr, y_tr = _do_extract(all_tasks, augment, 'MFCC')
                if not X_tr:
                    on_msg({'type': 'train_error', 'text': 'Не удалось извлечь признаки'}); return
                tr_size = int(0.8 * len(X_tr))
                idx_all = list(range(len(X_tr)))
                _rng.shuffle(idx_all)
                tr_idx, val_idx = idx_all[:tr_size], idx_all[tr_size:]
                X_val = [X_tr[i] for i in val_idx]; y_val = [y_tr[i] for i in val_idx]
                X_tr  = [X_tr[i] for i in tr_idx];  y_tr  = [y_tr[i] for i in tr_idx]
                y_for_weights = y_tr + y_val
                total_samples = len(X_tr) + len(X_val)

            # ── Веса классов ──────────────────────────────────────────────────
            counts  = [y_for_weights.count(i) for i in range(len(classes))]
            max_cnt = max(counts) if counts else 1
            weights = [max_cnt / c if c > 0 else 1.0 for c in counts]
            for i, cls in enumerate(classes):
                if cls in class_weight_overrides:
                    weights[i] *= float(class_weight_overrides[cls])
            on_msg({'type': 'train_log', 'text': f'Загружено {total_samples} образцов '
                    f'(трен {len(X_tr)} · вал {len(X_val)})'})
            on_msg({'type': 'train_log', 'text': 'Веса классов: ' + ', '.join(
                f'{classes[i]}={weights[i]:.1f}x' for i in range(len(classes)))})

            # ── Датасеты ─────────────────────────────────────────────────────
            class _DS(Dataset):
                def __init__(self, Xd, yd): self.X = Xd; self.Y = yd
                def __getitem__(self, i):
                    return torch.tensor(self.X[i]).unsqueeze(0), torch.tensor(self.Y[i])
                def __len__(self): return len(self.X)

            tr_ds = _DS(X_tr, y_tr)
            ts_ds = _DS(X_val, y_val)

            tr_loader = DataLoader(tr_ds, batch_size=batch_size, shuffle=True,  num_workers=0)
            ts_loader = DataLoader(ts_ds, batch_size=batch_size, shuffle=False, num_workers=0)

            # ── Модель ────────────────────────────────────────────
            from engine import DiagnosticEngine
            model  = DiagnosticEngine()._build_cnn(len(classes))
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            model.to(device)

            # Взвешенная функция потерь — штрафует за ошибки на редких классах сильнее
            class_weights_t = torch.tensor(weights, dtype=torch.float32).to(device)
            criterion = nn.CrossEntropyLoss(weight=class_weights_t)
            optimizer = optim.Adam(model.parameters(), lr=lr)
            scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

            on_msg({'type': 'train_started', 'epochs': epochs, 'classes': classes,
                    'samples': total_samples, 'device': str(device)})

            best_acc  = 0.0
            build_dir = Path(__file__).parent.parent
            models_dir = build_dir / 'models'
            models_dir.mkdir(exist_ok=True)
            safe_name = (model_name.strip() or 'model').replace(' ', '_')
            out_path  = models_dir / f'{safe_name}.pth'
            # также копируем как дефолтную чтобы не сломать текущую логику
            default_path = build_dir / 'fault_diagnosis_model_best.pth'

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
                    torch.save(model.state_dict(), default_path)

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
            (models_dir / f'{safe_name}_classes.json').write_text(
                json.dumps(classes, ensure_ascii=False), encoding='utf-8'
            )

            on_msg({
                'type':       'train_complete',
                'classes':    classes,
                'best_acc':   round(best_acc, 4),
                'model':      str(out_path),
                'model_name': safe_name,
            })

        except Exception as e:
            import traceback
            on_msg({'type': 'train_error', 'text': str(e), 'trace': traceback.format_exc()})
