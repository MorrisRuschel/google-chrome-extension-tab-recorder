/**
 * Página do recorder: recebe comandos do background por porta, grava com MediaRecorder e salva o arquivo.
 * Suporta pause/resume e mute do áudio gravado (o áudio continua audível na aba).
 * @author Morris Ruschel (Mad Wolf)
 */
(function () {
  applyI18n();

  const HISTORY_KEY = 'recordingHistory';
  const MAX_HISTORY = 20;

  let mediaRecorder = null;
  let stream = null;
  let audioContext = null;
  let recordGain = null;
  let recordedChunks = [];
  let starting = false;
  let stopRequested = false;
  let muted = false;
  let audioOnly = false;
  let savePath = 'Recordings/tab-recording.webm';
  let unsaved = null; // { blob, path } de uma gravação cujo download falhou ou foi cancelado
  let saving = false;

  const unsavedEl = document.getElementById('unsaved');
  const btnRetrySave = document.getElementById('btnRetrySave');
  const btnDiscard = document.getElementById('btnDiscard');

  function isActive() {
    return starting || (mediaRecorder != null && mediaRecorder.state !== 'inactive');
  }

  function notify(msg) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  function pickMimeType(candidates) {
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  function releaseStream() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (audioContext) audioContext.close().catch(() => {});
    stream = null;
    audioContext = null;
    recordGain = null;
  }

  async function startRecording(msg) {
    if (isActive()) return;
    starting = true;
    stopRequested = false;
    muted = false; // o background começa cada gravação sem mute
    audioOnly = msg.audioOnly === true;
    if (msg.path) savePath = msg.path;
    try {
      const tabSource = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: tabSource,
        video: audioOnly ? false : tabSource
      });

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      // A captura silencia a aba: reproduz o áudio direto na saída, sem passar pelo mute da gravação.
      source.connect(audioContext.destination);
      recordGain = audioContext.createGain();
      recordGain.gain.value = muted ? 0 : 1;
      const dest = audioContext.createMediaStreamDestination();
      source.connect(recordGain).connect(dest);

      const tracks = [...(audioOnly ? [] : stream.getVideoTracks()), ...dest.stream.getAudioTracks()];
      const options = audioOnly
        ? { mimeType: pickMimeType(['audio/webm;codecs=opus', 'audio/webm']), audioBitsPerSecond: 128000 }
        : { mimeType: pickMimeType(['video/webm;codecs=vp9,opus', 'video/webm']), videoBitsPerSecond: 2500000 };

      recordedChunks = [];
      mediaRecorder = new MediaRecorder(new MediaStream(tracks), options);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = onRecorderStop;
      // Se a aba capturada for fechada, a captura termina: finaliza e salva o que já foi gravado.
      stream.getTracks().forEach((track) => track.addEventListener('ended', stopRecording));
      mediaRecorder.start(1000);
    } catch (err) {
      console.error('getUserMedia error', err);
      releaseStream();
      mediaRecorder = null;
      notify({ action: 'STOPPED', error: (err && err.message) || String(err) });
    } finally {
      starting = false;
    }
    if (stopRequested) stopRecording();
  }

  function stopRecording() {
    if (starting) {
      stopRequested = true;
    } else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  async function onRecorderStop() {
    notify({ action: 'SAVING' });
    const blob = new Blob(recordedChunks, { type: audioOnly ? 'audio/webm' : 'video/webm' });
    recordedChunks = [];
    mediaRecorder = null;
    releaseStream();
    if (blob.size === 0) {
      notify({ action: 'STOPPED' });
      return;
    }
    const saved = await save(blob, savePath);
    notify({ action: 'STOPPED', saved });
  }

  function startDownload(options) {
    return new Promise((resolve) => {
      chrome.downloads.download(options, (id) => {
        resolve(chrome.runtime.lastError || id === undefined ? null : id);
      });
    });
  }

  /** Resolve com o DownloadItem quando completo, ou null se interrompido/cancelado/removido. */
  function waitForDownload(id) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        chrome.downloads.onChanged.removeListener(onChanged);
        chrome.downloads.onErased.removeListener(onErased);
        if (!ok) {
          resolve(null);
          return;
        }
        chrome.downloads.search({ id }, (items) => resolve((items && items[0]) || null));
      };
      const onChanged = (delta) => {
        if (delta.id !== id || !delta.state) return;
        if (delta.state.current === 'complete') finish(true);
        else if (delta.state.current === 'interrupted') finish(false);
      };
      const onErased = (erasedId) => {
        if (erasedId === id) finish(false);
      };
      chrome.downloads.onChanged.addListener(onChanged);
      chrome.downloads.onErased.addListener(onErased);
      // O download pode ter terminado antes dos listeners.
      chrome.downloads.search({ id }, (items) => {
        const item = items && items[0];
        if (!item) finish(false);
        else if (item.state === 'complete') finish(true);
        else if (item.state === 'interrupted') finish(false);
      });
    });
  }

  /** Abre o "Salvar como"; se falhar ou for cancelado, guarda a gravação para tentar de novo. */
  async function save(blob, path) {
    saving = true;
    renderUnsaved();
    const url = URL.createObjectURL(blob);
    let item = null;
    try {
      const id = await startDownload({ url, filename: path, saveAs: true });
      if (id != null) item = await waitForDownload(id);
    } finally {
      URL.revokeObjectURL(url);
      saving = false;
    }
    if (item) {
      unsaved = null;
      addToHistory(item.filename || path);
    } else {
      unsaved = { blob, path };
    }
    renderUnsaved();
    return item != null;
  }

  function renderUnsaved() {
    unsavedEl.hidden = !unsaved;
    btnRetrySave.disabled = saving;
    btnDiscard.disabled = saving;
  }

  btnRetrySave.addEventListener('click', async () => {
    if (!unsaved || saving) return;
    if (await save(unsaved.blob, unsaved.path)) notify({ action: 'SAVED' });
  });

  btnDiscard.addEventListener('click', () => {
    if (saving) return;
    unsaved = null;
    renderUnsaved();
  });

  function handleCommand(msg) {
    switch (msg.action) {
      case 'START_RECORDING':
        if (msg.streamId) startRecording(msg);
        break;
      case 'STOP':
        if (msg.path) savePath = msg.path;
        stopRecording();
        break;
      case 'PAUSE':
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
        break;
      case 'RESUME':
        if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
        break;
      case 'SET_MUTED':
        muted = msg.muted === true;
        if (recordGain) recordGain.gain.value = muted ? 0 : 1;
        break;
    }
  }

  // Porta sempre conectada: o background só fala com esta aba por ela (e a reconecta após reiniciar).
  function connectPort() {
    let port;
    try {
      port = chrome.runtime.connect({ name: 'recorder' });
    } catch (_) {
      return; // extensão recarregada/removida
    }
    port.onMessage.addListener(handleCommand);
    port.onDisconnect.addListener(() => setTimeout(connectPort, 500));
    port.postMessage({ action: 'HELLO', active: isActive() });
  }
  connectPort();

  window.addEventListener('beforeunload', (e) => {
    if (isActive() || unsaved || saving) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  function addToHistory(path) {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      const list = data[HISTORY_KEY] || [];
      list.unshift({ path, date: new Date().toISOString() });
      chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, MAX_HISTORY) }, renderHistory);
    });
  }

  function renderHistory() {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      const list = data[HISTORY_KEY] || [];
      const listEl = document.getElementById('historyList');
      document.getElementById('historyEmpty').hidden = list.length > 0;
      listEl.querySelectorAll('.history-item').forEach((n) => n.remove());
      list.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = item.path + ' — ' + new Date(item.date).toLocaleString();
        listEl.appendChild(div);
      });
    });
  }

  document.getElementById('btnClearHistory').addEventListener('click', () => {
    chrome.storage.local.set({ [HISTORY_KEY]: [] }, renderHistory);
  });

  initControls();
  renderHistory();
  renderUnsaved();
})();
