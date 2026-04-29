#!/usr/bin/env python3
"""Система звуковой диагностики автомобиля v3.0"""

import sys, math, random, os, json
from collections import deque

from PyQt6.QtWidgets import *
from PyQt6.QtCore import *
from PyQt6.QtGui import *

try:
    import numpy as np
    import librosa
    import sounddevice as sd
    import torch
    import torch.nn as nn
    HAS_BACKEND = True
except ImportError as _e:
    HAS_BACKEND = False
    _MISSING = str(_e)

# ── Цвета ─────────────────────────────────────────────────────────────────────
BG     = "#0C1120"
CARD   = "#111827"
CARD2  = "#1A2235"
BORDER = "#1E2D45"
ACCENT = "#3B82F6"
TEXT   = "#E2E8F0"
MUTED  = "#64748B"
RED    = "#EF4444"
ORANGE = "#F59E0B"
BLUE_C = "#60A5FA"
PURPLE = "#A855F7"
GREEN  = "#22C55E"

SOURCE_NAMES = [
    "Двигатель",
    "Ремень / Навесное оборудование",
    "Впускная система",
    "Выхлопная система",
]
SOURCE_COLORS = [RED, ORANGE, BLUE_C, PURPLE]

# Как каждый класс влияет на источники (веса 0-1)
# Порядок: Двигатель, Ремень, Впускная, Выхлопная
FAULT_WEIGHTS = {
    'НОРМА':   [0.03, 0.03, 0.02, 0.02],
    'ДРЕБЕЗГ': [0.20, 0.70, 0.05, 0.40],
    'СВИСТ':   [0.10, 0.60, 0.50, 0.10],
    'СКРИП':   [0.30, 0.35, 0.10, 0.50],
    'СТУК':    [0.90, 0.20, 0.05, 0.10],
}

SEVERITY_LABELS = [
    (0.70, "Высокая вероятность", RED),
    (0.45, "Средняя вероятность", ORANGE),
    (0.00, "Низкая вероятность",  BLUE_C),
]

MODEL_PATHS = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "fault_diagnosis_model_best.pth"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "fault_diagnosis_model.pth"),
    r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model_best.pth",
    r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model.pth",
]
CLASSES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_classes.json")

APP_STYLE = f"""
* {{ font-family: 'Segoe UI', sans-serif; outline: none; }}
QScrollBar:vertical {{ background:{CARD}; width:5px; border-radius:3px; }}
QScrollBar::handle:vertical {{ background:{BORDER}; border-radius:3px; min-height:20px; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height:0; }}
QScrollBar:horizontal {{ height:0; }}
QComboBox {{
    background:{CARD2}; border:1px solid {BORDER}; border-radius:6px;
    padding:5px 26px 5px 10px; color:{TEXT}; font-size:12px;
}}
QComboBox::drop-down {{ width:22px; border:none; }}
QComboBox QAbstractItemView {{
    background:{CARD2}; border:1px solid {BORDER};
    selection-background-color:{ACCENT}; color:{TEXT};
}}
QSlider::groove:horizontal {{ height:4px; background:{BORDER}; border-radius:2px; }}
QSlider::handle:horizontal {{
    background:{ACCENT}; width:14px; height:14px; margin:-5px 0; border-radius:7px;
}}
QSlider::sub-page:horizontal {{ background:{ACCENT}; border-radius:2px; }}
QProgressBar {{ background:{CARD2}; border-radius:2px; border:none; }}
QProgressBar::chunk {{ border-radius:2px; }}
QToolTip {{
    background:{CARD2}; border:1px solid {BORDER}; color:{TEXT};
    padding:4px 8px; border-radius:4px; font-size:12px;
}}
"""

# ── CNN архитектура (та же что в start_pytorch.py) ────────────────────────────
def _build_cnn(n_classes: int):
    if not HAS_BACKEND:
        return None
    class CNN(nn.Module):
        def __init__(self):
            super().__init__()
            self.conv1 = nn.Conv2d(1, 32, 3, padding=1); self.bn1 = nn.BatchNorm2d(32); self.pool1 = nn.MaxPool2d(2)
            self.conv2 = nn.Conv2d(32, 64, 3, padding=1); self.bn2 = nn.BatchNorm2d(64); self.pool2 = nn.MaxPool2d(2)
            self.conv3 = nn.Conv2d(64, 128, 3, padding=1); self.bn3 = nn.BatchNorm2d(128); self.pool3 = nn.MaxPool2d(2)
            self.conv4 = nn.Conv2d(128, 256, 3, padding=1); self.bn4 = nn.BatchNorm2d(256); self.pool4 = nn.MaxPool2d(2)
            self.flatten = nn.Flatten()
            self.dropout = nn.Dropout(0.5)
            self.fc1 = nn.Linear(256 * 1 * 13, 256)
            self.fc2 = nn.Linear(256, 128)
            self.fc3 = nn.Linear(128, n_classes)
            self.relu = nn.ReLU()
        def forward(self, x):
            x = self.relu(self.bn1(self.conv1(x))); x = self.pool1(x)
            x = self.relu(self.bn2(self.conv2(x))); x = self.pool2(x)
            x = self.relu(self.bn3(self.conv3(x))); x = self.pool3(x)
            x = self.relu(self.bn4(self.conv4(x))); x = self.pool4(x)
            x = self.flatten(x); x = self.dropout(x)
            x = self.relu(self.fc1(x)); x = self.dropout(x)
            x = self.relu(self.fc2(x))
            return self.fc3(x)
    return CNN()


