/**
 * Tab Recorder - Background Service Worker (MV3)
 * Coordena gravação; o download é feito na aba do recorder (onde os chunks ficam).
 * @author Morris Ruschel (Mad Wolf)
 */

let state = 'idle'; // idle | recording | paused
let recorderTabId = null;
let chunks = [];
let timerStart = null;
let timerInterval = null;
let pausedElapsed = 0; // segundos já gravados quando pausado
let folder = 'Recordings';
let filename = 'tab-recording.webm';

// Porta da aba recorder (página de extensão não recebe tabs.sendMessage)
const recorderPorts = {};
let pendingStreamId = null;
let pendingRecorderTabId = null;

function sendToRecorder(tabId, msg) {
  const port = recorderPorts[tabId];
  if (port) {
    try {
      port.postMessage(msg);
      return;
    } catch (_) {}
  }
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

chrome.storage.local.get(['recorderTabId', 'recordingState'], (data) => {
  if (data.recordingState === 'recording' && data.recorderTabId) {
    recorderTabId = data.recorderTabId;
    state = 'recording';
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.tab?.id == null) return;
  const tabId = port.sender.tab.id;
  recorderPorts[tabId] = port;
  port.onDisconnect.addListener(() => {
    delete recorderPorts[tabId];
  });
  if (pendingRecorderTabId === tabId && pendingStreamId) {
    port.postMessage({ action: 'START_RECORDING', streamId: pendingStreamId });
    pendingStreamId = null;
    pendingRecorderTabId = null;
  }
});

function startTimer() {
  timerStart = Date.now();
  pausedElapsed = 0;
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerStart = null;
  pausedElapsed = 0;
}

function getStatus() {
  let elapsedSeconds = 0;
  if (state === 'recording' && timerStart != null) {
    elapsedSeconds = Math.floor((Date.now() - timerStart) / 1000);
  } else if (state === 'paused') {
    elapsedSeconds = pausedElapsed;
  }
  const mm = Math.floor(elapsedSeconds / 60);
  const ss = elapsedSeconds % 60;
  const timer = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return { state, timer, elapsedSeconds, folder, filename };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_WITH_STREAM_ID') {
    const { streamId, recorderTabId: tabId } = msg;
    if (recorderPorts[tabId]) {
      sendToRecorder(tabId, { action: 'START_RECORDING', streamId });
    } else {
      pendingStreamId = streamId;
      pendingRecorderTabId = tabId;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'START') {
    state = 'recording';
    recorderTabId = msg.recorderTabId;
    folder = msg.folder || 'Recordings';
    filename = msg.filename || 'tab-recording.webm';
    chunks = [];
    startTimer();
    chrome.storage.local.set({ recorderTabId, recordingState: 'recording', downloadFolder: folder, downloadFilename: filename });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'CHUNK') {
    if (msg.chunk && (state === 'recording' || state === 'paused')) {
      chunks.push(msg.chunk);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'STOPPED') {
    stopTimer();
    state = 'idle';
    chunks = [];
    chrome.storage.local.remove(['recorderTabId', 'recordingState', 'downloadFolder', 'downloadFilename']);
    recorderTabId = null;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'STOP') {
    const f = (msg.folder != null && msg.folder !== '') ? String(msg.folder).trim() : null;
    const n = (msg.filename != null && msg.filename !== '') ? String(msg.filename).trim() : null;
    if (f != null) folder = f.replace(/\/$/, '');
    if (n != null) filename = n.endsWith('.webm') ? n : n + '.webm';
    chrome.storage.local.get(['recorderTabId', 'downloadFolder', 'downloadFilename'], (data) => {
      const tabId = recorderTabId ?? data.recorderTabId;
      const sendFolder = folder || data.downloadFolder || 'Recordings';
      const sendFilename = filename || data.downloadFilename || 'tab-recording.webm';
      if (tabId != null) {
        sendToRecorder(tabId, { action: 'STOP', folder: sendFolder, filename: sendFilename });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'GET_SAVE_PATH') {
    chrome.storage.local.get(['downloadFolder', 'downloadFilename'], (data) => {
      const f = folder || data.downloadFolder || 'Recordings';
      const n = filename || data.downloadFilename || 'tab-recording.webm';
      sendResponse({ folder: f, filename: n });
    });
    return true;
  }

  if (msg.action === 'PAUSE') {
    if (state === 'recording' && timerStart != null) {
      pausedElapsed = Math.floor((Date.now() - timerStart) / 1000);
      state = 'paused';
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (recorderTabId != null) sendToRecorder(recorderTabId, { action: 'PAUSE' });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'RESUME') {
    if (state === 'paused') {
      timerStart = Date.now() - pausedElapsed * 1000;
      state = 'recording';
      if (recorderTabId != null) sendToRecorder(recorderTabId, { action: 'RESUME' });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'MUTE_AUDIO') {
    if (recorderTabId != null) sendToRecorder(recorderTabId, { action: 'MUTE' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'UNMUTE_AUDIO') {
    if (recorderTabId != null) sendToRecorder(recorderTabId, { action: 'UNMUTE' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'STATUS') {
    sendResponse(getStatus());
    return true;
  }

  return false;
});
