import os
import numpy as np
import librosa
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# =============================================
# НАСТРОЙКИ
# =============================================
DATASET_PATH = r"C:\Users\Mi\Desktop\itog"
DURATION = 5
SAMPLE_RATE = 22050
N_MFCC = 20
BATCH_SIZE = 32
EPOCHS = 40  # Больше эпох
# =============================================

def add_noise(signal, noise_factor=0.01):
    """Добавляем шум (сильнее, чем раньше)"""
    noise = np.random.randn(len(signal))
    return signal + noise_factor * noise

def add_realistic_noise(signal):
    """Имитация дорожного шума"""
    # Добавляем низкочастотный гул
    t = np.linspace(0, len(signal)/SAMPLE_RATE, len(signal))
    hum = 0.05 * np.sin(2 * np.pi * 50 * t)  # 50 Гц гул
    return signal + hum

def shift_sound(signal, shift_max=0.3):
    """Сдвиг во времени"""
    shift = int(len(signal) * np.random.uniform(-shift_max, shift_max))
    return np.roll(signal, shift)

def change_volume(signal, volume_factor=0.3):
    """Изменение громкости"""
    return signal * np.random.uniform(1 - volume_factor, 1 + volume_factor)

def extract_mfcc(file_path, augment=False):
    """Извлекает MFCC с сильной аугментацией"""
    try:
        signal, sr = librosa.load(file_path, sr=SAMPLE_RATE, duration=DURATION)
        
        if augment:
            # Комбинируем несколько аугментаций
            aug_type = np.random.choice(['noise', 'realistic', 'shift', 'volume', 'combo', 'none'], 
                                         p=[0.25, 0.2, 0.15, 0.15, 0.15, 0.1])
            
            if aug_type == 'noise':
                signal = add_noise(signal, noise_factor=0.015)
            elif aug_type == 'realistic':
                signal = add_realistic_noise(signal)
                signal = add_noise(signal, noise_factor=0.005)
            elif aug_type == 'shift':
                signal = shift_sound(signal)
            elif aug_type == 'volume':
                signal = change_volume(signal)
            elif aug_type == 'combo':
                signal = add_noise(signal, noise_factor=0.01)
                signal = shift_sound(signal)
                signal = change_volume(signal)
        
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
        return None

class SoundDataset(Dataset):
    def __init__(self, data_path, augment=True):
        self.X = []
        self.y = []
        self.augment = augment
        
        classes = [d for d in os.listdir(data_path) 
                   if os.path.isdir(os.path.join(data_path, d)) and d not in ['diagnostic', 'Отчёты']]
        
        print(f"Найдены классы: {classes}")
        
        for class_idx, class_name in enumerate(classes):
            class_path = os.path.join(data_path, class_name)
            files = [f for f in os.listdir(class_path) if f.endswith(('.WAV', '.wav', '.mp3'))]
            print(f"  {class_name}: {len(files)} файлов")
            
            for fname in files:
                # Оригинал
                features = extract_mfcc(os.path.join(class_path, fname), augment=False)
                if features is not None:
                    self.X.append(features)
                    self.y.append(class_idx)
                
                # Много аугментированных копий
                if augment:
                    for _ in range(4):  # 4 варианта на каждый файл
                        features_aug = extract_mfcc(os.path.join(class_path, fname), augment=True)
                        if features_aug is not None:
                            self.X.append(features_aug)
                            self.y.append(class_idx)
        
        self.classes = classes
        print(f"\n✅ Загружено {len(self.X)} образцов (с аугментацией)")
        print(f"📊 Формат MFCC: {self.X[0].shape}")
    
    def __len__(self):
        return len(self.X)
    
    def __getitem__(self, idx):
        x = torch.tensor(self.X[idx]).unsqueeze(0)
        y = torch.tensor(self.y[idx])
        return x, y

class CNN(nn.Module):
    def __init__(self, num_classes=4):
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
        self.dropout = nn.Dropout(0.5)  # Увеличил dropout
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

print("=" * 60)
print("🔧 СИСТЕМА ЗВУКОВОЙ ДИАГНОСТИКИ (усиленная)")
print("=" * 60)

# Загрузка
dataset = SoundDataset(DATASET_PATH, augment=True)

if len(dataset) == 0:
    print("❌ Нет файлов!")
    exit()

train_size = int(0.8 * len(dataset))
test_size = len(dataset) - train_size
train_dataset, test_dataset = random_split(dataset, [train_size, test_size])

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