# ── Фоновый поток: микрофон + инференс ───────────────────────────────────────
class DiagnosticWorker(QThread):
    waveform_ready    = pyqtSignal(list)   # аудио-сэмплы для осциллограммы
    prediction_ready  = pyqtSignal(dict)   # {class: probability}
    status_changed    = pyqtSignal(str, str)  # (текст, 'ok'|'warn'|'err')

    SR         = 22050
    WINDOW_SEC = 5
    STEP_SEC   = 1.5
    N_MFCC     = 20
    TARGET_T   = 215
    CHUNK_SEC  = 0.05   # 50 мс на чанк

    def __init__(self, parent=None):
        super().__init__(parent)
        self._running   = False
        self._model     = None
        self._device    = None
        self._classes   = []

    # ── Загрузка модели ────────────────────────────────────────
    def load_model(self) -> tuple[bool, str]:
        if not HAS_BACKEND:
            return False, f"Не установлены библиотеки: {_MISSING}"

        # Читаем классы
        if os.path.exists(CLASSES_FILE):
            with open(CLASSES_FILE, encoding="utf-8") as f:
                self._classes = json.load(f)
        else:
            self._classes = ['НОРМА', 'ДРЕБЕЗГ', 'СВИСТ', 'СКРИП', 'СТУК']

        self._device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        for path in MODEL_PATHS:
            if not os.path.exists(path):
                continue
            try:
                state = torch.load(path, map_location=self._device, weights_only=True)
                n = state['fc3.weight'].shape[0]
                if n != len(self._classes):
                    self._classes = [f"Класс {i}" for i in range(n)]
                model = _build_cnn(n)
                model.load_state_dict(state)
                model.to(self._device).eval()
                self._model = model
                return True, f"✓ Модель: {os.path.basename(path)}  |  {n} классов  |  {self._device}"
            except Exception as e:
                continue

        return False, "Модель не найдена — запустите start_pytorch.py"

    # ── MFCC ───────────────────────────────────────────────────
    def _mfcc(self, signal):
        mfcc = librosa.feature.mfcc(y=signal, sr=self.SR, n_mfcc=self.N_MFCC)
        mfcc = (mfcc - mfcc.mean()) / (mfcc.std() + 1e-8)
        if mfcc.shape[1] < self.TARGET_T:
            mfcc = np.pad(mfcc, ((0, 0), (0, self.TARGET_T - mfcc.shape[1])))
        else:
            mfcc = mfcc[:, :self.TARGET_T]
        return mfcc.astype(np.float32)

    # ── Инференс ───────────────────────────────────────────────
    def _predict(self, signal) -> dict:
        x = torch.tensor(self._mfcc(signal)).unsqueeze(0).unsqueeze(0).to(self._device)
        with torch.no_grad():
            probs = torch.softmax(self._model(x), 1).cpu().numpy()[0]
        return dict(zip(self._classes, probs.tolist()))

    # ── Главный цикл потока ────────────────────────────────────
    def run(self):
        self._running = True
        if not HAS_BACKEND:
            self.status_changed.emit("Библиотеки не установлены", "err")
            return

        buf = np.zeros(self.SR * self.WINDOW_SEC, dtype=np.float32)
        chunk = int(self.SR * self.CHUNK_SEC)
        step_samples = int(self.SR * self.STEP_SEC)
        since_predict = 0

        try:
            stream = sd.InputStream(samplerate=self.SR, channels=1,
                                    dtype='float32', blocksize=chunk)
            stream.start()
        except Exception as e:
            self.status_changed.emit(f"Микрофон: {e}", "err")
            return

        self.status_changed.emit("Микрофон подключён", "ok")

        while self._running:
            try:
                data, _ = stream.read(chunk)
                data = data.flatten()

                # Сдвигаем буфер
                buf = np.roll(buf, -len(data))
                buf[-len(data):] = data

                # Осциллограмма (каждые ~50 мс)
                step = max(1, len(data) // 60)
                self.waveform_ready.emit(data[::step].tolist())

                # Инференс каждые STEP_SEC
                since_predict += len(data)
                if self._model and since_predict >= step_samples:
                    since_predict = 0
                    try:
                        result = self._predict(buf.copy())
                        self.prediction_ready.emit(result)
                    except Exception:
                        pass

                QThread.msleep(8)
            except Exception as e:
                self.status_changed.emit(str(e), "err")
                break

        stream.stop(); stream.close()

    def stop(self):
        self._running = False


# ── ToggleSwitch ──────────────────────────────────────────────────────────────
class ToggleSwitch(QWidget):
    toggled = pyqtSignal(bool)
    def __init__(self, checked=True, parent=None):
        super().__init__(parent)
        self._on = checked; self._pos = 1.0 if checked else 0.0
        self.setFixedSize(44, 24); self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._t = QTimer(self, interval=16, timeout=self._step)
    def _step(self):
        t = 1.0 if self._on else 0.0; self._pos += (t - self._pos) * 0.3
        if abs(t - self._pos) < 0.01: self._pos = t; self._t.stop()
        self.update()
    def mousePressEvent(self, _): self._on = not self._on; self._t.start(); self.toggled.emit(self._on)
    def paintEvent(self, _):
        p = QPainter(self); p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(ACCENT if self._on else BORDER))
        p.drawRoundedRect(0, 0, 44, 24, 12, 12)
        p.setBrush(QColor("white")); p.drawEllipse(int(2 + self._pos * 20), 2, 20, 20)


