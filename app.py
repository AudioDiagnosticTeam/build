#!/usr/bin/env python3
"""Система звуковой диагностики автомобиля v3.0"""

import sys, math, random, os
from PyQt6.QtWidgets import *
from PyQt6.QtCore import *
from PyQt6.QtGui import *

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

SOURCES_DATA = [
    ("Двигатель",                      78, RED),
    ("Ремень / Навесное оборудование",  45, ORANGE),
    ("Впускная система",               25, BLUE_C),
    ("Выхлопная система",              15, PURPLE),
]
DIAGNOSES_DATA = [
    ("Возможная проблема в двигателе",
     "Характерные звуки стука или детонации",
     "Высокая вероятность", RED),
    ("Износ приводного ремня / ролика",
     "Свист или скрежет при работе",
     "Средняя вероятность", ORANGE),
    ("Подсос воздуха во впускной системе",
     "Шипение или свистящий звук",
     "Низкая вероятность", BLUE_C),
]

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

# ── ToggleSwitch ──────────────────────────────────────────────────────────────
class ToggleSwitch(QWidget):
    toggled = pyqtSignal(bool)

    def __init__(self, checked=True, parent=None):
        super().__init__(parent)
        self._on = checked
        self._pos = 1.0 if checked else 0.0
        self.setFixedSize(44, 24)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._t = QTimer(self, interval=16, timeout=self._step)

    def _step(self):
        target = 1.0 if self._on else 0.0
        self._pos += (target - self._pos) * 0.3
        if abs(target - self._pos) < 0.01:
            self._pos = target; self._t.stop()
        self.update()

    def mousePressEvent(self, _):
        self._on = not self._on; self._t.start(); self.toggled.emit(self._on)

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(ACCENT if self._on else BORDER))
        p.drawRoundedRect(0, 0, 44, 24, 12, 12)
        p.setBrush(QColor("white"))
        p.drawEllipse(int(2 + self._pos * 20), 2, 20, 20)


# ── Waveform ──────────────────────────────────────────────────────────────────
class WaveformWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(70)
        self._buf = [0.0] * 90
        self._ph = 0.0
        self._active = True
        QTimer(self, interval=40, timeout=self._tick).start()

    def _tick(self):
        if not self._active: return
        self._ph += 0.13
        v = (0.45 * math.sin(self._ph * 2.1) +
             0.28 * math.sin(self._ph * 3.7 + 1.2) +
             0.17 * math.sin(self._ph * 7.3 + 0.5) +
             0.10 * random.gauss(0, 1))
        self._buf.pop(0)
        self._buf.append(max(-1.0, min(1.0, v)))
        self.update()

    def set_active(self, v: bool):
        self._active = v; self.update()

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        mid = h // 2
        n = len(self._buf)
        step = w / max(n - 1, 1)
        bw = max(2, int(step) - 1)
        for i, val in enumerate(self._buf):
            x = int(i * step)
            bh = abs(val) * mid * 0.88
            c = QColor(ACCENT); c.setAlpha(150 + int(90 * abs(val)))
            p.fillRect(x, int(mid - bh), bw, int(bh), c)
            c2 = QColor(ACCENT); c2.setAlpha(45 + int(30 * abs(val)))
            p.fillRect(x, mid, bw, int(bh * 0.55), c2)


