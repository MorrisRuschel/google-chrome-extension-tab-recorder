/**
 * Tab Recorder - Background Service Worker (MV3)
 * Coordena a gravação e guarda o estado; a captura e o download acontecem na aba do recorder.
 * O estado fica em chrome.storage.session para sobreviver ao reinício do service worker.
 * @author Morris Ruschel (Mad Wolf)
 */

const DEFAULT_FOLDER = 'Recordings';
const DEFAULT_FILENAME = 'tab-recording.webm';
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const IDLE = {
  state: 'idle', // idle | recording | paused | saving
  recorderTabId: null,
  timerStart: null,
  pausedElapsed: 0, // segundos gravados até a pausa / parada
  folder: DEFAULT_FOLDER,
  filename: DEFAULT_FILENAME,
  audioOnly: false,
  muted: false, // áudio da aba silenciado na gravação
  mic: 'off', // off (não pedido) | pending | on | unavailable
  micMuted: false
};

let rec = { ...IDLE };
let lastError = null; // erro da última tentativa; exibido até o próximo START

// Porta da aba recorder (página de extensão não recebe tabs.sendMessage).
// Mensagens para uma aba ainda sem porta ficam na fila até ela conectar.
const recorderPorts = {};
const queued = {};

const ready = chrome.storage.session.get('recording').then(async ({ recording }) => {
  if (!recording || recording.state === 'idle') return;
  try {
    await chrome.tabs.get(recording.recorderTabId);
    rec = { ...IDLE, ...recording };
  } catch (_) {
    // A aba do recorder não existe mais: a gravação foi perdida.
    await chrome.storage.session.remove('recording');
  }
});

function persist() {
  return rec.state === 'idle'
    ? chrome.storage.session.remove('recording')
    : chrome.storage.session.set({ recording: rec });
}

function reset(error) {
  rec = { ...IDLE };
  if (error) lastError = error;
  return persist();
}

function sendToRecorder(tabId, msg) {
  const port = recorderPorts[tabId];
  if (port) {
    try {
      port.postMessage(msg);
      return;
    } catch (_) {}
  }
  (queued[tabId] ||= []).push(msg);
}

function cleanSegment(s) {
  return s.replace(INVALID_CHARS, '_').replace(/^[\s.]+|[\s.]+$/g, '');
}

/** Caminho relativo à pasta de Downloads, sem "..", barras duplicadas ou caracteres inválidos. */
function sanitizeFolder(value) {
  const parts = String(value ?? '').split(/[\\/]+/).map(cleanSegment).filter(Boolean);
  return parts.length ? parts.join('/') : DEFAULT_FOLDER;
}

function sanitizeFilename(value) {
  let name = cleanSegment(String(value ?? '').trim());
  if (!name) name = DEFAULT_FILENAME;
  if (!/\.webm$/i.test(name)) name += '.webm';
  return name;
}

function savePath() {
  return `${rec.folder}/${rec.filename}`;
}

function isActive() {
  return rec.state === 'recording' || rec.state === 'paused';
}

function elapsedSeconds() {
  if (rec.state === 'recording' && rec.timerStart != null) {
    return Math.floor((Date.now() - rec.timerStart) / 1000);
  }
  return rec.state === 'idle' ? 0 : rec.pausedElapsed;
}

function freezeTimer() {
  rec.pausedElapsed = elapsedSeconds();
  rec.timerStart = null;
}

function getStatus() {
  const seconds = elapsedSeconds();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    state: rec.state,
    timer: `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`,
    elapsedSeconds: seconds,
    folder: rec.folder,
    filename: rec.filename,
    audioOnly: rec.audioOnly,
    muted: rec.muted,
    mic: rec.mic,
    micMuted: rec.micMuted,
    error: lastError
  };
}