# ── Осциллограмма ─────────────────────────────────────────────────────────────
class WaveformWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(70)
        self._buf = deque([0.0] * 90, maxlen=90)
        self._ph = 0.0; self._active = True; self._real = False
        self._demo_timer = QTimer(self, interval=40, timeout=self._demo_tick)
        self._demo_timer.start()

    def _demo_tick(self):
        if self._real or not self._active: return
        self._ph += 0.13
        v = (0.45*math.sin(self._ph*2.1) + 0.28*math.sin(self._ph*3.7+1.2) +
             0.17*math.sin(self._ph*7.3+0.5) + 0.10*random.gauss(0,1))
        self._buf.append(max(-1.0, min(1.0, v))); self.update()

    def feed_real(self, samples: list):
        for s in samples: self._buf.append(max(-1.0, min(1.0, s)))
        self._real = True; self.update()

    def set_active(self, v: bool):
        self._active = v
        if not v: self._real = False
        self.update()

    def paintEvent(self, _):
        p = QPainter(self); p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height(); mid = h // 2
        buf = list(self._buf); n = len(buf)
        step = w / max(n-1, 1); bw = max(2, int(step)-1)
        for i, val in enumerate(buf):
            x = int(i * step); bh = abs(val) * mid * 0.88
            c = QColor(ACCENT); c.setAlpha(150 + int(90*abs(val)))
            p.fillRect(x, int(mid-bh), bw, int(bh), c)
            c2 = QColor(ACCENT); c2.setAlpha(45 + int(30*abs(val)))
            p.fillRect(x, mid, bw, int(bh*0.55), c2)


