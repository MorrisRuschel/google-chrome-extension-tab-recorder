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
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const timerEl = document.getElementById('timer');

  let recorderTabId = null;
  let pollInterval = null;
  let isMuted = false;

  function defaultFilename() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `tab-${y}-${m}-${day}-${h}${min}.webm`;
  }

  function loadStorage() {
    chrome.storage.local.get({ folder: 'Recordings', filename: '' }, (data) => {
      folderInput.value = data.folder || 'Recordings';
      if (!data.filename) filenameInput.value = defaultFilename();
      else filenameInput.value = data.filename;
    });
  }

  function saveStorage() {
    chrome.storage.local.set({
      folder: folderInput.value.trim() || 'Recordings',
      filename: filenameInput.value.trim() || defaultFilename()
    });
  }

  function updateUI(s) {
    statusText.textContent = s.state === 'recording' ? 'Gravando' : s.state === 'paused' ? 'Pausado' : 'Idle';
    timerEl.textContent = s.timer || '00:00';
    statusEl.className = 'status status-' + (s.state === 'recording' ? 'recording' : s.state === 'paused' ? 'paused' : 'idle');
    const recording = s.state === 'recording' || s.state === 'paused';
    btnRecord.disabled = recording;
    btnStop.disabled = !recording;
    btnPause.disabled = !recording;
    btnAudio.disabled = !recording;
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
    saveStorage();
    const folder = folderInput.value.trim() || 'Recordings';
    let filename = filenameInput.value.trim();
    if (!filename) filename = defaultFilename();
    if (!filename.endsWith('.webm')) filename += '.webm';

    const [targetTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!targetTab || !targetTab.id) {
      statusText.textContent = 'Erro: nenhuma aba ativa';
      return;
    }

    const recorderUrl = chrome.runtime.getURL('recorder.html');
    const tab = await chrome.tabs.create({ url: recorderUrl, active: false });
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

    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: targetTab.id,
        consumerTabId: recorderTabId
      });

      await chrome.runtime.sendMessage({
        action: 'START_WITH_STREAM_ID',
        streamId,
        recorderTabId
      });
      await chrome.runtime.sendMessage({
        action: 'START',
        recorderTabId,
        folder,
        filename
      });
      startPolling();
    } catch (e) {
      statusText.textContent = 'Erro: ' + (e.message || 'captura não permitida');
      if (recorderTabId) chrome.tabs.remove(recorderTabId);
      recorderTabId = null;
    }
  });

  btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP' });
    stopPolling();
    recorderTabId = null;
    updateUI({ state: 'idle', timer: '00:00' });
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

  loadStorage();
  chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
    if (res) updateUI(res);
    else updateUI({ state: 'idle', timer: '00:00' });
  });
})();