# ── Car visualization ─────────────────────────────────────────────────────────
class CarVisualizationWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(300, 220)
        self._phase = 0.0
        self._img = None
        for name in ("car.png", "car.jpg"):
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
            if os.path.exists(path):
                self._img = QPixmap(path); break
        QTimer(self, interval=33, timeout=self._tick).start()

    def _tick(self):
        self._phase += 0.055; self.update()

    def _dot_positions(self, w, h):
        cx, cy = w // 2, h // 2
        return [
            (cx - 115, cy + 5,  RED,    "Двигатель", 78),
            (cx - 35,  cy + 18, ORANGE, "Ремень",    45),
            (cx - 140, cy - 18, BLUE_C, "Впускная",  25),
            (cx + 115, cy + 22, PURPLE, "Выхлоп",    15),
        ]

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # Background gradient
        grad = QRadialGradient(w * 0.5, h * 0.45, max(w, h) * 0.6)
        grad.setColorAt(0, QColor("#1a2540"))
        grad.setColorAt(1, QColor(CARD))
        p.fillRect(0, 0, w, h, QBrush(grad))

        if self._img and not self._img.isNull():
            sc = self._img.scaled(w - 16, h - 16,
                                  Qt.AspectRatioMode.KeepAspectRatio,
                                  Qt.TransformationMode.SmoothTransformation)
            p.drawPixmap((w - sc.width()) // 2, (h - sc.height()) // 2, sc)
        else:
            self._draw_car(p, w, h)

        for dx, dy, col, _, _ in self._dot_positions(w, h):
            pulse = (math.sin(self._phase + dx * 0.03) + 1) / 2
            rr = int(9 + pulse * 17)
            rc = QColor(col); rc.setAlpha(int(80 * (1 - pulse)))
            p.setPen(Qt.PenStyle.NoPen); p.setBrush(rc)
            p.drawEllipse(dx - rr, dy - rr, rr * 2, rr * 2)
            oc = QColor(col); oc.setAlpha(110)
            p.setBrush(oc); p.drawEllipse(dx - 12, dy - 12, 24, 24)
            p.setBrush(QColor(col)); p.drawEllipse(dx - 7, dy - 7, 14, 14)
            p.setBrush(QColor("white")); p.drawEllipse(dx - 3, dy - 3, 6, 6)

    def _draw_car(self, p: QPainter, w: int, h: int):
        cx, cy = w // 2, h // 2
        pen = QPen(QColor("#2a3f5f"), 1.5)
        pen.setStyle(Qt.PenStyle.SolidLine)
        p.setPen(pen); p.setBrush(Qt.BrushStyle.NoBrush)

        body_x, body_y = cx - 175, cy - 28
        body_w, body_h = 350, 78
        p.drawRoundedRect(body_x, body_y, body_w, body_h, 20, 20)

        cabin_path = QPainterPath()
        cabin_path.moveTo(cx - 105, cy - 28)
        cabin_path.lineTo(cx - 68, cy - 72)
        cabin_path.lineTo(cx + 60, cy - 72)
        cabin_path.lineTo(cx + 100, cy - 28)
        cabin_path.closeSubpath()
        p.drawPath(cabin_path)

        win_pen = QPen(QColor("#1e3a5f"), 1)
        p.setPen(win_pen)
        p.drawRoundedRect(cx - 100, cy - 68, 80, 38, 6, 6)
        p.drawRoundedRect(cx - 14, cy - 68, 70, 38, 6, 6)

        p.setPen(pen)
        for wx in [cx - 120, cx + 80]:
            p.drawEllipse(wx - 30, cy + 38, 60, 60)
            inner = QColor("#1a2540")
            p.setBrush(inner); p.drawEllipse(wx - 20, cy + 48, 40, 40)
            p.setBrush(Qt.BrushStyle.NoBrush)

        p.setPen(QPen(QColor(MUTED), 1))
        p.setFont(QFont("Segoe UI", 9))
        p.drawText(QRect(0, h - 24, w, 20), Qt.AlignmentFlag.AlignCenter,
                   "Поместите car.png для 3D-визуализации")


# ── Source item (с прогресс-баром) ────────────────────────────────────────────
class SourceItem(QWidget):
    def __init__(self, name, pct, color, parent=None):
        super().__init__(parent)
        self.setFixedHeight(46)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 4, 0, 4)
        lay.setSpacing(5)

        top = QHBoxLayout(); top.setSpacing(8)
        dot = QLabel(); dot.setFixedSize(9, 9)
        dot.setStyleSheet(f"background:{color}; border-radius:5px;")
        nm = QLabel(name); nm.setStyleSheet(f"color:{TEXT}; font-size:12px;")
        nm.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        pc = QLabel(f"{pct}%"); pc.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:600;")
        top.addWidget(dot); top.addWidget(nm, 1); top.addWidget(pc)

        bar = QProgressBar(); bar.setRange(0, 100); bar.setValue(pct)
        bar.setFixedHeight(4); bar.setTextVisible(False)
        bar.setStyleSheet(f"QProgressBar::chunk {{ background:{color}; border-radius:2px; }}")

        lay.addLayout(top); lay.addWidget(bar)


