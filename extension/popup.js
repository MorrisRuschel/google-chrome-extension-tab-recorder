/**
 * Popup: lê/grava pasta, arquivo e modo no storage e inicia a gravação.
 * Os controles de Pausar / Parar / Áudio e o status vêm de common.js.
 * @author Morris Ruschel (Mad Wolf)
 */
(function () {
  applyI18n();

  const btnRecord = document.getElementById('btnRecord');
  const folderInput = document.getElementById('folder');
  const filenameInput = document.getElementById('filename');
  const recordModeSelect = document.getElementById('recordMode');
  const messageEl = document.getElementById('message');
  const recorderUrl = chrome.runtime.getURL('recorder.html');

  // Nome gerado por defaultFilename(); não é guardado no storage para não ficar com data antiga.
  const AUTO_FILENAME = /^tab(-audio)?-\d{4}-\d{2}-\d{2}-\d{4}\.webm$/;

  let recordClickInProgress = false;
  let lastStatus = { state: 'idle' };
  let firstStatus = true;

  function isAudioOnlyMode() {
    return recordModeSelect.value === 'audio';
  }

  function defaultFilename(audioOnly) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const prefix = audioOnly ? 'tab-audio' : 'tab';
    return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.webm`;
  }

  function currentFilename(audioOnly) {
    return filenameInput.value.trim() || defaultFilename(audioOnly);
  }

  function showMessage(text) {
    messageEl.textContent = text || '';
    messageEl.hidden = !text;
  }

  async function loadStorage() {
    const data = await chrome.storage.local.get({ folder: 'Recordings', filename: '', recordMode: 'video' });
    // Durante uma gravação, os campos mostram o que o background está usando (ver onStatus).
    if (!firstStatus && lastStatus.state !== 'idle') return;
    folderInput.value = data.folder || 'Recordings';
    recordModeSelect.value = data.recordMode === 'audio' ? 'audio' : 'video';
    filenameInput.value = data.filename || defaultFilename(isAudioOnlyMode());
  }

  function saveStorage() {
    const filename = filenameInput.value.trim();
    chrome.storage.local.set({
      folder: folderInput.value.trim() || 'Recordings',
      filename: AUTO_FILENAME.test(filename) ? '' : filename,
      recordMode: isAudioOnlyMode() ? 'audio' : 'video'
    });
  }

  function onStatus(s) {
    lastStatus = s;
    const busy = s.state !== 'idle';
    if (firstStatus && busy) {
      folderInput.value = s.folder;
      filenameInput.value = s.filename;
      recordModeSelect.value = s.audioOnly ? 'audio' : 'video';
    }
    firstStatus = false;
    btnRecord.disabled = busy || recordClickInProgress;
    recordModeSelect.disabled = busy;
    if (s.state === 'idle' && s.error && messageEl.hidden) showMessage(t('errorPrefix', [s.error]));
  }

  const controls = initControls({
    onStatus,
    stopPayload: () => ({
      folder: folderInput.value,
      filename: currentFilename(lastStatus.audioOnly === true)
    })
  });

  /** Reutiliza a aba do recorder se já existir; senão cria e espera carregar. */
  async function getRecorderTab() {
    const existing = await chrome.tabs.query({ url: recorderUrl });
    if (existing.length > 0) return { tabId: existing[0].id, created: false };
    const tab = await chrome.tabs.create({ url: recorderUrl, active: false });
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
    return { tabId: tab.id, created: true };
  }

  btnRecord.addEventListener('click', async () => {
    if (recordClickInProgress || btnRecord.disabled) return;
    recordClickInProgress = true;
    btnRecord.disabled = true;
    showMessage('');
    saveStorage();
    const audioOnly = isAudioOnlyMode();
    let recorderTabId = null;
    let tabWasCreated = false;

    try {
      const [targetTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!targetTab || targetTab.id == null) {
        showMessage(t('errorNoActiveTab'));
        return;
      }

      ({ tabId: recorderTabId, created: tabWasCreated } = await getRecorderTab());

      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: targetTab.id,
        consumerTabId: recorderTabId
      });

      const res = await chrome.runtime.sendMessage({
        action: 'START',
        streamId,
        recorderTabId,
        folder: folderInput.value,
        filename: currentFilename(audioOnly),
        audioOnly
      });
      if (!res || !res.ok) throw new Error(res && res.error);

      // Próxima gravação ganha um nome novo com data/hora.
      chrome.storage.local.set({ filename: '' });
    } catch (e) {
      showMessage(t('errorPrefix', [(e && e.message) || t('errorCaptureDefault')]));
      if (tabWasCreated && recorderTabId != null) chrome.tabs.remove(recorderTabId).catch(() => {});
    } finally {
      recordClickInProgress = false;
      controls.refresh();
    }
  });

  folderInput.addEventListener('change', saveStorage);
  filenameInput.addEventListener('change', saveStorage);
  recordModeSelect.addEventListener('change', () => {
    const name = filenameInput.value.trim();
    if (!name || AUTO_FILENAME.test(name)) filenameInput.value = defaultFilename(isAudioOnlyMode());
    saveStorage();
  });

  document.getElementById('linkRecorderPage').addEventListener('click', async (e) => {
    e.preventDefault();
    const tabs = await chrome.tabs.query({ url: recorderUrl });
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: recorderUrl });
    }
  });

  loadStorage();
})();