print(f"📊 Обучающая: {train_size}, Тестовая: {test_size}")

# Модель
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = CNN(len(dataset.classes)).to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

print("\n🏋️ ОБУЧЕНИЕ...")
train_losses, train_accs, test_losses, test_accs = [], [], [], []

best_acc = 0

for epoch in range(EPOCHS):
    # Train
    model.train()
    total_loss, correct, total = 0, 0, 0
    
    for inputs, labels in train_loader:
        inputs, labels = inputs.to(device), labels.to(device)
        
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item()
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
    
    train_loss = total_loss / len(train_loader)
    train_acc = correct / total
    train_losses.append(train_loss)
    train_accs.append(train_acc)
    
    # Test
    model.eval()
    total_loss, correct, total = 0, 0, 0
    
    with torch.no_grad():
        for inputs, labels in test_loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            total_loss += loss.item()
            _, predicted = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
    
    test_loss = total_loss / len(test_loader)
    test_acc = correct / total
    test_losses.append(test_loss)
    test_accs.append(test_acc)
    
    scheduler.step(test_loss)
    
    # Сохраняем лучшую модель
    if test_acc > best_acc:
        best_acc = test_acc
        torch.save(model.state_dict(), 'fault_diagnosis_model_best.pth')
    
    if (epoch + 1) % 5 == 0:
        print(f"Эпоха {epoch+1}/{EPOCHS} | Train Acc: {train_acc:.2%} | Test Acc: {test_acc:.2%} | LR: {optimizer.param_groups[0]['lr']:.6f}")

print(f"\n🎯 ЛУЧШАЯ ТОЧНОСТЬ: {best_acc:.2%}")

# Загружаем лучшую модель
model.load_state_dict(torch.load('fault_diagnosis_model_best.pth'))

# Графики
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.plot(train_accs, label='Обучающая')
ax1.plot(test_accs, label='Тестовая')
ax1.set_title('Точность модели')
ax1.set_xlabel('Эпоха')
ax1.set_ylabel('Точность')
ax1.legend()
ax1.grid(True)

ax2.plot(train_losses, label='Обучающая')
ax2.plot(test_losses, label='Тестовая')
ax2.set_title('Функция потерь')
ax2.set_xlabel('Эпоха')
ax2.set_ylabel('Потери')
ax2.legend()
ax2.grid(True)

plt.tight_layout()
plt.savefig('diagnostics_results.png', dpi=150)
plt.show()

# Сохраняем финальную
torch.save(model.state_dict(), 'fault_diagnosis_model.pth')
print("\n💾 Модель сохранена")

# Функция для предсказания с усреднением
def predict_with_averaging(file_path, model, device, class_names, n_augment=3):
    """Делает несколько предсказаний с разной аугментацией и усредняет"""
    predictions = []
    confidences = []
    
    # Оригинал
    features = extract_mfcc(file_path, augment=False)
    if features is None:
        return "Ошибка", 0
    
    x = torch.tensor(features).unsqueeze(0).unsqueeze(0).to(device)
    with torch.no_grad():
        output = model(x)
        probs = torch.softmax(output, 1)
        conf, pred = torch.max(probs, 1)
        predictions.append(pred.item())
        confidences.append(conf.item())
    
    # Аугментированные версии
    for _ in range(n_augment):
        features_aug = extract_mfcc(file_path, augment=True)
        if features_aug is not None:
            x = torch.tensor(features_aug).unsqueeze(0).unsqueeze(0).to(device)
            with torch.no_grad():
                output = model(x)
                probs = torch.softmax(output, 1)
                conf, pred = torch.max(probs, 1)
                predictions.append(pred.item())
                confidences.append(conf.item())
    
    # Усредняем
    from collections import Counter
    final_pred = Counter(predictions).most_common(1)[0][0]
    avg_confidence = np.mean(confidences)
    
    return class_names[final_pred], avg_confidence

print("\n🔍 ТЕСТ НА ФАЙЛАХ ДАТАСЕТА:")
for class_name in dataset.classes:
    class_path = os.path.join(DATASET_PATH, class_name)
    files = [f for f in os.listdir(class_path) if f.endswith(('.WAV', '.wav'))]
    if files:
        result, conf = predict_with_averaging(os.path.join(class_path, files[0]), model, device, dataset.classes)
        print(f"  {class_name} → {result} ({conf:.1%})")