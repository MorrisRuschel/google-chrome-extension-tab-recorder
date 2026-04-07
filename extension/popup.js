/**
 * Popup: lê/grava Folder e Filename no storage, envia comandos ao background e ao recorder tab.
 * Atualiza UI e faz poll de status (timer e estado).
 * @author Morris Ruschel (Mad Wolf)
 */
(function () {
  const btnRecord = document.getElementById('btnRecord');
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnAudio = document.getElementById('btnAudio');
  const folderInput = document.getElementById('folder');
  const filenameInput = document.getElementById('filename');
  const recordModeSelect = document.getElementById('recordMode');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const timerEl = document.getElementById('timer');

  let recorderTabId = null;
  let pollInterval = null;
  let isMuted = false;
  let recordClickInProgress = false;

  function isAudioOnlyMode() {
    return recordModeSelect && recordModeSelect.value === 'audio';
  }

  function defaultFilename(audioOnly) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const prefix = audioOnly ? 'tab-audio' : 'tab';
    return `${prefix}-${y}-${m}-${day}-${h}${min}.webm`;
  }

  function loadStorage() {
    chrome.storage.local.get({ folder: 'Recordings', filename: '', recordMode: 'video' }, (data) => {
      folderInput.value = data.folder || 'Recordings';
      if (recordModeSelect) recordModeSelect.value = data.recordMode === 'audio' ? 'audio' : 'video';
      const audioOnly = data.recordMode === 'audio';
      if (!data.filename) filenameInput.value = defaultFilename(audioOnly);
      else filenameInput.value = data.filename;
    });
  }

  function saveStorage() {
    const audioOnly = isAudioOnlyMode();
    chrome.storage.local.set({
      folder: folderInput.value.trim() || 'Recordings',
      filename: filenameInput.value.trim() || defaultFilename(audioOnly),
      recordMode: audioOnly ? 'audio' : 'video'
    });
  }

  function updateUI(s) {
    const recordingLabel = s.audioOnly ? 'Gravando (áudio)' : 'Gravando';
    const pausedLabel = s.audioOnly ? 'Pausado (áudio)' : 'Pausado';
    statusText.textContent =
      s.state === 'recording' ? recordingLabel : s.state === 'paused' ? pausedLabel : 'Idle';
    timerEl.textContent = s.timer || '00:00';
    statusEl.className = 'status status-' + (s.state === 'recording' ? 'recording' : s.state === 'paused' ? 'paused' : 'idle');
    const recording = s.state === 'recording' || s.state === 'paused';
    btnRecord.disabled = recording;
    btnStop.disabled = !recording;
    btnPause.disabled = !recording;
    btnAudio.disabled = !recording;
    if (recordModeSelect) recordModeSelect.disabled = recording;
    btnPause.textContent = s.state === 'paused' ? '▶ Retomar' : '⏸ Pausar';
    btnAudio.textContent = isMuted ? '🔇 Mudo' : '🔊 Áudio';
  }

  function pollStatus() {
    chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
      if (res) updateUI(res);
    });
  }

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollStatus, 500);
    pollStatus();
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
      if (res) updateUI(res);
    });
  }

  btnRecord.addEventListener('click', async () => {
    if (recordClickInProgress || btnRecord.disabled) return;
    recordClickInProgress = true;
    saveStorage();
    const folder = folderInput.value.trim() || 'Recordings';
    const audioOnly = isAudioOnlyMode();
    let filename = filenameInput.value.trim();
    if (!filename) filename = defaultFilename(audioOnly);
    if (!filename.endsWith('.webm')) filename += '.webm';

    const [targetTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!targetTab || !targetTab.id) {
      statusText.textContent = 'Erro: nenhuma aba ativa';
      return;
    }

    const recorderUrl = chrome.runtime.getURL('recorder.html');
    let tab = null;
    let tabWasCreated = false;
    const existing = await chrome.tabs.query({ url: recorderUrl });
    if (existing.length > 0) {
      tab = existing[0];
      recorderTabId = tab.id;
    } else {
      tabWasCreated = true;
      tab = await chrome.tabs.create({ url: recorderUrl, active: false });
      recorderTabId = tab.id;
      await new Promise((resolve) => {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        if (tab.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    }

    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: targetTab.id,
        consumerTabId: recorderTabId
      });

      await chrome.runtime.sendMessage({
        action: 'START_WITH_STREAM_ID',
        streamId,
        recorderTabId,
        audioOnly
      });
      await chrome.runtime.sendMessage({
        action: 'START',
        recorderTabId,
        folder,
        filename,
        audioOnly
      });
      startPolling();
    } catch (e) {
      statusText.textContent = 'Erro: ' + (e.message || 'captura não permitida');
      if (tabWasCreated && recorderTabId) chrome.tabs.remove(recorderTabId);
      recorderTabId = null;
    } finally {
      recordClickInProgress = false;
    }
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
      const folder = folderInput.value.trim() || 'Recordings';
      const audioOnly =
        res && (res.state === 'recording' || res.state === 'paused')
          ? res.audioOnly === true
          : isAudioOnlyMode();
      let filename = filenameInput.value.trim() || defaultFilename(audioOnly);
      if (!filename.endsWith('.webm')) filename += '.webm';
      chrome.runtime.sendMessage({ action: 'STOP', folder, filename });
      stopPolling();
      recorderTabId = null;
      updateUI({ state: 'idle', timer: '00:00' });
    });
  });

  btnPause.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
      const action = res && res.state === 'paused' ? 'RESUME' : 'PAUSE';
      chrome.runtime.sendMessage({ action }, () => pollStatus());
    });
  });

  btnAudio.addEventListener('click', () => {
    isMuted = !isMuted;
    chrome.runtime.sendMessage({ action: isMuted ? 'MUTE_AUDIO' : 'UNMUTE_AUDIO' });
    btnAudio.textContent = isMuted ? '🔇 Mudo' : '🔊 Áudio';
  });

  folderInput.addEventListener('change', saveStorage);
  filenameInput.addEventListener('change', saveStorage);
  if (recordModeSelect) {
    recordModeSelect.addEventListener('change', () => {
      saveStorage();
      chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
        if (res && (res.state === 'recording' || res.state === 'paused')) return;
        if (!filenameInput.value.trim()) {
          filenameInput.value = defaultFilename(isAudioOnlyMode());
        }
      });
    });
  }

  const recorderPageUrl = chrome.runtime.getURL('recorder.html');
  const linkRecorderPage = document.getElementById('linkRecorderPage');
  if (linkRecorderPage) {
    linkRecorderPage.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.query({ url: recorderPageUrl }, (tabs) => {
        if (tabs.length > 0) {
          const tab = tabs[0];
          chrome.tabs.update(tab.id, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        } else {
          chrome.tabs.create({ url: recorderPageUrl });
        }
      });
    });
  }

  loadStorage();
  chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
    if (res) updateUI(res);
    else updateUI({ state: 'idle', timer: '00:00' });
  });
})();
