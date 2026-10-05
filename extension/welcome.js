/**
 * Página de boas-vindas: pede a permissão do microfone para a extensão (uma única vez).
 * A permissão fica com a origem da extensão, então a página de gravação usa o microfone
 * depois sem perguntar de novo.
 * @author Morris Ruschel (Mad Wolf)
 */
(function () {
  applyI18n();

  const btnEnable = document.getElementById('btnEnableMic');
  const btnSettings = document.getElementById('btnOpenSettings');
  const statusEl = document.getElementById('micStatus');

  let permission = null;
  let dismissed = false; // aviso do Chrome fechado sem resposta
  let noDevice = false;

  function render() {
    let cls = permission || 'prompt';
    let key;
    if (noDevice) {
      cls = 'error';
      key = 'micStatusNoDevice';
    } else if (permission === 'granted') {
      key = 'micStatusGranted';
    } else if (permission === 'denied') {
      key = 'micStatusDenied';
    } else {
      key = dismissed ? 'micStatusDismissed' : 'micStatusPrompt';
    }
    statusEl.className = 'mic-status ' + cls;
    statusEl.textContent = t(key);
    statusEl.hidden = false;
    btnEnable.hidden = permission === 'granted' && !noDevice;
    btnSettings.hidden = permission !== 'denied';
  }

  async function watchPermission() {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      permission = status.state;
      status.onchange = () => {
        permission = status.state;
        render();
      };
    } catch (_) {
      permission = null;
    }
    render();
  }

  btnEnable.addEventListener('click', async () => {
    btnEnable.disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      noDevice = false;
      dismissed = false;
    } catch (err) {
      noDevice = err.name === 'NotFoundError' || err.name === 'OverconstrainedError';
      dismissed = !noDevice;
    } finally {
      btnEnable.disabled = false;
    }
    try {
      permission = (await navigator.permissions.query({ name: 'microphone' })).state;
    } catch (_) {}
    render();
  });

  btnSettings.addEventListener('click', () => {
    chrome.tabs.create({
      url: 'chrome://settings/content/siteDetails?site=' + encodeURIComponent(location.origin)
    });
  });

  watchPermission();
})();