# ── Diagnosis item ────────────────────────────────────────────────────────────
class DiagnosisItem(QWidget):
    def __init__(self, title, sub, sev, color, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{CARD2}; border-radius:8px;")
        self.setMinimumHeight(56)

        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10); lay.setSpacing(12)

        dot = QLabel(); dot.setFixedSize(9, 9)
        dot.setStyleSheet(f"background:{color}; border-radius:5px;")
        vd = QVBoxLayout(); vd.addSpacing(3); vd.addWidget(dot); vd.addStretch()
        lay.addLayout(vd)

        vc = QVBoxLayout(); vc.setSpacing(3)
        t = QLabel(title); t.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:500;")
        s = QLabel(sub); s.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        vc.addWidget(t); vc.addWidget(s)
        lay.addLayout(vc, 1)

        sv = QLabel(sev)
        sv.setStyleSheet(f"color:{color}; font-size:11px; font-weight:500;")
        sv.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        sv.setFixedWidth(110)
        lay.addWidget(sv)


# ── Labeled slider ────────────────────────────────────────────────────────────
class LabeledSlider(QWidget):
    def __init__(self, label, desc, lo, hi, val, dec=2, parent=None):
        super().__init__(parent)
        sc = 10 ** dec
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 5, 0, 5); lay.setSpacing(4)

        row = QHBoxLayout()
        lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
        lb.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        vl = QLabel(f"{val:.{dec}f}")
        vl.setStyleSheet(
            f"color:{TEXT}; font-size:11px; font-weight:600;"
            f"background:{CARD}; padding:1px 7px; border-radius:4px;"
            f"border:1px solid {BORDER};")
        vl.setFixedWidth(46)
        vl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        row.addWidget(lb); row.addWidget(vl)

        sl = QSlider(Qt.Orientation.Horizontal)
        sl.setRange(int(lo * sc), int(hi * sc))
        sl.setValue(int(val * sc))
        sl.valueChanged.connect(lambda v: vl.setText(f"{v/sc:.{dec}f}"))

        lay.addLayout(row); lay.addWidget(sl)
        if desc:
            d = QLabel(desc); d.setStyleSheet(f"color:{MUTED}; font-size:10px;")
            d.setWordWrap(True); lay.addWidget(d)


# ── Settings helpers ──────────────────────────────────────────────────────────
def _sep():
    f = QFrame(); f.setFixedHeight(1)
    f.setStyleSheet(f"background:{BORDER}; margin:4px 0;"); return f

def _section(txt):
    l = QLabel(txt)
    l.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600; padding-top:8px;")
    return l

def _combo_row(label, opts, idx=0):
    w = QWidget(); r = QHBoxLayout(w)
    r.setContentsMargins(0, 2, 0, 2)
    lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
    lb.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
    cb = QComboBox(); cb.addItems(opts); cb.setCurrentIndex(idx)
    cb.setFixedWidth(170); cb.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
    r.addWidget(lb); r.addWidget(cb); return w

def _toggle_row(label, checked=True):
    w = QWidget(); r = QHBoxLayout(w)
    r.setContentsMargins(0, 2, 0, 2)
    lb = QLabel(label); lb.setStyleSheet(f"color:{TEXT}; font-size:12px;")
    tg = ToggleSwitch(checked)
    r.addWidget(lb); r.addStretch(); r.addWidget(tg); return w


