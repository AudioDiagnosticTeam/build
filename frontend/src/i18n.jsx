import { createContext, useContext, useState } from 'react'

export const LangContext = createContext('ru')

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ru')
  function changeLang(l) { setLang(l); localStorage.setItem('lang', l) }
  return <LangContext.Provider value={{ lang, changeLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  const { lang } = useContext(LangContext)
  return (key) => {
    const val = T[lang]?.[key] ?? T['ru'][key] ?? key
    return val
  }
}

export function useLangCtx() { return useContext(LangContext) }

const T = {
  ru: {
    // Nav
    'nav.diag':     'Диагностика',
    'nav.history':  'История',
    'nav.training': 'Обучение',
    'nav.dataset':  'Датасет',
    'nav.about':    'О программе',

    // Header
    'header.title':   'Диагностика по звуку',
    'header.start':   'Начать запись',
    'header.stop':    'Остановить запись',

    // Status messages
    'status.init':         'Инициализация...',
    'status.init_sub':     'Загрузка',
    'status.connected':    'Подключено',
    'status.server_ok':    'Сервер запущен',
    'status.no_conn':      'Нет соединения',
    'status.reconnecting': 'Переподключение...',
    'status.no_server':    'Без сервера',
    'status.demo':         'Только демо-режим',
    'status.recording':    'Запись идёт...',
    'status.analyzing':    'Анализ в реальном времени',
    'status.stopped':      'Остановлено',
    'status.press_new':    'Нажмите для новой записи',

    // DiagnosticsPage
    'diag.sources_title':  'Источник звуков',
    'diag.sources_hint':   'Бары показывают отклонение от нормального звука по каждой зоне',
    'diag.waiting':        'Ожидание диагностики...',
    'diag.zones':          'Отклонение по зонам',
    'diag.waveform':       'Запись звука',
    'diag.mic_sens':       'Чувствительность микрофона',
    'diag.analysis':       'Предварительный анализ',
    'diag.no_fault':       'Неисправностей не обнаружено',
    'diag.normal_desc':    'Звуковой профиль соответствует штатной работе агрегатов',
    'diag.health_normal':  'Норма',
    'diag.health_warn':    'Предупреждение',
    'diag.health_fault':   'Неисправность',
    'diag.health_sub':     'Вероятность нормальной работы по модели',
    'diag.high_prob':      'Высокая вероятность',
    'diag.mid_prob':       'Средняя вероятность',
    'diag.low_prob':       'Низкая вероятность',

    // Sources
    'src.engine':   'Двигатель',
    'src.belt':     'Ремень / Навесное оборудование',
    'src.intake':   'Впускная система',
    'src.exhaust':  'Выхлопная система',
    'src.engine_s': 'Двигатель',
    'src.belt_s':   'Ремень / Навесное',
    'src.intake_s': 'Впускная',
    'src.exhaust_s':'Выхлоп',

    // Fault subtitles
    'fault.ДРЕБЕЗГ': 'Дребезжание деталей кузова или навесного оборудования',
    'fault.СВИСТ':   'Свист ремня, турбины или впускной системы',
    'fault.СКРИП':   'Скрип тормозов, подвески или шестерёнок',
    'fault.СТУК':    'Стук двигателя, подшипников или карданного вала',

    // Settings
    'settings.title':         'Настройки',
    'settings.tab.general':   'Общие',
    'settings.tab.audio':     'Аудио',
    'settings.tab.visual':    'Визуализация',
    'settings.autostart':     'Автозапуск диагностики',
    'settings.notifications': 'Уведомления',
    'settings.language':      'Язык',
    'settings.sample_rate':   'Частота дискретизации (кГц)',
    'settings.mic_gain':      'Усиление микрофона',
    'settings.input_device':  'Устройство ввода',
    'settings.default_mic':   'Микрофон по умолчанию',
    'settings.dots':          'Демонстрация источников звука',
    'settings.color_scheme':  'Цветовая схема',
    'settings.theme.default': 'По умолчанию',
    'settings.theme.blue':    'Синяя',
    'settings.theme.green':   'Зелёная',
    'settings.theme.purple':  'Фиолетовая',
    'settings.theme.orange':  'Оранжевая',

    // History
    'history.title':    'История диагностик',
    'history.empty':    'История пуста',
    'history.empty_sub':'Запустите диагностику, чтобы результаты появились здесь',
    'history.clear':    'Очистить историю',
    'history.sessions': 'сессий',
    'history.normal':   'Штатная работа',
    'history.readings': 'измерений',
    'history.duration': 'Длительность',
    'history.dynamics': 'Динамика за сессию',
    'history.analysis': 'Анализ вероятностей',

    // Training
    'train.title':      'Обучение модели',
    'train.subtitle':   'CNN · MFCC · обучение с нуля на вашем датасете',
    'train.hf_dataset': 'Датасет с HuggingFace',
    'train.downloading':'Скачивание...',
    'train.download':   'Скачать датасет',
    'train.downloaded': 'Скачан',
    'train.error':      'Ошибка',
    'train.params':     'Параметры обучения',
    'train.path':       'Путь к датасету',
    'train.path_hint':  'Папки внутри = классы (НОРМА, СТУК, СВИСТ ...). Поддерживаются .wav и .mp3',
    'train.epochs':     'Эпохи',
    'train.batch':      'Батч',
    'train.aug':        'Аугментация данных',
    'train.aug_hint':   '×3 копии с шумом, сдвигом, громкостью',
    'train.start':      'Начать обучение',
    'train.stop':       'Остановить обучение',
    'train.progress':   'Прогресс',
    'train.accuracy':   'Accuracy',
    'train.loss':       'Loss',
    'train.log':        'Лог обучения',

    // Dataset
    'dataset.title':       'Датасет',
    'dataset.classes':     'классов',
    'dataset.files':       'файлов',
    'dataset.empty':       'Датасет пуст',
    'dataset.select':      'Выберите класс слева чтобы посмотреть файлы',
    'dataset.new_class':   'Новый класс',
    'dataset.new_class_ph':'Например: СТУК',
    'dataset.create':      'Создать',
    'dataset.creating':    'Создаём...',
    'dataset.add':         'Добавить',
    'dataset.delete_class':'Удалить класс',
    'dataset.no_files':    'Нет файлов в этом классе',
    'dataset.upload':      'Загрузить файлы',
    'dataset.cut':         'Нарезать аудио',
    'dataset.cut_btn':     'Нарезать и сохранить',
    'dataset.upload_btn':  'Загрузить',
    'dataset.seg_len':     'Длина сегмента',
    'dataset.processing':  'Обработка...',
    'dataset.drop_hint':   'Нажмите или перетащите WAV / MP3',
    'dataset.hf_sync':     'HuggingFace синхронизация',
    'dataset.hf_repo':     'Репозиторий',
    'dataset.hf_token':    'Токен',
    'dataset.hf_save':     'Сохранить',
    'dataset.hf_push':     'Загрузить датасет на HF',
    'dataset.hf_pushing':  'Загружаем...',
    'dataset.hf_saved':    'Токен сохранён',
    'dataset.hf_no_token': 'Сначала сохраните токен',
    'dataset.hf_progress': 'Прогресс',

    // About
    'about.title':      'Диагностика по звуку',
    'about.desc':       'Система акустической диагностики автомобиля на основе нейронной сети. Анализирует звук двигателя и трансмиссии в реальном времени, определяя характер возможных неисправностей.',
    'about.model':      'Модель',
    'about.model_val':  'CNN · 4 класса неисправностей',
    'about.dataset':    'Датасет',
    'about.framework':  'Фреймворк',
    'about.author':     'Автор',
    'about.disclaimer': 'Диагностика является предварительной и не заменяет профессионального осмотра',

    // Footer
    'footer.disclaimer': 'Диагностика является предварительной и не заменяет профессионального осмотра',
  },

  en: {
    // Nav
    'nav.diag':     'Diagnostics',
    'nav.history':  'History',
    'nav.training': 'Training',
    'nav.dataset':  'Dataset',
    'nav.about':    'About',

    // Header
    'header.title': 'Sound Diagnostics',
    'header.start': 'Start recording',
    'header.stop':  'Stop recording',

    // Status
    'status.init':         'Initializing...',
    'status.init_sub':     'Loading',
    'status.connected':    'Connected',
    'status.server_ok':    'Server is running',
    'status.no_conn':      'No connection',
    'status.reconnecting': 'Reconnecting...',
    'status.no_server':    'No server',
    'status.demo':         'Demo mode only',
    'status.recording':    'Recording...',
    'status.analyzing':    'Real-time analysis',
    'status.stopped':      'Stopped',
    'status.press_new':    'Press to start new recording',

    // DiagnosticsPage
    'diag.sources_title':  'Sound Sources',
    'diag.sources_hint':   'Bars show deviation from normal sound per zone',
    'diag.waiting':        'Waiting for diagnostics...',
    'diag.zones':          'Zone deviation',
    'diag.waveform':       'Audio recording',
    'diag.mic_sens':       'Microphone sensitivity',
    'diag.analysis':       'Preliminary analysis',
    'diag.no_fault':       'No faults detected',
    'diag.normal_desc':    'Sound profile matches normal operation',
    'diag.health_normal':  'Normal',
    'diag.health_warn':    'Warning',
    'diag.health_fault':   'Fault',
    'diag.health_sub':     'Probability of normal operation',
    'diag.high_prob':      'High probability',
    'diag.mid_prob':       'Medium probability',
    'diag.low_prob':       'Low probability',

    // Sources
    'src.engine':   'Engine',
    'src.belt':     'Belt / Auxiliary equipment',
    'src.intake':   'Intake system',
    'src.exhaust':  'Exhaust system',
    'src.engine_s': 'Engine',
    'src.belt_s':   'Belt / Aux',
    'src.intake_s': 'Intake',
    'src.exhaust_s':'Exhaust',

    // Fault subtitles
    'fault.ДРЕБЕЗГ': 'Rattling of body or auxiliary components',
    'fault.СВИСТ':   'Belt, turbo or intake system squeal',
    'fault.СКРИП':   'Brake, suspension or gear squeak',
    'fault.СТУК':    'Engine knock, bearing or driveshaft thud',

    // Settings
    'settings.title':         'Settings',
    'settings.tab.general':   'General',
    'settings.tab.audio':     'Audio',
    'settings.tab.visual':    'Visualization',
    'settings.autostart':     'Auto-start diagnostics',
    'settings.notifications': 'Notifications',
    'settings.language':      'Language',
    'settings.sample_rate':   'Sample rate (kHz)',
    'settings.mic_gain':      'Microphone gain',
    'settings.input_device':  'Input device',
    'settings.default_mic':   'Default microphone',
    'settings.dots':          'Sound source visualization',
    'settings.color_scheme':  'Color scheme',
    'settings.theme.default': 'Default',
    'settings.theme.blue':    'Blue',
    'settings.theme.green':   'Green',
    'settings.theme.purple':  'Purple',
    'settings.theme.orange':  'Orange',

    // History
    'history.title':    'Diagnostic history',
    'history.empty':    'History is empty',
    'history.empty_sub':'Run a diagnostic session to see results here',
    'history.clear':    'Clear history',
    'history.sessions': 'sessions',
    'history.normal':   'Normal operation',
    'history.readings': 'readings',
    'history.duration': 'Duration',
    'history.dynamics': 'Session dynamics',
    'history.analysis': 'Probability analysis',

    // Training
    'train.title':      'Model training',
    'train.subtitle':   'CNN · MFCC · train from scratch on your dataset',
    'train.hf_dataset': 'HuggingFace dataset',
    'train.downloading':'Downloading...',
    'train.download':   'Download dataset',
    'train.downloaded': 'Downloaded',
    'train.error':      'Error',
    'train.params':     'Training parameters',
    'train.path':       'Dataset path',
    'train.path_hint':  'Subfolders = classes (НОРМА, СТУК, СВИСТ ...). Supports .wav and .mp3',
    'train.epochs':     'Epochs',
    'train.batch':      'Batch',
    'train.aug':        'Data augmentation',
    'train.aug_hint':   '×3 copies with noise, shift, volume',
    'train.start':      'Start training',
    'train.stop':       'Stop training',
    'train.progress':   'Progress',
    'train.accuracy':   'Accuracy',
    'train.loss':       'Loss',
    'train.log':        'Training log',

    // Dataset
    'dataset.title':       'Dataset',
    'dataset.classes':     'classes',
    'dataset.files':       'files',
    'dataset.empty':       'Dataset is empty',
    'dataset.select':      'Select a class on the left to view files',
    'dataset.new_class':   'New class',
    'dataset.new_class_ph':'e.g. KNOCK',
    'dataset.create':      'Create',
    'dataset.creating':    'Creating...',
    'dataset.add':         'Add',
    'dataset.delete_class':'Delete class',
    'dataset.no_files':    'No files in this class',
    'dataset.upload':      'Upload files',
    'dataset.cut':         'Cut audio',
    'dataset.cut_btn':     'Cut and save',
    'dataset.upload_btn':  'Upload',
    'dataset.seg_len':     'Segment length',
    'dataset.processing':  'Processing...',
    'dataset.drop_hint':   'Click or drag WAV / MP3',
    'dataset.hf_sync':     'HuggingFace sync',
    'dataset.hf_repo':     'Repository',
    'dataset.hf_token':    'Token',
    'dataset.hf_save':     'Save',
    'dataset.hf_push':     'Upload dataset to HF',
    'dataset.hf_pushing':  'Uploading...',
    'dataset.hf_saved':    'Token saved',
    'dataset.hf_no_token': 'Save token first',
    'dataset.hf_progress': 'Progress',

    // About
    'about.title':      'Sound Diagnostics',
    'about.desc':       'Neural network-based acoustic car diagnostic system. Analyzes engine and transmission sounds in real time, identifying possible faults.',
    'about.model':      'Model',
    'about.model_val':  'CNN · 4 fault classes',
    'about.dataset':    'Dataset',
    'about.framework':  'Framework',
    'about.author':     'Author',
    'about.disclaimer': 'Diagnostics are preliminary and do not replace professional inspection',

    // Footer
    'footer.disclaimer': 'Diagnostics are preliminary and do not replace a professional inspection',
  },
}
