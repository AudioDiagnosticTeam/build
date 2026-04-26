# import os
# import numpy as np
# import librosa
# import torch
# import torch.nn as nn
# import sounddevice as sd
# import wave
# import keyboard
# import threading
# import time
# import warnings
# warnings.filterwarnings('ignore')

# # =============================================
# # НАСТРОЙКИ
# # =============================================
# MODEL_PATH = r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model.pth"
# SAMPLE_RATE = 22050
# DURATION = 5
# N_MFCC = 20
# CHANNELS = 1
# RECORD_SECONDS = 5
# TEMP_FILE = "temp_recording.wav"

# # =============================================
# # НЕЙРОСЕТЬ (та же архитектура)
# # =============================================
# class CNN(nn.Module):
#     def __init__(self, num_classes=4):
#         super(CNN, self).__init__()
#         self.conv1 = nn.Conv2d(1, 32, kernel_size=3, padding=1)
#         self.bn1 = nn.BatchNorm2d(32)
#         self.pool1 = nn.MaxPool2d(2)
        
#         self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
#         self.bn2 = nn.BatchNorm2d(64)
#         self.pool2 = nn.MaxPool2d(2)
        
#         self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
#         self.bn3 = nn.BatchNorm2d(128)
#         self.pool3 = nn.MaxPool2d(2)
        
#         self.conv4 = nn.Conv2d(128, 256, kernel_size=3, padding=1)
#         self.bn4 = nn.BatchNorm2d(256)
#         self.pool4 = nn.MaxPool2d(2)
        
#         self.flatten = nn.Flatten()
#         self.dropout = nn.Dropout(0.4)
#         self.fc1 = nn.Linear(256 * 1 * 13, 256)
#         self.fc2 = nn.Linear(256, 128)
#         self.fc3 = nn.Linear(128, num_classes)
#         self.relu = nn.ReLU()
    
#     def forward(self, x):
#         x = self.relu(self.bn1(self.conv1(x)))
#         x = self.pool1(x)
#         x = self.relu(self.bn2(self.conv2(x)))
#         x = self.pool2(x)
#         x = self.relu(self.bn3(self.conv3(x)))
#         x = self.pool3(x)
#         x = self.relu(self.bn4(self.conv4(x)))
#         x = self.pool4(x)
#         x = self.flatten(x)
#         x = self.dropout(x)
#         x = self.relu(self.fc1(x))
#         x = self.dropout(x)
#         x = self.relu(self.fc2(x))
#         x = self.fc3(x)
#         return x

# # =============================================
# # ФУНКЦИИ ДЛЯ ЗАПИСИ И АНАЛИЗА
# # =============================================
# def extract_mfcc(file_path):
#     """Извлекает MFCC из файла"""
#     try:
#         signal, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)
#         mfcc = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=N_MFCC)
#         mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
        
#         target_time = 215
#         if mfcc.shape[1] < target_time:
#             pad_width = target_time - mfcc.shape[1]
#             mfcc = np.pad(mfcc, pad_width=((0, 0), (0, pad_width)), mode='constant')
#         else:
#             mfcc = mfcc[:, :target_time]
        
#         return mfcc.astype(np.float32)
#     except Exception as e:
#         print(f"Ошибка MFCC: {e}")
#         return None

# def record_audio_sounddevice(filename, duration=5, samplerate=22050):
#     """Записывает звук с микрофона используя sounddevice"""
#     print(f"🎤 ЗАПИСЬ... (говори/шуми {duration} сек)")
    
#     # Запись
#     recording = sd.rec(int(duration * samplerate), 
#                         samplerate=samplerate, 
#                         channels=CHANNELS, 
#                         dtype='int16')
#     sd.wait()  # Ждем окончания записи
    
#     # Сохраняем в WAV
#     with wave.open(filename, 'wb') as wf:
#         wf.setnchannels(CHANNELS)
#         wf.setsampwidth(2)  # 16-bit = 2 байта
#         wf.setframerate(samplerate)
#         wf.writeframes(recording.tobytes())
    
#     print("✅ ЗАПИСЬ ЗАВЕРШЕНА")

