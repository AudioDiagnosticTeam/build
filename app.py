from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import torch
import torch.nn as nn
import numpy as np
import librosa
import tempfile
import webbrowser
import threading

app = Flask(__name__, template_folder="templates")
CORS(app)

# ================== НАСТРОЙКИ ==================
MODEL_PATH = r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model.pth"
SAMPLE_RATE = 22050
N_MFCC = 20

class_names = ['НОРМА', 'ДРЕБЕЗГ', 'СВИСТ', 'СКРИП', 'СТУК']

# ================== МОДЕЛЬ ==================
class CNN(nn.Module):
    def __init__(self, num_classes=5):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.pool1 = nn.MaxPool2d(2)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)
        self.pool2 = nn.MaxPool2d(2)
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm2d(128)
        self.pool3 = nn.MaxPool2d(2)
        self.conv4 = nn.Conv2d(128, 256, kernel_size=3, padding=1)
        self.bn4 = nn.BatchNorm2d(256)
        self.pool4 = nn.MaxPool2d(2)
        self.flatten = nn.Flatten()
        self.dropout = nn.Dropout(0.4)
        self.fc1 = nn.Linear(256 * 1 * 13, 256)
        self.fc2 = nn.Linear(256, 128)
        self.fc3 = nn.Linear(128, num_classes)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.pool1(x)
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.pool2(x)
        x = self.relu(self.bn3(self.conv3(x)))
        x = self.pool3(x)
        x = self.relu(self.bn4(self.conv4(x)))
        x = self.pool4(x)
        x = self.flatten(x)
        x = self.dropout(x)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.relu(self.fc2(x))
        x = self.fc3(x)
        return x

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = CNN(num_classes=len(class_names))
model.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
model.to(device)
model.eval()
print(f"✅ Модель загружена на {device}")

def extract_mfcc(audio_data, sr):
    try:
        mfcc = librosa.feature.mfcc(y=audio_data, sr=sr, n_mfcc=N_MFCC)
        mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
        target = 215
        if mfcc.shape[1] < target:
            mfcc = np.pad(mfcc, ((0,0), (0, target - mfcc.shape[1])), mode='constant')
        return mfcc.astype(np.float32)
    except Exception as e:
        print(f"MFCC Error: {e}")
        return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/diagnose', methods=['POST'])
def diagnose():
    if 'audio' not in request.files:
        return jsonify({"error": "Нет аудио"}), 400

    audio_file = request.files['audio']
    temp_dir = tempfile.gettempdir()
    wav_path = os.path.join(temp_dir, "temp_diag.wav")
    audio_file.save(wav_path)

    try:
        data, sr = librosa.load(wav_path, sr=SAMPLE_RATE, duration=5.0)
    except Exception as e:
        print(f"Ошибка чтения wav: {e}")
        return jsonify({"error": "Не удалось прочитать аудио"}), 500

    features = extract_mfcc(data, sr)
    if features is None:
        return jsonify({"error": "Ошибка MFCC"}), 500

    x = torch.tensor(features).unsqueeze(0).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(x)
        probs = torch.softmax(output, 1)
        confidence, pred = torch.max(probs, 1)

    diagnosis = class_names[pred.item()]
    conf = round(float(confidence.item()) * 100, 1)

    map_info = {
        "НОРМА": {"name": "Состояние в норме", "icon": "✅", "color": "emerald"},
        "ДРЕБЕЗГ": {"name": "Износ поршневых колец", "icon": "⚠️", "color": "red"},
        "СВИСТ":   {"name": "Проблема с вкладышами коленвала", "icon": "⚠️", "color": "yellow"},
        "СКРИП":   {"name": "Скрип в двигателе", "icon": "⚠️", "color": "yellow"},
        "СТУК":    {"name": "Стук в двигателе", "icon": "⚠️", "color": "red"}
    }

    
    info = map_info.get(diagnosis, {"name": diagnosis, "icon": "❓", "color": "zinc"})

    if os.path.exists(wav_path):
        try: os.remove(wav_path)
        except: pass

    return jsonify({
        "diagnosis": diagnosis,
        "confidence": conf,
        "display_name": info["name"],
        "icon": info["icon"],
        "color": info["color"]
    })

def open_browser():
    webbrowser.open("http://127.0.0.1:5000")

if __name__ == '__main__':
    print("🚀 Diagnost 2.0 запущен (простая версия)")
    threading.Timer(2, open_browser).start()
    app.run(debug=False, port=5000)