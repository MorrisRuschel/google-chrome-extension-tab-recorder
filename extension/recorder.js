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
          const path = stopDownloadPath.replace(/^\//, '');
          const blob = new Blob(recordedChunks, { type: 'video/webm' });
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            chrome.downloads.download(
              { url: url, filename: path, saveAs: true },
              () => {
                URL.revokeObjectURL(url);
                chrome.runtime.sendMessage({ action: 'STOPPED' }, () => {});
                setTimeout(() => { try { window.close(); } catch (_) {} }, 800);
              }
            );
          } else {
            chrome.runtime.sendMessage({ action: 'STOPPED' }, () => {});
            setTimeout(() => { try { window.close(); } catch (_) {} }, 300);
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
})();