# ── Settings panel ────────────────────────────────────────────────────────────
class SettingsPanel(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(350)
        self.setStyleSheet(f"background:{CARD};")

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 14, 18, 14); root.setSpacing(0)

        title = QLabel("Настройки")
        title.setStyleSheet(f"color:{TEXT}; font-size:17px; font-weight:700;")
        root.addWidget(title); root.addSpacing(12)

        self._tab_btns = []
        tabs_row = QHBoxLayout(); tabs_row.setSpacing(0)
        for i, name in enumerate(["Общие", "Нейросеть", "Аудио", "Визуализация"]):
            b = QPushButton(name); b.setCheckable(True); b.setChecked(i == 1)
            b.setStyleSheet(f"""
                QPushButton {{
                    background:transparent; color:{MUTED}; font-size:11px;
                    padding:5px 6px; border-radius:0;
                    border-bottom:2px solid transparent;
                }}
                QPushButton:checked {{ color:{ACCENT}; border-bottom:2px solid {ACCENT}; }}
                QPushButton:hover:!checked {{ color:{TEXT}; }}
            """)
            b.clicked.connect(lambda _, idx=i: self._switch(idx))
            self._tab_btns.append(b); tabs_row.addWidget(b)
        tabs_row.addStretch(); root.addLayout(tabs_row)

        sep = QFrame(); sep.setFixedHeight(1)
        sep.setStyleSheet(f"background:{BORDER};"); root.addWidget(sep)
        root.addSpacing(8)

        self._stack = QStackedWidget()
        self._stack.addWidget(self._page_general())
        self._stack.addWidget(self._page_neural())
        self._stack.addWidget(self._page_audio())
        self._stack.addWidget(self._page_visual())
        self._stack.setCurrentIndex(1)
        root.addWidget(self._stack, 1)

    def _switch(self, idx):
        for i, b in enumerate(self._tab_btns): b.setChecked(i == idx)
        self._stack.setCurrentIndex(idx)

    def _scrolled(self, build_fn):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("background:transparent;")
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        c = QWidget(); c.setStyleSheet("background:transparent;")
        c.setMaximumWidth(310)
        lay = QVBoxLayout(c); lay.setContentsMargins(0, 0, 4, 0); lay.setSpacing(2)
        build_fn(lay); lay.addStretch()
        scroll.setWidget(c); return scroll

    def _page_neural(self):
        def build(lay):
            lay.addWidget(_section("Параметры модели"))
            lay.addWidget(_combo_row("Модель", ["SoundNet Automotive v2.3",
                                                "SoundNet Automotive v2.0", "CustomCNN v1.0"]))
            lay.addWidget(LabeledSlider("Размер входного окна (сек)",
                "Длина аудиофрагмента, анализируемого нейросетью", 1, 10, 5.0, 1))
            lay.addWidget(LabeledSlider("Шаг анализа (сек)",
                "Интервал между последовательными анализами", 0.1, 5, 1.0, 1))
            lay.addWidget(LabeledSlider("Порог уверенности",
                "Минимальная уверенность для отображения результата", 0, 1, 0.60))
            lay.addWidget(_combo_row("Максимум источников звука", ["1","2","3","4","5"], 3))
            lay.addWidget(_sep())

            lay.addWidget(_section("Архитектура модели"))
            lay.addWidget(_combo_row("Тип модели",
                ["CNN + Transformer","CNN","Transformer","ResNet"]))
            lay.addWidget(_combo_row("Количество слоёв", ["8","12","16","24"], 1))
            lay.addWidget(_combo_row("Размер скрытого слоя", ["256","512","1024"], 1))
            lay.addWidget(_combo_row("Функция активации", ["GELU","ReLU","SiLU"]))
            lay.addWidget(LabeledSlider("Dropout", "", 0, 1, 0.30))
            lay.addWidget(_sep())

            lay.addWidget(_section("Обучение и данные"))
            lay.addWidget(_combo_row("Набор данных",
                ["AutoSounds Dataset v1.4", "Custom Dataset"]))
            lay.addWidget(_toggle_row("Аугментация данных", True))
            lay.addSpacing(10)
            rb = QPushButton("Сбросить настройки модели  ↺")
            rb.setStyleSheet(f"""
                QPushButton {{
                    background:transparent; color:{ACCENT};
                    border:1px solid {ACCENT}; border-radius:6px;
                    padding:8px; font-size:12px;
                }}
                QPushButton:hover {{ background:{ACCENT}22; }}
            """)
            lay.addWidget(rb)
        return self._scrolled(build)

    def _page_general(self):
        def build(lay):
            lay.addWidget(_section("Общие настройки"))
            lay.addWidget(_toggle_row("Автозапуск диагностики", False))
            lay.addWidget(_toggle_row("Уведомления", True))
            lay.addWidget(_combo_row("Язык", ["Русский", "English"]))
        return self._scrolled(build)

    def _page_audio(self):
        def build(lay):
            lay.addWidget(_section("Параметры аудио"))
            lay.addWidget(LabeledSlider("Частота дискретизации (кГц)", "", 8, 48, 22, 0))
            lay.addWidget(LabeledSlider("Размер буфера", "", 512, 4096, 1024, 0))
            lay.addWidget(LabeledSlider("Усиление микрофона", "", 0, 100, 70, 0))
            lay.addWidget(_combo_row("Устройство ввода", ["Микрофон по умолчанию"]))
        return self._scrolled(build)

    def _page_visual(self):
        def build(lay):
            lay.addWidget(_section("Визуализация"))
            lay.addWidget(_toggle_row("Показывать 3D модель", True))
            lay.addWidget(_toggle_row("Анимация точек", True))
            lay.addWidget(_toggle_row("Тёмная тема", True))
            lay.addWidget(_combo_row("Цветовая схема",
                ["По умолчанию","Синяя","Зелёная"]))
        return self._scrolled(build)


