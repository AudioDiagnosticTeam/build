import json
from pathlib import Path

import numpy as np

BUILD_DIR          = Path(__file__).parent.parent
MODELS_DIR         = BUILD_DIR / "models"
CLASSES_FILE       = BUILD_DIR / "model_classes.json"
ACTIVE_MODEL_FILE  = BUILD_DIR / "active_model.json"
MODEL_PATHS  = [
    BUILD_DIR / "fault_diagnosis_model_best.pth",
    BUILD_DIR / "fault_diagnosis_model.pth",
    Path(r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model_best.pth"),
    Path(r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model.pth"),
]


class DiagnosticEngine:
    SR         = 22050
    WINDOW_SEC = 5
    STEP_SEC   = 1.5
    N_MFCC     = 20
    TARGET_T   = 215

    def __init__(self):
        self.model      = None
        self.device     = None
        self.classes    = []
        self.model_name = ''

    # ── Загрузка модели по имени ──────────────────────────────
    def load_model_by_name(self, name: str) -> tuple[bool, str]:
        path = MODELS_DIR / f"{name}.pth"
        classes_path = MODELS_DIR / f"{name}_classes.json"
        if not path.exists():
            return False, f"Модель {name}.pth не найдена"
        try:
            import torch
            self.classes = (
                json.loads(classes_path.read_text(encoding="utf-8"))
                if classes_path.exists()
                else json.loads(CLASSES_FILE.read_text(encoding="utf-8-sig"))
                if CLASSES_FILE.exists()
                else ["НОРМА", "ДРЕБЕЗГ", "СВИСТ", "СКРИП", "СТУК"]
            )
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            state = torch.load(path, map_location=self.device, weights_only=True)
            n = state["fc3.weight"].shape[0]
            if n != len(self.classes):
                self.classes = [f"Класс {i}" for i in range(n)]
            model = self._build_cnn(n)
            model.load_state_dict(state)
            model.to(self.device).eval()
            self.model = model
            self.model_name = name
            ACTIVE_MODEL_FILE.write_text(json.dumps({"name": name}), encoding="utf-8")
            return True, f"{name}.pth · {n} классов"
        except Exception as e:
            return False, str(e)

    # ── Загрузка модели ───────────────────────────────────────
    def load_model(self) -> tuple[bool, str]:
        # Если есть активная именная модель — загружаем её
        if ACTIVE_MODEL_FILE.exists():
            try:
                name = json.loads(ACTIVE_MODEL_FILE.read_text(encoding="utf-8")).get("name", "")
                if name:
                    ok, msg = self.load_model_by_name(name)
                    if ok:
                        return ok, msg
            except Exception:
                pass

        try:
            import torch
        except ImportError:
            return False, "PyTorch не установлен"

        self.classes = (
            json.loads(CLASSES_FILE.read_text(encoding="utf-8-sig"))
            if CLASSES_FILE.exists()
            else ["НОРМА", "ДРЕБЕЗГ", "СВИСТ", "СКРИП", "СТУК"]
        )
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        for path in MODEL_PATHS:
            if not path.exists():
                continue
            try:
                state   = torch.load(path, map_location=self.device, weights_only=True)
                n       = state["fc3.weight"].shape[0]
                if n != len(self.classes):
                    self.classes = [f"Класс {i}" for i in range(n)]
                model   = self._build_cnn(n)
                model.load_state_dict(state)
                model.to(self.device).eval()
                self.model = model
                self.model_name = path.stem
                dev_str = "GPU (CUDA)" if self.device == "cuda" else "CPU"
                return True, f"{path.name} · {n} классов · {dev_str}"
            except Exception:
                continue

        return False, "Модель не найдена — запустите start_pytorch.py"

    # ── Архитектура CNN (та же что при обучении) ───────────────
    def _build_cnn(self, n_classes: int):
        import torch.nn as nn

        class CNN(nn.Module):
            def __init__(self):
                super().__init__()
                self.conv1=nn.Conv2d(1,32,3,padding=1);  self.bn1=nn.BatchNorm2d(32);  self.pool1=nn.MaxPool2d(2)
                self.conv2=nn.Conv2d(32,64,3,padding=1); self.bn2=nn.BatchNorm2d(64);  self.pool2=nn.MaxPool2d(2)
                self.conv3=nn.Conv2d(64,128,3,padding=1);self.bn3=nn.BatchNorm2d(128); self.pool3=nn.MaxPool2d(2)
                self.conv4=nn.Conv2d(128,256,3,padding=1);self.bn4=nn.BatchNorm2d(256);self.pool4=nn.MaxPool2d(2)
                self.flatten=nn.Flatten(); self.drop=nn.Dropout(0.5)
                self.fc1=nn.Linear(256*1*13,256); self.fc2=nn.Linear(256,128); self.fc3=nn.Linear(128,n_classes)
                self.relu=nn.ReLU()

            def forward(self, x):
                x=self.relu(self.bn1(self.conv1(x))); x=self.pool1(x)
                x=self.relu(self.bn2(self.conv2(x))); x=self.pool2(x)
                x=self.relu(self.bn3(self.conv3(x))); x=self.pool3(x)
                x=self.relu(self.bn4(self.conv4(x))); x=self.pool4(x)
                x=self.flatten(x); x=self.drop(x)
                x=self.relu(self.fc1(x)); x=self.drop(x)
                x=self.relu(self.fc2(x))
                return self.fc3(x)

        return CNN()

    # ── Инференс (вызывается в ThreadPoolExecutor) ─────────────
    def predict(self, signal: np.ndarray) -> dict:
        import librosa, torch

        mfcc = librosa.feature.mfcc(y=signal, sr=self.SR, n_mfcc=self.N_MFCC)
        mfcc = (mfcc - mfcc.mean()) / (mfcc.std() + 1e-8)
        if mfcc.shape[1] < self.TARGET_T:
            mfcc = np.pad(mfcc, ((0, 0), (0, self.TARGET_T - mfcc.shape[1])))
        else:
            mfcc = mfcc[:, :self.TARGET_T]

        x     = torch.tensor(mfcc.astype(np.float32)).unsqueeze(0).unsqueeze(0).to(self.device)
        with torch.no_grad():
            probs = torch.softmax(self.model(x), 1).cpu().numpy()[0]

        return dict(zip(self.classes, [round(float(p), 4) for p in probs]))