# ── Визуализация автомобиля ───────────────────────────────────────────────────
class CarVisualizationWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(300, 220)
        self._phase = 0.0
        self._zone_intensity = [0.5, 0.3, 0.2, 0.1]  # 0-1 для каждой зоны
        self._img = None
        for name in ("car.png", "car.jpg"):
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
            if os.path.exists(path):
                self._img = QPixmap(path); break
        QTimer(self, interval=33, timeout=self._tick).start()

    def _tick(self): self._phase += 0.055; self.update()

    def update_zones(self, intensities: list):
        self._zone_intensity = [min(1.0, max(0.0, v)) for v in intensities]

    def _dots(self, w, h):
        cx, cy = w//2, h//2
        return [
            (cx-115, cy+5,  SOURCE_COLORS[0]),
            (cx-35,  cy+18, SOURCE_COLORS[1]),
            (cx-140, cy-18, SOURCE_COLORS[2]),
            (cx+115, cy+22, SOURCE_COLORS[3]),
        ]

    def paintEvent(self, _):
        p = QPainter(self); p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        grad = QRadialGradient(w*0.5, h*0.45, max(w,h)*0.6)
        grad.setColorAt(0, QColor("#1a2540")); grad.setColorAt(1, QColor(CARD))
        p.fillRect(0, 0, w, h, QBrush(grad))

        if self._img and not self._img.isNull():
            sc = self._img.scaled(w-16, h-16, Qt.AspectRatioMode.KeepAspectRatio,
                                  Qt.TransformationMode.SmoothTransformation)
            p.drawPixmap((w-sc.width())//2, (h-sc.height())//2, sc)
        else:
            self._draw_car(p, w, h)

        for i, (dx, dy, col) in enumerate(self._dots(w, h)):
            intensity = self._zone_intensity[i] if i < len(self._zone_intensity) else 0.3
            pulse = (math.sin(self._phase + i*1.3) + 1) / 2
            rr = int((8 + pulse*16) * (0.5 + intensity*0.5))
            rc = QColor(col); rc.setAlpha(int(90 * (1-pulse) * intensity))
            p.setPen(Qt.PenStyle.NoPen); p.setBrush(rc)
            p.drawEllipse(dx-rr, dy-rr, rr*2, rr*2)
            oc = QColor(col); oc.setAlpha(int(110 * intensity))
            p.setBrush(oc); r = int(10 + intensity*4)
            p.drawEllipse(dx-r, dy-r, r*2, r*2)
            p.setBrush(QColor(col)); p.drawEllipse(dx-6, dy-6, 12, 12)
            p.setBrush(QColor("white")); p.drawEllipse(dx-2, dy-2, 5, 5)

    def _draw_car(self, p, w, h):
        cx, cy = w//2, h//2
        pen = QPen(QColor("#2a3f5f"), 1.5)
        p.setPen(pen); p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(cx-175, cy-28, 350, 78, 20, 20)
        path = QPainterPath()
        path.moveTo(cx-105, cy-28); path.lineTo(cx-68, cy-72)
        path.lineTo(cx+60, cy-72); path.lineTo(cx+100, cy-28)
        path.closeSubpath(); p.drawPath(path)
        p.setPen(QPen(QColor("#1e3a5f"), 1))
        p.drawRoundedRect(cx-100, cy-68, 80, 38, 6, 6)
        p.drawRoundedRect(cx-14, cy-68, 70, 38, 6, 6)
        p.setPen(pen)
        for wx in [cx-120, cx+80]:
            p.drawEllipse(wx-30, cy+38, 60, 60)
            p.setBrush(QColor("#1a2540")); p.drawEllipse(wx-20, cy+48, 40, 40)
            p.setBrush(Qt.BrushStyle.NoBrush)
        p.setPen(QPen(QColor(MUTED), 1)); p.setFont(QFont("Segoe UI", 9))
        p.drawText(QRect(0, h-24, w, 20), Qt.AlignmentFlag.AlignCenter,
                   "Поместите car.png для 3D-визуализации")


# ── Источник звука (обновляемый) ──────────────────────────────────────────────
class SourceItem(QWidget):
    def __init__(self, name, pct, color, parent=None):
        super().__init__(parent)
        self.setFixedHeight(46); self._color = color
        lay = QVBoxLayout(self); lay.setContentsMargins(0,4,0,4); lay.setSpacing(5)
        top = QHBoxLayout(); top.setSpacing(8)
        dot = QLabel(); dot.setFixedSize(9,9)
        dot.setStyleSheet(f"background:{color}; border-radius:5px;")
        nm = QLabel(name); nm.setStyleSheet(f"color:{TEXT}; font-size:12px;")
        nm.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self._pct = QLabel(f"{pct}%"); self._pct.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:600;")
        top.addWidget(dot); top.addWidget(nm,1); top.addWidget(self._pct)
        self._bar = QProgressBar(); self._bar.setRange(0,100); self._bar.setValue(pct)
        self._bar.setFixedHeight(4); self._bar.setTextVisible(False)
        self._bar.setStyleSheet(f"QProgressBar::chunk {{ background:{color}; border-radius:2px; }}")
        lay.addLayout(top); lay.addWidget(self._bar)

    def set_value(self, pct: int):
        pct = max(0, min(100, int(pct)))
        self._pct.setText(f"{pct}%"); self._bar.setValue(pct)


# ── Элемент диагностики (обновляемый) ────────────────────────────────────────
class DiagnosisItem(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{CARD2}; border-radius:8px;")
        self.setMinimumHeight(56)
        lay = QHBoxLayout(self); lay.setContentsMargins(14,10,14,10); lay.setSpacing(12)
        self._dot = QLabel(); self._dot.setFixedSize(9,9)
        self._dot.setStyleSheet(f"background:{MUTED}; border-radius:5px;")
        vd = QVBoxLayout(); vd.addSpacing(3); vd.addWidget(self._dot); vd.addStretch()
        lay.addLayout(vd)
        vc = QVBoxLayout(); vc.setSpacing(3)
        self._title = QLabel("—"); self._title.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:500;")
        self._sub   = QLabel(""); self._sub.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        vc.addWidget(self._title); vc.addWidget(self._sub)
        lay.addLayout(vc, 1)
        self._sev = QLabel(""); self._sev.setStyleSheet(f"color:{MUTED}; font-size:11px; font-weight:500;")
        self._sev.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self._sev.setFixedWidth(120); lay.addWidget(self._sev)

    def update_data(self, title: str, sub: str, sev: str, color: str):
        self._dot.setStyleSheet(f"background:{color}; border-radius:5px;")
        self._title.setText(title); self._sub.setText(sub)
        self._sev.setText(sev); self._sev.setStyleSheet(f"color:{color}; font-size:11px; font-weight:500;")


# ── LabeledSlider ─────────────────────────────────────────────────────────────
class LabeledSlider(QWidget):
    def __init__(self, label, desc, lo, hi, val, dec=2, parent=None):
        super().__init__(parent)
        sc = 10**dec; lay = QVBoxLayout(self)
        lay.setContentsMargins(0,5,0,5); lay.setSpacing(4)
        row = QHBoxLayout()
        lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
        lb.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        vl = QLabel(f"{val:.{dec}f}"); vl.setFixedWidth(46)
        vl.setStyleSheet(f"color:{TEXT}; font-size:11px; font-weight:600;"
                         f"background:{CARD}; padding:1px 7px; border-radius:4px;"
                         f"border:1px solid {BORDER};")
        vl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        row.addWidget(lb); row.addWidget(vl)
        sl = QSlider(Qt.Orientation.Horizontal)
        sl.setRange(int(lo*sc), int(hi*sc)); sl.setValue(int(val*sc))
        sl.valueChanged.connect(lambda v: vl.setText(f"{v/sc:.{dec}f}"))
        lay.addLayout(row); lay.addWidget(sl)
        if desc:
            d = QLabel(desc); d.setStyleSheet(f"color:{MUTED}; font-size:10px;")
            d.setWordWrap(True); lay.addWidget(d)


# ── Helpers settings ──────────────────────────────────────────────────────────
def _sep():
    f = QFrame(); f.setFixedHeight(1)
    f.setStyleSheet(f"background:{BORDER}; margin:4px 0;"); return f

def _section(txt):
    l = QLabel(txt)
    l.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600; padding-top:8px;")
    return l

def _combo_row(label, opts, idx=0):
    w = QWidget(); r = QHBoxLayout(w); r.setContentsMargins(0,2,0,2)
    lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
    lb.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
    cb = QComboBox(); cb.addItems(opts); cb.setCurrentIndex(idx); cb.setFixedWidth(170)
    r.addWidget(lb); r.addWidget(cb); return w

def _toggle_row(label, checked=True):
    w = QWidget(); r = QHBoxLayout(w); r.setContentsMargins(0,2,0,2)
    lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
    tg = ToggleSwitch(checked); r.addWidget(lb); r.addStretch(); r.addWidget(tg); return w


# ── Панель настроек ───────────────────────────────────────────────────────────
class SettingsPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(350); self.setStyleSheet(f"background:{CARD};")
        root = QVBoxLayout(self); root.setContentsMargins(18,14,18,14); root.setSpacing(0)
        title = QLabel("Настройки"); title.setStyleSheet(f"color:{TEXT}; font-size:17px; font-weight:700;")
        root.addWidget(title); root.addSpacing(12)
        self._tab_btns = []
        tabs_row = QHBoxLayout(); tabs_row.setSpacing(0)
        for i, name in enumerate(["Общие","Нейросеть","Аудио","Визуализация"]):
            b = QPushButton(name); b.setCheckable(True); b.setChecked(i==1)
            b.setStyleSheet(f"""
                QPushButton {{ background:transparent; color:{MUTED}; font-size:11px;
                    padding:5px 6px; border-radius:0; border-bottom:2px solid transparent; }}
                QPushButton:checked {{ color:{ACCENT}; border-bottom:2px solid {ACCENT}; }}
                QPushButton:hover:!checked {{ color:{TEXT}; }}
            """)
            b.clicked.connect(lambda _, idx=i: self._switch(idx))
            self._tab_btns.append(b); tabs_row.addWidget(b)
        tabs_row.addStretch(); root.addLayout(tabs_row)
        sep = QFrame(); sep.setFixedHeight(1); sep.setStyleSheet(f"background:{BORDER};")
        root.addWidget(sep); root.addSpacing(8)
        self._stack = QStackedWidget()
        self._stack.addWidget(self._page_general())
        self._stack.addWidget(self._page_neural())
        self._stack.addWidget(self._page_audio())
        self._stack.addWidget(self._page_visual())
        self._stack.setCurrentIndex(1); root.addWidget(self._stack, 1)

    def _switch(self, idx):
        for i, b in enumerate(self._tab_btns): b.setChecked(i==idx)
        self._stack.setCurrentIndex(idx)

    def _scrolled(self, fn):
        scroll = QScrollArea(); scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("background:transparent;")
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        c = QWidget(); c.setStyleSheet("background:transparent;"); c.setMaximumWidth(310)
        lay = QVBoxLayout(c); lay.setContentsMargins(0,0,4,0); lay.setSpacing(2)
        fn(lay); lay.addStretch(); scroll.setWidget(c); return scroll

    def _page_neural(self):
        def build(lay):
            lay.addWidget(_section("Параметры модели"))
            lay.addWidget(_combo_row("Модель", ["SoundNet Automotive v2.3","SoundNet Automotive v2.0","CustomCNN v1.0"]))
            lay.addWidget(LabeledSlider("Размер входного окна (сек)","Длина аудиофрагмента, анализируемого нейросетью",1,10,5.0,1))
            lay.addWidget(LabeledSlider("Шаг анализа (сек)","Интервал между последовательными анализами",0.1,5,1.5,1))
            lay.addWidget(LabeledSlider("Порог уверенности","Минимальная уверенность для отображения результата",0,1,0.60))
            lay.addWidget(_combo_row("Максимум источников звука",["1","2","3","4","5"],3))
            lay.addWidget(_sep())
            lay.addWidget(_section("Архитектура модели"))
            lay.addWidget(_combo_row("Тип модели",["CNN + Transformer","CNN","Transformer","ResNet"]))
            lay.addWidget(_combo_row("Количество слоёв",["8","12","16","24"],1))
            lay.addWidget(_combo_row("Размер скрытого слоя",["256","512","1024"],1))
            lay.addWidget(_combo_row("Функция активации",["GELU","ReLU","SiLU"]))
            lay.addWidget(LabeledSlider("Dropout","",0,1,0.30))
            lay.addWidget(_sep())
            lay.addWidget(_section("Обучение и данные"))
            lay.addWidget(_combo_row("Набор данных",["AutoSounds Dataset v1.4","Custom Dataset"]))
            lay.addWidget(_toggle_row("Аугментация данных",True))
            lay.addSpacing(10)
            rb = QPushButton("Сбросить настройки модели  ↺")
            rb.setStyleSheet(f"""QPushButton {{ background:transparent; color:{ACCENT};
                border:1px solid {ACCENT}; border-radius:6px; padding:8px; font-size:12px; }}
                QPushButton:hover {{ background:{ACCENT}22; }}""")
            lay.addWidget(rb)
        return self._scrolled(build)

    def _page_general(self):
        def build(lay):
            lay.addWidget(_section("Общие настройки"))
            lay.addWidget(_toggle_row("Автозапуск диагностики",False))
            lay.addWidget(_toggle_row("Уведомления",True))
            lay.addWidget(_combo_row("Язык",["Русский","English"]))
        return self._scrolled(build)

    def _page_audio(self):
        def build(lay):
            lay.addWidget(_section("Параметры аудио"))
            lay.addWidget(LabeledSlider("Частота дискретизации (кГц)","",8,48,22,0))
            lay.addWidget(LabeledSlider("Размер буфера","",512,4096,1024,0))
            lay.addWidget(LabeledSlider("Усиление микрофона","",0,100,70,0))
            lay.addWidget(_combo_row("Устройство ввода",["Микрофон по умолчанию"]))
        return self._scrolled(build)

    def _page_visual(self):
        def build(lay):
            lay.addWidget(_section("Визуализация"))
            lay.addWidget(_toggle_row("Показывать 3D модель",True))
            lay.addWidget(_toggle_row("Анимация точек",True))
            lay.addWidget(_toggle_row("Тёмная тема",True))
            lay.addWidget(_combo_row("Цветовая схема",["По умолчанию","Синяя","Зелёная"]))
        return self._scrolled(build)


# ── История ───────────────────────────────────────────────────────────────────
class HistoryPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{BG};")
        lay = QVBoxLayout(self); lay.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lb = QLabel("История диагностик"); lb.setStyleSheet(f"color:{MUTED}; font-size:16px;")
        lay.addWidget(lb)


# ── Страница диагностики ──────────────────────────────────────────────────────
class DiagnosticsPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{BG};")
        root = QVBoxLayout(self); root.setContentsMargins(12,10,12,10); root.setSpacing(8)

        # ── Верх: источники + машина ──────────────────────────
        top = QHBoxLayout(); top.setSpacing(8)

        src_card = self._card(); src_card.setFixedWidth(210)
        sl = QVBoxLayout(src_card); sl.setContentsMargins(14,12,14,12); sl.setSpacing(0)
        hdr = QHBoxLayout()
        t = QLabel("Источник звуков"); t.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600;")
        info = QPushButton("ⓘ"); info.setFixedSize(18,18)
        info.setStyleSheet(f"color:{MUTED}; background:transparent; font-size:11px;")
        hdr.addWidget(t); hdr.addWidget(info); hdr.addStretch()
        sl.addLayout(hdr); sl.addSpacing(10)

        self._source_items = []
        for name, color in zip(SOURCE_NAMES, SOURCE_COLORS):
            item = SourceItem(name, 0, color)
            self._source_items.append(item); sl.addWidget(item)

        sl.addSpacing(10)
        sb = QPushButton("Показать все зоны  👁")
        sb.setStyleSheet(f"""QPushButton {{ background:{CARD2}; color:{ACCENT};
            border:1px solid {BORDER}; border-radius:6px; padding:5px 10px; font-size:11px; }}
            QPushButton:hover {{ background:{ACCENT}22; }}""")
        sl.addWidget(sb)
        top.addWidget(src_card)

        car_w = QWidget(); car_w.setStyleSheet("background:transparent;")
        cwl = QVBoxLayout(car_w); cwl.setContentsMargins(0,0,0,0); cwl.setSpacing(4)
        btn_row = QHBoxLayout(); btn_row.addStretch()
        for icon, tip in [("🚗","Вид сбоку"),("3D","3D вид"),("↻","Сброс")]:
            b = QPushButton(icon); b.setFixedSize(30,28); b.setToolTip(tip)
            b.setStyleSheet(f"""QPushButton {{ background:{CARD2}; border:1px solid {BORDER};
                border-radius:6px; font-size:11px; color:{TEXT}; }}
                QPushButton:hover {{ background:{BORDER}; }}""")
            btn_row.addWidget(b)
        cwl.addLayout(btn_row)
        self.car_widget = CarVisualizationWidget()
        cwl.addWidget(self.car_widget, 1)
        top.addWidget(car_w, 1)
        root.addLayout(top, 1)

        # ── Низ: осциллограмма + анализ ───────────────────────
        bot = QHBoxLayout(); bot.setSpacing(8)

        wave_c = self._card(); wave_c.setFixedWidth(240)
        wl = QVBoxLayout(wave_c); wl.setContentsMargins(12,10,12,10); wl.setSpacing(6)
        wr = QHBoxLayout()
        wt = QLabel("Запись звука"); wt.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:500;")
        self._time_lbl = QLabel("00:00:00"); self._time_lbl.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        wr.addWidget(wt); wr.addStretch(); wr.addWidget(self._time_lbl)
        wl.addLayout(wr)
        self.waveform = WaveformWidget(); wl.addWidget(self.waveform, 1)
        mr = QHBoxLayout()
        ml = QLabel("Чувствительность микрофона"); ml.setStyleSheet(f"color:{MUTED}; font-size:10px;")
        self._mic_pct = QLabel("70%"); self._mic_pct.setStyleSheet(f"color:{TEXT}; font-size:10px;")
        mr.addWidget(ml); mr.addStretch(); mr.addWidget(self._mic_pct)
        wl.addLayout(mr)
        mic_sl = QSlider(Qt.Orientation.Horizontal); mic_sl.setRange(0,100); mic_sl.setValue(70)
        mic_sl.valueChanged.connect(lambda v: self._mic_pct.setText(f"{v}%"))
        wl.addWidget(mic_sl); bot.addWidget(wave_c)

        an_c = self._card()
        al = QVBoxLayout(an_c); al.setContentsMargins(14,10,14,10); al.setSpacing(6)
        at = QLabel("Предварительный анализ"); at.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600;")
        al.addWidget(at)
        self._diag_items = [DiagnosisItem() for _ in range(3)]
        for d in self._diag_items: al.addWidget(d)
        self._note = QLabel("Важно: Данная диагностика является предварительной "
                            "и не заменяет профессионального осмотра.")
        self._note.setWordWrap(True)
        self._note.setStyleSheet(f"color:{MUTED}; font-size:10px; padding-top:2px;")
        al.addWidget(self._note)
        bot.addWidget(an_c, 1)
        root.addLayout(bot, 0)

        # Начальное состояние
        self._reset_display()

    def _card(self):
        f = QFrame()
        f.setStyleSheet(f"QFrame {{ background:{CARD}; border-radius:10px; border:1px solid {BORDER}; }}")
        return f

    def _reset_display(self):
        defaults = [("—", "Ожидание данных...", "—", MUTED)] * 3
        for item, (t, s, sv, c) in zip(self._diag_items, defaults):
            item.update_data(t, s, sv, c)
        for item in self._source_items:
            item.set_value(0)

    # ── Обновление из модели ───────────────────────────────────
    def update_predictions(self, probs: dict):
        """probs: {class_name: probability 0..1}"""
        # Источники через матрицу весов
        source_vals = [0.0] * 4
        for cls, prob in probs.items():
            weights = FAULT_WEIGHTS.get(cls, [0]*4)
            for i, w in enumerate(weights):
                source_vals[i] += prob * w
        for item, val in zip(self._source_items, source_vals):
            item.set_value(int(val * 100))
        self.car_widget.update_zones(source_vals)

        # Диагнозы — топ-3 (без НОРМА если она не доминирует)
        sorted_p = sorted(probs.items(), key=lambda x: x[1], reverse=True)
        shown = [(cls, p) for cls, p in sorted_p if cls != 'НОРМА'][:3]
        if not shown or probs.get('НОРМА', 0) > 0.75:
            shown = [('НОРМА', probs.get('НОРМА', 1.0))]

        subtitles = {
            'НОРМА':   "Оборудование работает штатно",
            'ДРЕБЕЗГ': "Дребезжание деталей кузова или навесного оборудования",
            'СВИСТ':   "Свист ремня, турбины или впускной системы",
            'СКРИП':   "Скрип тормозов, подвески или шестерёнок",
            'СТУК':    "Стук двигателя, подшипников или карданного вала",
        }

        for i, item in enumerate(self._diag_items):
            if i < len(shown):
                cls, prob = shown[i]
                sev_label, sev_color = SEVERITY_LABELS[-1][1], SEVERITY_LABELS[-1][2]
                for threshold, label, color in SEVERITY_LABELS:
                    if prob >= threshold:
                        sev_label, sev_color = label, color; break
                sub = subtitles.get(cls, "")
                item.update_data(cls, sub, f"{sev_label} ({prob:.0%})", sev_color)
                item.setVisible(True)
            else:
                item.setVisible(False)


# ── Левый сайдбар ─────────────────────────────────────────────────────────────
class LeftSidebar(QWidget):
    page_changed = pyqtSignal(int)
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(68); self.setStyleSheet(f"background:{CARD};")
        lay = QVBoxLayout(self); lay.setContentsMargins(0,0,0,0); lay.setSpacing(0)
        logo_w = QWidget(); logo_w.setFixedHeight(54)
        ll = QVBoxLayout(logo_w); ll.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo = QLabel("◉"); logo.setStyleSheet(f"color:{ACCENT}; font-size:22px;")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter); ll.addWidget(logo); lay.addWidget(logo_w)
        self._btns = []
        for i, (icon, label) in enumerate([("📊","Диагностика"),("📋","История"),("⚙","Настройки")]):
            b = QPushButton(f"{icon}\n{label}"); b.setFixedHeight(62)
            b.setCheckable(True); b.setChecked(i==0)
            b.setStyleSheet(f"""QPushButton {{ background:transparent; color:{MUTED}; font-size:9px;
                border-left:3px solid transparent; border-radius:0; padding:8px 4px; }}
                QPushButton:checked {{ color:{ACCENT}; background:{ACCENT}18; border-left:3px solid {ACCENT}; }}
                QPushButton:hover:!checked {{ color:{TEXT}; background:{CARD2}; }}""")
            b.clicked.connect(lambda _, idx=i: self._select(idx))
            self._btns.append(b); lay.addWidget(b)
        lay.addStretch()
        ab = QPushButton("ℹ\nО программе"); ab.setFixedHeight(62)
        ab.setStyleSheet(f"""QPushButton {{ background:transparent; color:{MUTED};
            font-size:9px; border:none; padding:8px 4px; }}
            QPushButton:hover {{ color:{TEXT}; background:{CARD2}; }}""")
        lay.addWidget(ab); lay.addSpacing(6)

    def _select(self, idx):
        for i, b in enumerate(self._btns): b.setChecked(i==idx)
        self.page_changed.emit(idx)


# ── Главное окно ──────────────────────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Диагностика по звуку v3.0")
        self.setMinimumSize(1100, 680); self.resize(1360, 800)
        self._recording = False; self._elapsed = 0
        self._worker: DiagnosticWorker | None = None

        central = QWidget(); central.setStyleSheet(f"background:{BG};")
        self.setCentralWidget(central)
        root = QHBoxLayout(central); root.setContentsMargins(0,0,0,0); root.setSpacing(0)

        self._sidebar = LeftSidebar()
        self._sidebar.page_changed.connect(self._on_nav)
        root.addWidget(self._sidebar)

        vsep = QFrame(); vsep.setFixedWidth(1); vsep.setStyleSheet(f"background:{BORDER};")
        root.addWidget(vsep)

        main_col = QVBoxLayout(); main_col.setContentsMargins(0,0,0,0); main_col.setSpacing(0)
        main_col.addWidget(self._build_header())

        content_row = QHBoxLayout(); content_row.setContentsMargins(0,0,0,0); content_row.setSpacing(0)
        self._stack = QStackedWidget()
        self._diag = DiagnosticsPage()
        self._hist = HistoryPage()
        self._stack.addWidget(self._diag); self._stack.addWidget(self._hist)
        content_row.addWidget(self._stack, 1)

        self._rsep = QFrame(); self._rsep.setFixedWidth(1); self._rsep.setStyleSheet(f"background:{BORDER};")
        content_row.addWidget(self._rsep)
        self._settings = SettingsPanel(); content_row.addWidget(self._settings)
        main_col.addLayout(content_row, 1)
        root.addLayout(main_col, 1)

        self._clock = QTimer(self, interval=1000, timeout=self._tick_clock)

        # Загрузка модели при старте
        QTimer.singleShot(300, self._init_backend)

    # ── Хедер ─────────────────────────────────────────────────
    def _build_header(self):
        hdr = QWidget(); hdr.setFixedHeight(50)
        hdr.setStyleSheet(f"background:{CARD}; border-bottom:1px solid {BORDER};")
        lay = QHBoxLayout(hdr); lay.setContentsMargins(16,0,16,0); lay.setSpacing(12)
        title = QLabel("Диагностика по звуку")
        title.setStyleSheet(f"color:{TEXT}; font-size:15px; font-weight:700;")
        lay.addWidget(title); lay.addStretch()

        # Статус бейдж
        self._status_w = QWidget()
        self._status_w.setStyleSheet(f"background:{CARD2}; border:1px solid {BORDER}; border-radius:14px;")
        sl = QHBoxLayout(self._status_w); sl.setContentsMargins(10,3,12,3); sl.setSpacing(6)
        self._status_dot = QLabel("●"); self._status_dot.setStyleSheet(f"color:{ORANGE}; font-size:9px;")
        sl.addWidget(self._status_dot)
        vc = QVBoxLayout(); vc.setSpacing(0)
        self._status_top = QLabel("Инициализация..."); self._status_top.setStyleSheet(f"color:{TEXT}; font-size:11px; font-weight:600;")
        self._status_bot = QLabel("Загрузка модели"); self._status_bot.setStyleSheet(f"color:{MUTED}; font-size:10px;")
        vc.addWidget(self._status_top); vc.addWidget(self._status_bot)
        sl.addLayout(vc); lay.addWidget(self._status_w)

        self._rec_btn = QPushButton("▶  Начать запись")
        self._rec_btn.setEnabled(False)
        self._rec_btn.setStyleSheet(self._rec_style(False))
        self._rec_btn.clicked.connect(self._toggle_rec)
        lay.addWidget(self._rec_btn)

        gear = QPushButton("⚙"); gear.setFixedSize(34,34)
        gear.setStyleSheet(f"""QPushButton {{ background:{CARD2}; border:1px solid {BORDER};
            border-radius:6px; font-size:15px; color:{MUTED}; }}
            QPushButton:hover {{ color:{TEXT}; background:{BORDER}; }}""")
        gear.clicked.connect(self._toggle_settings)
        lay.addWidget(gear)
        return hdr

    def _rec_style(self, on):
        if on:
            return (f"QPushButton {{ background:{RED}; color:white; border-radius:6px;"
                    f" padding:6px 14px; font-size:12px; font-weight:600; }}"
                    f"QPushButton:hover {{ background:#DC2626; }}")
        else:
            return (f"QPushButton {{ background:{GREEN}; color:white; border-radius:6px;"
                    f" padding:6px 14px; font-size:12px; font-weight:600; }}"
                    f"QPushButton:hover {{ background:#16A34A; }}"
                    f"QPushButton:disabled {{ background:{BORDER}; color:{MUTED}; }}")

    # ── Инициализация бэкенда ──────────────────────────────────
    def _init_backend(self):
        self._worker = DiagnosticWorker(self)
        ok, msg = self._worker.load_model()

        if ok:
            self._status_dot.setStyleSheet(f"color:{GREEN}; font-size:9px;")
            self._status_top.setText("Модель загружена")
            self._status_bot.setText(msg)
            self._rec_btn.setEnabled(True)
        else:
            self._status_dot.setStyleSheet(f"color:{ORANGE}; font-size:9px;")
            self._status_top.setText("Без модели")
            self._status_bot.setText("Только запись звука")
            self._rec_btn.setEnabled(True)  # разрешаем записывать без модели

        self._worker.waveform_ready.connect(self._diag.waveform.feed_real)
        self._worker.prediction_ready.connect(self._diag.update_predictions)
        self._worker.status_changed.connect(self._on_worker_status)

    def _on_worker_status(self, msg: str, level: str):
        colors = {'ok': GREEN, 'warn': ORANGE, 'err': RED}
        self._status_dot.setStyleSheet(f"color:{colors.get(level, MUTED)}; font-size:9px;")
        self._status_bot.setText(msg)

    # ── Запись ────────────────────────────────────────────────
    def _toggle_rec(self):
        if not self._recording:
            self._start_rec()
        else:
            self._stop_rec()

    def _start_rec(self):
        self._recording = True
        self._rec_btn.setText("⏹  Остановить запись")
        self._rec_btn.setStyleSheet(self._rec_style(True))
        self._status_dot.setStyleSheet(f"color:{GREEN}; font-size:9px;")
        self._status_top.setText("Запись идёт...")
        self._clock.start()
        if self._worker:
            self._worker.start()

    def _stop_rec(self):
        self._recording = False
        self._rec_btn.setText("▶  Начать запись")
        self._rec_btn.setStyleSheet(self._rec_style(False))
        self._status_top.setText("Остановлено")
        self._clock.stop()
        self._diag.waveform.set_active(False)
        if self._worker and self._worker.isRunning():
            self._worker.stop(); self._worker.wait(3000)

    def _toggle_settings(self):
        vis = self._settings.isVisible()
        self._settings.setVisible(not vis); self._rsep.setVisible(not vis)

    def _on_nav(self, idx):
        if idx == 2: self._toggle_settings()
        else: self._stack.setCurrentIndex(idx)

    def _tick_clock(self):
        self._elapsed += 1
        s = self._elapsed % 60; m = (self._elapsed // 60) % 60; h = self._elapsed // 3600
        self._diag._time_lbl.setText(f"{h:02d}:{m:02d}:{s:02d}")

    def closeEvent(self, e):
        if self._worker and self._worker.isRunning():
            self._worker.stop(); self._worker.wait(3000)
        super().closeEvent(e)


# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyleSheet(APP_STYLE)
    pal = QPalette()
    pal.setColor(QPalette.ColorRole.Window,          QColor(BG))
    pal.setColor(QPalette.ColorRole.WindowText,      QColor(TEXT))
    pal.setColor(QPalette.ColorRole.Base,            QColor(CARD))
    pal.setColor(QPalette.ColorRole.AlternateBase,   QColor(CARD2))
    pal.setColor(QPalette.ColorRole.Text,            QColor(TEXT))
    pal.setColor(QPalette.ColorRole.Button,          QColor(CARD2))
    pal.setColor(QPalette.ColorRole.ButtonText,      QColor(TEXT))
    pal.setColor(QPalette.ColorRole.Highlight,       QColor(ACCENT))
    pal.setColor(QPalette.ColorRole.HighlightedText, QColor("white"))
    app.setPalette(pal)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