# ── History page ──────────────────────────────────────────────────────────────
class HistoryPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{BG};")
        lay = QVBoxLayout(self); lay.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lb = QLabel("История диагностик")
        lb.setStyleSheet(f"color:{MUTED}; font-size:16px;")
        lay.addWidget(lb)


# ── Diagnostics page ──────────────────────────────────────────────────────────
class DiagnosticsPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{BG};")

        root = QVBoxLayout(self)
        root.setContentsMargins(12, 10, 12, 10); root.setSpacing(8)

        # ── Верхняя зона: источники + машина ─────────────────
        top = QHBoxLayout(); top.setSpacing(8)

        # Карточка источников
        src = self._card()
        src.setFixedWidth(210)
        sl = QVBoxLayout(src)
        sl.setContentsMargins(14, 12, 14, 12); sl.setSpacing(0)

        hdr = QHBoxLayout()
        t = QLabel("Источник звуков")
        t.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600;")
        i = QPushButton("ⓘ"); i.setFixedSize(18, 18)
        i.setStyleSheet(f"color:{MUTED}; background:transparent; font-size:11px;")
        hdr.addWidget(t); hdr.addWidget(i); hdr.addStretch()
        sl.addLayout(hdr); sl.addSpacing(10)

        for name, pct, col in SOURCES_DATA:
            sl.addWidget(SourceItem(name, pct, col))

        sl.addSpacing(10)
        sb = QPushButton("Показать все зоны  👁")
        sb.setStyleSheet(f"""
            QPushButton {{
                background:{CARD2}; color:{ACCENT}; border:1px solid {BORDER};
                border-radius:6px; padding:5px 10px; font-size:11px;
            }}
            QPushButton:hover {{ background:{ACCENT}22; }}
        """)
        sl.addWidget(sb)
        top.addWidget(src)

        # Машина
        car_w = QWidget(); car_w.setStyleSheet(f"background:transparent;")
        cwl = QVBoxLayout(car_w); cwl.setContentsMargins(0, 0, 0, 0); cwl.setSpacing(4)

        btn_row = QHBoxLayout(); btn_row.addStretch()
        for icon, tip in [("🚗", "Вид сбоку"), ("3D", "3D вид"), ("↻", "Сброс")]:
            b = QPushButton(icon); b.setFixedSize(30, 28); b.setToolTip(tip)
            b.setStyleSheet(f"""
                QPushButton {{
                    background:{CARD2}; border:1px solid {BORDER};
                    border-radius:6px; font-size:11px; color:{TEXT};
                }}
                QPushButton:hover {{ background:{BORDER}; }}
            """)
            btn_row.addWidget(b)
        cwl.addLayout(btn_row)

        self.car_widget = CarVisualizationWidget()
        cwl.addWidget(self.car_widget, 1)
        top.addWidget(car_w, 1)
        root.addLayout(top, 1)

        # ── Нижняя зона: осциллограмма + анализ ───────────────
        bot = QHBoxLayout(); bot.setSpacing(8)

        # Осциллограмма
        wave_c = self._card(); wave_c.setFixedWidth(240)
        wl = QVBoxLayout(wave_c)
        wl.setContentsMargins(12, 10, 12, 10); wl.setSpacing(6)

        wr = QHBoxLayout()
        wt = QLabel("Запись звука"); wt.setStyleSheet(f"color:{TEXT}; font-size:12px; font-weight:500;")
        self._time_lbl = QLabel("00:00:27")
        self._time_lbl.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        wr.addWidget(wt); wr.addStretch(); wr.addWidget(self._time_lbl)
        wl.addLayout(wr)

        self.waveform = WaveformWidget()
        wl.addWidget(self.waveform, 1)

        mr = QHBoxLayout()
        ml = QLabel("Чувствительность микрофона")
        ml.setStyleSheet(f"color:{MUTED}; font-size:10px;")
        self._mic_pct = QLabel("70%")
        self._mic_pct.setStyleSheet(f"color:{TEXT}; font-size:10px;")
        mr.addWidget(ml); mr.addStretch(); mr.addWidget(self._mic_pct)
        wl.addLayout(mr)

        mic_sl = QSlider(Qt.Orientation.Horizontal)
        mic_sl.setRange(0, 100); mic_sl.setValue(70)
        mic_sl.valueChanged.connect(lambda v: self._mic_pct.setText(f"{v}%"))
        wl.addWidget(mic_sl)
        bot.addWidget(wave_c)

        # Анализ
        an_c = self._card()
        al = QVBoxLayout(an_c)
        al.setContentsMargins(14, 10, 14, 10); al.setSpacing(6)

        at = QLabel("Предварительный анализ")
        at.setStyleSheet(f"color:{TEXT}; font-size:13px; font-weight:600;")
        al.addWidget(at)

        for title, sub, sev, col in DIAGNOSES_DATA:
            al.addWidget(DiagnosisItem(title, sub, sev, col))

        note = QLabel("Важно: Данная диагностика является предварительной "
                      "и не заменяет профессионального осмотра.")
        note.setWordWrap(True)
        note.setStyleSheet(f"color:{MUTED}; font-size:10px; padding-top:2px;")
        al.addWidget(note)
        bot.addWidget(an_c, 1)

        root.addLayout(bot, 0)

    def _card(self):
        f = QFrame()
        f.setStyleSheet(f"QFrame {{ background:{CARD}; border-radius:10px; border:1px solid {BORDER}; }}")
        return f