# def diagnose_file(file_path, model, device, class_names):
#     """Анализирует файл и возвращает диагноз"""
#     features = extract_mfcc(file_path)
#     if features is None:
#         return "Ошибка", 0
    
#     x = torch.tensor(features).unsqueeze(0).unsqueeze(0).to(device)
#     model.eval()
    
#     with torch.no_grad():
#         output = model(x)
#         probabilities = torch.softmax(output, 1)
#         confidence, predicted = torch.max(probabilities, 1)
    
#     return class_names[predicted.item()], confidence.item()

# def wait_for_v_key(model, device, class_names):
#     """Ожидает нажатия и удержания V"""
#     print("\n" + "=" * 60)
#     print("🎙️  РЕЖИМ РЕАЛЬНОЙ ДИАГНОСТИКИ")
#     print("=" * 60)
#     print("📌 ИНСТРУКЦИЯ:")
#     print("   1. Нажми и УДЕРЖИВАЙ клавишу V")
#     print("   2. Поднеси микрофон к источнику звука")
#     print("   3. Через 5 секунд запись остановится автоматически")
#     print("   4. Получи диагноз")
#     print("   5. Нажми Q для выхода")
#     print("=" * 60)
    
#     while True:
#         if keyboard.is_pressed('v'):
#             print("\n🔴 ЗАПИСЬ АКТИВИРОВАНА")
#             record_audio_sounddevice(TEMP_FILE, RECORD_SECONDS, SAMPLE_RATE)
            
#             # Анализ
#             print("🔍 АНАЛИЗ ЗВУКА...")
#             diagnosis, confidence = diagnose_file(TEMP_FILE, model, device, class_names)
            
#             print("\n" + "=" * 60)
#             print("🔧 РЕЗУЛЬТАТ ДИАГНОСТИКИ:")
#             print(f"   📊 Неисправность: {diagnosis}")
#             print(f"   🎯 Уверенность: {confidence:.1%}")
#             print("=" * 60)
            
#             # Визуальный индикатор
#             if confidence > 0.8:
#                 print("⚠️  ВЫСОКАЯ ВЕРОЯТНОСТЬ НЕИСПРАВНОСТИ!")
#             elif confidence > 0.6:
#                 print("⚠️  СРЕДНЯЯ ВЕРОЯТНОСТЬ, РЕКОМЕНДУЕТСЯ ПРОВЕРКА")
#             else:
#                 print("ℹ️  НИЗКАЯ УВЕРЕННОСТЬ, ПОВТОРИТЕ ЗАПИСЬ")
            
#             print("\n💡 Нажми V для новой диагностики, Q для выхода\n")
            
#             # Небольшая задержка, чтобы избежать повторного срабатывания
#             time.sleep(1)
        
#         elif keyboard.is_pressed('q'):
#             print("\n👋 ВЫХОД")
#             break
        
#         time.sleep(0.1)

# # =============================================
# # ЗАГРУЗКА МОДЕЛИ И ЗАПУСК
# # =============================================
# print("=" * 60)
# print("🔧 СИСТЕМА ЗВУКОВОЙ ДИАГНОСТИКИ")
# print("   Режим реального времени")
# print("=" * 60)

# # Классы (должны совпадать с обучением)
# class_names = ['ДРЕБЕЗГ', 'СВИСТ', 'СКРИП', 'СТУК']

# # Загрузка модели
# device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
# print(f"📱 Устройство: {device}")

# if not os.path.exists(MODEL_PATH):
#     print(f"❌ Модель не найдена по пути: {MODEL_PATH}")
#     print("Сначала обучи модель командой: python start_pytorch.py")
#     exit()

# model = CNN(num_classes=len(class_names))
# model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
# model.to(device)
# model.eval()
# print("✅ Модель загружена")

# # Проверка микрофона
# try:
#     # Просто проверяем, что sounddevice работает
#     sd.query_devices()
#     print("✅ Микрофон доступен")
# except Exception as e:
#     print(f"⚠️ Проверка микрофона: {e}")
#     print("Убедись, что микрофон подключен")

# # Запуск
# wait_for_v_key(model, device, class_names)