const handlers = {
  async START(msg) {
    if (rec.state !== 'idle') return { ok: false, error: 'busy' };
    await chrome.tabs.get(msg.recorderTabId); // falha se a aba do recorder não existe
    rec = {
      ...IDLE,
      state: 'recording',
      recorderTabId: msg.recorderTabId,
      timerStart: Date.now(),
      folder: sanitizeFolder(msg.folder),
      filename: sanitizeFilename(msg.filename),
      audioOnly: msg.audioOnly === true,
      mic: msg.mic === true ? 'pending' : 'off'
    };
    lastError = null;
    await persist();
    sendToRecorder(rec.recorderTabId, {
      action: 'START_RECORDING',
      streamId: msg.streamId,
      audioOnly: rec.audioOnly,
      mic: rec.mic === 'pending',
      path: savePath()
    });
    return { ok: true };
  },

  async STOP(msg) {
    if (!isActive()) return { ok: false };
    if (msg.folder != null) rec.folder = sanitizeFolder(msg.folder);
    if (msg.filename != null) rec.filename = sanitizeFilename(msg.filename);
    freezeTimer();
    rec.state = 'saving';
    await persist();
    sendToRecorder(rec.recorderTabId, { action: 'STOP', path: savePath() });
    return { ok: true };
  },

  async TOGGLE_PAUSE() {
    if (rec.state === 'recording') {
      freezeTimer();
      rec.state = 'paused';
      sendToRecorder(rec.recorderTabId, { action: 'PAUSE' });
    } else if (rec.state === 'paused') {
      rec.timerStart = Date.now() - rec.pausedElapsed * 1000;
      rec.state = 'recording';
      sendToRecorder(rec.recorderTabId, { action: 'RESUME' });
    } else {
      return { ok: false };
    }
    await persist();
    return { ok: true };
  },

  async TOGGLE_MUTE() {
    if (!isActive()) return { ok: false };
    rec.muted = !rec.muted;
    await persist();
    sendToRecorder(rec.recorderTabId, { action: 'SET_MUTED', muted: rec.muted });
    return { ok: true };
  },

  async TOGGLE_MIC() {
    if (!isActive() || (rec.mic !== 'on' && rec.mic !== 'pending')) return { ok: false };
    rec.micMuted = !rec.micMuted;
    await persist();
    sendToRecorder(rec.recorderTabId, { action: 'SET_MIC_MUTED', muted: rec.micMuted });
    return { ok: true };
  },

  // O recorder informa se conseguiu (ou deixou de conseguir) usar o microfone.
  async MIC_STATE(msg, sender) {
    if (sender.tab?.id === rec.recorderTabId && rec.state !== 'idle' && rec.mic !== 'off') {
      rec.mic = msg.available ? 'on' : 'unavailable';
      await persist();
    }
    return { ok: true };
  },

  // O recorder parou de gravar (Stop ou fim da captura, ex.: aba capturada fechada) e vai salvar.
  async SAVING(msg, sender) {
    if (sender.tab?.id === rec.recorderTabId && isActive()) {
      freezeTimer();
      rec.state = 'saving';
      await persist();
    }
    return { ok: true };
  },

  async STOPPED(msg, sender) {
    if (sender.tab?.id === rec.recorderTabId && rec.state !== 'idle') {
      const notSaved = msg.saved === false ? chrome.i18n.getMessage('unsavedMessage') : null;
      await reset(msg.error || notSaved);
    }
    return { ok: true };
  },

  // Uma gravação pendente foi salva depois (botão "Salvar novamente" na página do recorder).
  async SAVED() {
    lastError = null;
    return { ok: true };
  },

  async STATUS() {
    return getStatus();
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && handlers[msg.action];
  if (!handler) return false;
  ready
    .then(() => handler(msg, sender))
    .then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (port.name !== 'recorder' || tabId == null) return;
  recorderPorts[tabId] = port;
  port.onDisconnect.addListener(() => {
    if (recorderPorts[tabId] === port) delete recorderPorts[tabId];
  });

  const pending = queued[tabId] || [];
  delete queued[tabId];
  const startPending = pending.some((m) => m.action === 'START_RECORDING');

  port.onMessage.addListener(async (msg) => {
    if (msg.action !== 'HELLO') return;
    await ready;
    // Página do recorder recarregada durante a gravação: o que estava gravado se perdeu.
    if (!msg.active && !startPending && tabId === rec.recorderTabId && rec.state !== 'idle') {
      await reset();
    }
  });

  pending.forEach((m) => port.postMessage(m));
});

// Aba do recorder fechada: libera o estado para não travar em "Gravando".
chrome.tabs.onRemoved.addListener(async (tabId) => {
  delete queued[tabId];
  await ready;
  if (tabId === rec.recorderTabId && rec.state !== 'idle') await reset();
});

chrome.runtime.onInstalled.addListener(async () => {
  // Remove chaves de estado usadas pela versão 1.0 (agora em storage.session).
  chrome.storage.local.remove([
    'recorderTabId',
    'recordingState',
    'recordingAudioOnly',
    'downloadFolder',
    'downloadFilename'
  ]);

  // Mostra a página de boas-vindas (ativação do microfone) uma única vez, na instalação ou
  // na primeira atualização para uma versão com microfone.
  const { welcomeShown } = await chrome.storage.local.get('welcomeShown');
  if (!welcomeShown) {
    await chrome.storage.local.set({ welcomeShown: true });
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});
