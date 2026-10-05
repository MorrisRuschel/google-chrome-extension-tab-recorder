/**
 * Código compartilhado entre o popup e a página de gravação: i18n e barra de controles.
 * @author Morris Ruschel (Mad Wolf)
 */

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/** Traduz elementos marcados com data-i18n, data-i18n-title, data-i18n-placeholder e data-i18n-alt. */
function applyI18n() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
}

/** Vai para a aba com esta página da extensão, ou abre uma nova. */
async function openExtensionPage(path) {
  const url = chrome.runtime.getURL(path);
  const [tab] = await chrome.tabs.query({ url });
  if (tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
}

function isActiveState(state) {
  return state === 'recording' || state === 'paused';
}

function statusLabel(s) {
  if (s.state === 'recording') return t(s.audioOnly ? 'statusRecordingAudio' : 'statusRecording');
  if (s.state === 'paused') return t(s.audioOnly ? 'statusPausedAudio' : 'statusPaused');
  if (s.state === 'saving') return t('statusSaving');
  return t('statusIdle');
}

/**
 * Liga os botões Pausar / Parar / Aba / Mic e o painel de status ao background, com poll de status.
 * options.stopPayload(): campos extras da mensagem STOP (pasta/arquivo).
 * options.onStatus(status): chamado a cada atualização de status.
 */
function initControls(options = {}) {
  const btnPause = document.getElementById('btnPause');
  const btnStop = document.getElementById('btnStop');
  const btnAudio = document.getElementById('btnAudio');
  const btnMic = document.getElementById('btnMic');
  const micNote = document.getElementById('micNote');
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('statusText');
  const timerEl = document.getElementById('timer');

  function render(s) {
    const active = isActiveState(s.state);
    const micUsable = s.mic === 'on' || s.mic === 'pending';
    statusText.textContent = statusLabel(s);
    timerEl.textContent = s.timer || '00:00';
    statusEl.className = 'status status-' + s.state;
    btnPause.disabled = !active;
    btnStop.disabled = !active;
    btnAudio.disabled = !active;
    btnMic.disabled = !active || !micUsable;
    btnPause.textContent = t(s.state === 'paused' ? 'btnResume' : 'btnPause');
    btnAudio.textContent = t(s.muted ? 'btnMuted' : 'btnAudio');
    btnMic.textContent = t(s.micMuted ? 'btnMicMuted' : 'btnMic');
    micNote.hidden = !(active && s.mic === 'unavailable');
    if (options.onStatus) options.onStatus(s);
  }

  async function refresh() {
    try {
      const s = await chrome.runtime.sendMessage({ action: 'STATUS' });
      if (s) render(s);
    } catch (_) {}
  }

  async function send(msg) {
    try {
      await chrome.runtime.sendMessage(msg);
    } catch (_) {}
    refresh();
  }

  btnPause.addEventListener('click', () => send({ action: 'TOGGLE_PAUSE' }));
  btnStop.addEventListener('click', () =>
    send({ action: 'STOP', ...(options.stopPayload ? options.stopPayload() : {}) })
  );
  btnAudio.addEventListener('click', () => send({ action: 'TOGGLE_MUTE' }));
  btnMic.addEventListener('click', () => send({ action: 'TOGGLE_MIC' }));

  refresh();
  setInterval(refresh, 500);
  return { refresh };
}