# # Очистка
# if os.path.exists(TEMP_FILE):
#     os.remove(TEMP_FILE)
#     print("🧹 Временные файлы удалены")

import os
import numpy as np
import librosa
import torch
import torch.nn as nn
import sounddevice as sd
import wave
import keyboard
import threading
import time
import warnings
warnings.filterwarnings('ignore')

# =============================================
# НАСТРОЙКИ
# =============================================
MODEL_PATH = r"C:\Users\Mi\Desktop\itog\fault_diagnosis_model.pth"
SAMPLE_RATE = 22050
DURATION = 5
N_MFCC = 20
CHANNELS = 1
RECORD_SECONDS = 5
TEMP_FILE = "temp_recording.wav"

# =============================================
# НЕЙРОСЕТЬ (5 классов: НОРМА, ДРЕБЕЗГ, СВИСТ, СКРИП, СТУК)
# =============================================
class CNN(nn.Module):
    def __init__(self, num_classes=5):  # ИЗМЕНЕНО: теперь 5 классов
        super(CNN, self).__init__()
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
        self.fc3 = nn.Linear(128, num_classes)  # num_classes = 5
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

# =============================================
# ФУНКЦИИ ДЛЯ ЗАПИСИ И АНАЛИЗА
# =============================================
def extract_mfcc(file_path):
    """Извлекает MFCC из файла"""
    try:
        signal, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)
        mfcc = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=N_MFCC)
        mfcc = (mfcc - np.mean(mfcc)) / (np.std(mfcc) + 1e-8)
        
        target_time = 215
        if mfcc.shape[1] < target_time:
            pad_width = target_time - mfcc.shape[1]
            mfcc = np.pad(mfcc, pad_width=((0, 0), (0, pad_width)), mode='constant')
        else:
            mfcc = mfcc[:, :target_time]
        
        return mfcc.astype(np.float32)
    except Exception as e:
        print(f"Ошибка MFCC: {e}")
        return None

def record_audio_sounddevice(filename, duration=5, samplerate=22050):
    """Записывает звук с микрофона используя sounddevice"""
    print(f"🎤 ЗАПИСЬ... (говори/шуми {duration} сек)")
    
    # Запись
    recording = sd.rec(int(duration * samplerate), 
                        samplerate=samplerate, 
                        channels=CHANNELS, 
                        dtype='int16')
    sd.wait()  # Ждем окончания записи
    
    # Сохраняем в WAV
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)  # 16-bit = 2 байта
        wf.setframerate(samplerate)
        wf.writeframes(recording.tobytes())
    
    print("✅ ЗАПИСЬ ЗАВЕРШЕНА")

def diagnose_file(file_path, model, device, class_names):
    """Анализирует файл и возвращает диагноз"""
    features = extract_mfcc(file_path)
    if features is None:
        return "Ошибка", 0
    
    x = torch.tensor(features).unsqueeze(0).unsqueeze(0).to(device)
    model.eval()
    
    with torch.no_grad():
        output = model(x)
        probabilities = torch.softmax(output, 1)
        confidence, predicted = torch.max(probabilities, 1)
    
    return class_names[predicted.item()], confidence.item()

