/**
 * Rodado na aba fantasma: conecta ao background por porta, recebe streamId, grava com MediaRecorder.
 * Envia chunks ao background; suporta pause/resume e mute.
 * @author Morris Ruschel (Mad Wolf)
 */
(function () {
  let mediaRecorder = null;
  let stream = null;
  let audioContext = null;
  let gainNode = null;
  let isPaused = false;
  let isMuted = false;
  const recordedChunks = [];
  let stopDownloadPath = 'Recordings/tab-recording.webm';

  function getConstraints(streamId) {
    return {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    };
  }

  function startRecording(streamId) {
    const constraints = getConstraints(streamId);
    navigator.mediaDevices.getUserMedia(constraints)
      .then((s) => {
        stream = s;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.gain.value = isMuted ? 0 : 1;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(gainNode);
        const dest = audioContext.createMediaStreamDestination();
        gainNode.connect(dest);
        gainNode.connect(audioContext.destination);
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = dest.stream.getAudioTracks()[0];
        const combinedStream = new MediaStream([videoTrack, audioTrack].filter(Boolean));

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm';
        recordedChunks.length = 0;
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2500000 });
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
          }
        };
        mediaRecorder.onstop = () => {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
          }
          if (audioContext) audioContext.close();
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          if (blob.size > 0) {
            chrome.runtime.sendMessage({ action: 'GET_SAVE_PATH' }, (res) => {
              if (chrome.runtime.lastError || !res) {
                res = { folder: 'Recordings', filename: 'tab-recording.webm' };
              }
              const folder = (res.folder || 'Recordings').replace(/\/$/, '');
              let file = res.filename || 'tab-recording.webm';
              if (!file.endsWith('.webm')) file += '.webm';
              const path = folder + '/' + file.replace(/^\//, '');
              const url = URL.createObjectURL(blob);
              chrome.downloads.download(
                { url: url, filename: path, saveAs: true },
                () => {
                  URL.revokeObjectURL(url);
                  addToHistory(path);
                  chrome.runtime.sendMessage({ action: 'STOPPED' }, () => {});
                }
              );
            });
          } else {
            chrome.runtime.sendMessage({ action: 'STOPPED' }, () => {});
          }
        };
        mediaRecorder.start(1000);
      })
      .catch((err) => {
        console.error('getUserMedia error', err);
      });
  }

  function handleCommand(msg) {
    if (msg.action === 'START_RECORDING' && msg.streamId) {
      startRecording(msg.streamId);
      return;
    }
    if (msg.action === 'STOP') {
      if (msg.folder != null || msg.filename != null) {
        const folder = (msg.folder || 'Recordings').replace(/\/$/, '');
        const file = msg.filename || 'tab-recording.webm';
        stopDownloadPath = folder + '/' + file.replace(/^\//, '');
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      return true;
    }
    if (msg.action === 'PAUSE') {
      isPaused = true;
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
      }
      return true;
    }
    if (msg.action === 'RESUME') {
      isPaused = false;
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      }
      return true;
    }
    if (msg.action === 'MUTE') {
      isMuted = true;
      if (gainNode) gainNode.gain.value = 0;
      return true;
    }
    if (msg.action === 'UNMUTE') {
      isMuted = false;
      if (gainNode) gainNode.gain.value = 1;
      return true;
    }
    return false;
  }

  function connectPort() {
    const p = chrome.runtime.connect({ name: 'recorder' });
    p.onMessage.addListener((msg) => { handleCommand(msg); });
    p.onDisconnect.addListener(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        setTimeout(connectPort, 500);
      }
    });
  }
  connectPort();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (handleCommand(msg)) sendResponse({ ok: true });
    return true;
  });

  const HISTORY_KEY = 'recordingHistory';
  const MAX_HISTORY = 20;

  function addToHistory(path) {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      const list = data[HISTORY_KEY] || [];
      list.unshift({ path, date: new Date().toISOString() });
      chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, MAX_HISTORY) }, () => {
        if (typeof renderHistory === 'function') renderHistory();
      });
    });
  }

  function renderHistory() {
    chrome.storage.local.get(HISTORY_KEY, (data) => {
      const list = data[HISTORY_KEY] || [];
      const listEl = document.getElementById('historyList');
      const emptyEl = document.getElementById('historyEmpty');
      if (!listEl) return;
      emptyEl.style.display = list.length ? 'none' : 'block';
      listEl.querySelectorAll('.history-item').forEach((n) => n.remove());
      list.forEach((item) => {
        const d = new Date(item.date);
        const label = item.path + ' — ' + d.toLocaleString();
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = label;
        listEl.appendChild(div);
      });
    });
  }

  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnAudio = document.getElementById('btnAudio');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const timerEl = document.getElementById('timer');

  function updateUI(s) {
    if (!statusText || !timerEl) return;
    statusText.textContent = s.state === 'recording' ? 'Gravando' : s.state === 'paused' ? 'Pausado' : 'Aguardando…';
    timerEl.textContent = s.timer || '00:00';
    if (statusEl) {
      statusEl.className = 'status status-' + (s.state === 'recording' ? 'recording' : s.state === 'paused' ? 'paused' : 'idle');
    }
    const active = s.state === 'recording' || s.state === 'paused';
    if (btnStop) btnStop.disabled = !active;
    if (btnPause) {
      btnPause.disabled = !active;
      btnPause.textContent = s.state === 'paused' ? '▶ Retomar' : '⏸ Pausar';
    }
    if (btnAudio) btnAudio.disabled = !active;
  }

  function pollStatus() {
    chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
      if (res) updateUI(res);
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'STATUS' }, (res) => {
        const action = res && res.state === 'paused' ? 'RESUME' : 'PAUSE';
        chrome.runtime.sendMessage({ action }, () => pollStatus());
      });
    });
  }
  if (btnStop) {
    btnStop.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'STOP' }));
  }
  if (btnAudio) {
    let audioMuted = false;
    btnAudio.addEventListener('click', () => {
      audioMuted = !audioMuted;
      chrome.runtime.sendMessage({ action: audioMuted ? 'MUTE_AUDIO' : 'UNMUTE_AUDIO' });
      btnAudio.textContent = audioMuted ? '🔇 Mudo' : '🔊 Áudio';
    });
  }
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      chrome.storage.local.set({ [HISTORY_KEY]: [] }, () => renderHistory());
    });
  }

  renderHistory();
  pollStatus();
  setInterval(pollStatus, 500);
})();