# ── Left sidebar ──────────────────────────────────────────────────────────────
class LeftSidebar(QWidget):
    page_changed = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(68)
        self.setStyleSheet(f"background:{CARD};")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0); lay.setSpacing(0)

        logo_w = QWidget(); logo_w.setFixedHeight(54)
        ll = QVBoxLayout(logo_w); ll.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo = QLabel("◉"); logo.setStyleSheet(f"color:{ACCENT}; font-size:22px;")
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ll.addWidget(logo); lay.addWidget(logo_w)

        self._btns = []
        for i, (icon, label) in enumerate([("📊", "Диагностика"),
                                            ("📋", "История"),
                                            ("⚙", "Настройки")]):
            b = QPushButton(f"{icon}\n{label}")
            b.setFixedHeight(62); b.setCheckable(True); b.setChecked(i == 0)
            b.setStyleSheet(f"""
                QPushButton {{
                    background:transparent; color:{MUTED}; font-size:9px;
                    border-left:3px solid transparent; border-radius:0; padding:8px 4px;
                }}
                QPushButton:checked {{
                    color:{ACCENT}; background:{ACCENT}18;
                    border-left:3px solid {ACCENT};
                }}
                QPushButton:hover:!checked {{ color:{TEXT}; background:{CARD2}; }}
            """)
            b.clicked.connect(lambda _, idx=i: self._select(idx))
            self._btns.append(b); lay.addWidget(b)

        lay.addStretch()
        ab = QPushButton("ℹ\nО программе"); ab.setFixedHeight(62)
        ab.setStyleSheet(f"""
            QPushButton {{
                background:transparent; color:{MUTED}; font-size:9px;
                border:none; padding:8px 4px;
            }}
            QPushButton:hover {{ color:{TEXT}; background:{CARD2}; }}
        """)
        lay.addWidget(ab); lay.addSpacing(6)

    def _select(self, idx):
        for i, b in enumerate(self._btns): b.setChecked(i == idx)
        self.page_changed.emit(idx)