def wait_for_v_key(model, device, class_names):
    """Ожидает нажатия и удержания V"""
    print("\n" + "=" * 60)
    print("🎙️  РЕЖИМ РЕАЛЬНОЙ ДИАГНОСТИКИ")
    print("=" * 60)
    print("📌 ИНСТРУКЦИЯ:")
    print("   1. Нажми и УДЕРЖИВАЙ клавишу V")
    print("   2. Поднеси микрофон к источнику звука")
    print("   3. Через 5 секунд запись остановится автоматически")
    print("   4. Получи диагноз")
    print("   5. Нажми Q для выхода")
    print("=" * 60)
    
    while True:
        if keyboard.is_pressed('v'):
            print("\n🔴 ЗАПИСЬ АКТИВИРОВАНА")
            record_audio_sounddevice(TEMP_FILE, RECORD_SECONDS, SAMPLE_RATE)
            
            # Анализ
            print("🔍 АНАЛИЗ ЗВУКА...")
            diagnosis, confidence = diagnose_file(TEMP_FILE, model, device, class_names)
            
            print("\n" + "=" * 60)
            print("🔧 РЕЗУЛЬТАТ ДИАГНОСТИКИ:")
            print(f"   📊 Состояние: {diagnosis}")
            print(f"   🎯 Уверенность: {confidence:.1%}")
            print("=" * 60)
            
            # Визуальный индикатор
            if diagnosis == "НОРМА":
                print("✅ ОБОРУДОВАНИЕ РАБОТАЕТ НОРМАЛЬНО")
            elif confidence > 0.8:
                print("⚠️  ВЫСОКАЯ ВЕРОЯТНОСТЬ НЕИСПРАВНОСТИ!")
            elif confidence > 0.6:
                print("⚠️  СРЕДНЯЯ ВЕРОЯТНОСТЬ, РЕКОМЕНДУЕТСЯ ПРОВЕРКА")
            else:
                print("ℹ️  НИЗКАЯ УВЕРЕННОСТЬ, ПОВТОРИТЕ ЗАПИСЬ")
            
            print("\n💡 Нажми V для новой диагностики, Q для выхода\n")
            
            # Небольшая задержка, чтобы избежать повторного срабатывания
            time.sleep(1)
        
        elif keyboard.is_pressed('q'):
            print("\n👋 ВЫХОД")
            break
        
        time.sleep(0.1)

# =============================================
# ЗАГРУЗКА МОДЕЛИ И ЗАПУСК
# =============================================
print("=" * 60)
print("🔧 СИСТЕМА ЗВУКОВОЙ ДИАГНОСТИКИ")
print("   Режим реального времени")
print("=" * 60)

# КЛАССЫ ИЗМЕНЕНЫ - добавлен класс "НОРМА" первым
class_names = ['НОРМА', 'ДРЕБЕЗГ', 'СВИСТ', 'СКРИП', 'СТУК']

# Загрузка модели
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"📱 Устройство: {device}")

if not os.path.exists(MODEL_PATH):
    print(f"❌ Модель не найдена по пути: {MODEL_PATH}")
    print("Сначала обучи модель командой: python start_pytorch.py")
    exit()

# ВАЖНО: при загрузке старой модели (4 класса) произойдет ошибка!
# Нужно либо переобучить модель, либо использовать веса с 5 классами
try:
    model = CNN(num_classes=len(class_names))  # 5 классов
    # Пытаемся загрузить веса с ignore_missing=True (если веса не совпадают)
    state_dict = torch.load(MODEL_PATH, map_location=device)
    
    # Проверяем размерность последнего слоя
    if 'fc3.weight' in state_dict and state_dict['fc3.weight'].shape[0] != len(class_names):
        print(f"⚠️ Модель обучена на {state_dict['fc3.weight'].shape[0]} классов, а нужно {len(class_names)}")
        print("❌ НЕОБХОДИМО ПЕРЕОБУЧИТЬ МОДЕЛЬ С 5 КЛАССАМИ!")
        print("   Запустите скрипт обучения с обновленными классами")
        exit()
    
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    print("✅ Модель загружена")
    print(f"📋 Доступные классы: {class_names}")
    
except Exception as e:
    print(f"❌ Ошибка загрузки модели: {e}")
    print("\n🔧 РЕШЕНИЕ:")
    print("   1. В скрипте обучения измените class_names на 5 классов:")
    print("      class_names = ['НОРМА', 'ДРЕБЕЗГ', 'СВИСТ', 'СКРИП', 'СТУК']")
    print("   2. Переобучите модель заново")
    print("   3. Запустите этот скрипт снова")
    exit()

# Проверка микрофона
try:
    sd.query_devices()
    print("✅ Микрофон доступен")
except Exception as e:
    print(f"⚠️ Проверка микрофона: {e}")
    print("Убедись, что микрофон подключен")

# Запуск
wait_for_v_key(model, device, class_names)

# Очистка
if os.path.exists(TEMP_FILE):
    os.remove(TEMP_FILE)
    print("🧹 Временные файлы удалены")