# ── Main window ───────────────────────────────────────────────────────────────
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Диагностика по звуку v3.0")
        self.setMinimumSize(1100, 680)
        self.resize(1360, 800)
        self._recording = True
        self._elapsed = 27

        central = QWidget(); central.setStyleSheet(f"background:{BG};")
        self.setCentralWidget(central)

        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0); root.setSpacing(0)

        self._sidebar = LeftSidebar()
        self._sidebar.page_changed.connect(self._on_nav)
        root.addWidget(self._sidebar)

        vsep = QFrame(); vsep.setFixedWidth(1)
        vsep.setStyleSheet(f"background:{BORDER};"); root.addWidget(vsep)

        main_col = QVBoxLayout()
        main_col.setContentsMargins(0, 0, 0, 0); main_col.setSpacing(0)
        main_col.addWidget(self._build_header())

        content_row = QHBoxLayout()
        content_row.setContentsMargins(0, 0, 0, 0); content_row.setSpacing(0)

        self._stack = QStackedWidget()
        self._diag  = DiagnosticsPage()
        self._hist  = HistoryPage()
        self._stack.addWidget(self._diag)
        self._stack.addWidget(self._hist)
        content_row.addWidget(self._stack, 1)

        self._rsep = QFrame(); self._rsep.setFixedWidth(1)
        self._rsep.setStyleSheet(f"background:{BORDER};")
        content_row.addWidget(self._rsep)

        self._settings = SettingsPanel()
        content_row.addWidget(self._settings)

        main_col.addLayout(content_row, 1)
        root.addLayout(main_col, 1)

        self._clock = QTimer(self, interval=1000, timeout=self._tick)
        self._clock.start()

    def _build_header(self):
        hdr = QWidget(); hdr.setFixedHeight(50)
        hdr.setStyleSheet(f"background:{CARD}; border-bottom:1px solid {BORDER};")
        lay = QHBoxLayout(hdr)
        lay.setContentsMargins(16, 0, 16, 0); lay.setSpacing(12)

        title = QLabel("Диагностика по звуку")
        title.setStyleSheet(f"color:{TEXT}; font-size:15px; font-weight:700;")
        lay.addWidget(title); lay.addStretch()

        status = QWidget()
        status.setStyleSheet(f"background:{CARD2}; border:1px solid {BORDER}; border-radius:14px;")
        sl = QHBoxLayout(status); sl.setContentsMargins(10, 3, 12, 3); sl.setSpacing(6)
        dot = QLabel("●"); dot.setStyleSheet(f"color:{GREEN}; font-size:9px;")
        sl.addWidget(dot)
        vc = QVBoxLayout(); vc.setSpacing(0)
        c1 = QLabel("Подключено"); c1.setStyleSheet(f"color:{TEXT}; font-size:11px; font-weight:600;")
        c2 = QLabel("Микрофон: Вкл"); c2.setStyleSheet(f"color:{MUTED}; font-size:10px;")
        vc.addWidget(c1); vc.addWidget(c2); sl.addLayout(vc)
        lay.addWidget(status)

        self._rec_btn = QPushButton("⏹  Остановить запись")
        self._rec_btn.setStyleSheet(self._rec_style(True))
        self._rec_btn.clicked.connect(self._toggle_rec)
        lay.addWidget(self._rec_btn)

        gear = QPushButton("⚙"); gear.setFixedSize(34, 34)
        gear.setStyleSheet(f"""
            QPushButton {{
                background:{CARD2}; border:1px solid {BORDER};
                border-radius:6px; font-size:15px; color:{MUTED};
            }}
            QPushButton:hover {{ color:{TEXT}; background:{BORDER}; }}
        """)
        gear.clicked.connect(self._toggle_settings)
        lay.addWidget(gear)
        return hdr

    def _rec_style(self, on):
        bg = RED if on else GREEN
        hov = "#DC2626" if on else "#16A34A"
        return (f"QPushButton {{ background:{bg}; color:white; border-radius:6px;"
                f" padding:6px 14px; font-size:12px; font-weight:600; }}"
                f"QPushButton:hover {{ background:{hov}; }}")

    def _toggle_rec(self):
        self._recording = not self._recording
        self._rec_btn.setText("⏹  Остановить запись" if self._recording else "▶  Начать запись")
        self._rec_btn.setStyleSheet(self._rec_style(self._recording))
        self._diag.waveform.set_active(self._recording)
        self._clock.start() if self._recording else self._clock.stop()

    def _toggle_settings(self):
        vis = self._settings.isVisible()
        self._settings.setVisible(not vis); self._rsep.setVisible(not vis)

    def _on_nav(self, idx):
        if idx == 2: self._toggle_settings()
        else: self._stack.setCurrentIndex(idx)

    def _tick(self):
        self._elapsed += 1
        s = self._elapsed % 60; m = (self._elapsed // 60) % 60; h = self._elapsed // 3600
        self._diag._time_lbl.setText(f"{h:02d}:{m:02d}:{s:02d}")


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
