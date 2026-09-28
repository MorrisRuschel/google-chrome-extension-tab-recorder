# Tab Recorder

<p align="center">
  <img src="id/icone.png" alt="Tab Recorder" width="128" />
</p>

Extensão Chrome (Manifest V3) que grava **vídeo + áudio** da aba atual — ou **somente o áudio** — com uma barra de comandos (Gravar, Pausar, Parar, Áudio) e escolha de onde salvar o arquivo (`.webm`).

**Autor:** Morris Ruschel (Mad Wolf)  
**Licença:** MIT — veja [LICENSE](LICENSE). Código aberto, use e modifique como quiser.  
**Versão atual:** 1.1.0 · **Idiomas:** português (Brasil) e inglês

> 🇺🇸 English summary [below](#english).

---

## Funcionalidades

- Gravar **vídeo + áudio** ou **somente áudio** da aba atual (via `chrome.tabCapture`; modo escolhido no popup)
- **Barra de comandos:** Gravar, Pausar/Retomar, Parar e Mute/Unmute do áudio gravado
- **Ouvir a aba enquanto grava** — o mute afeta só o arquivo, não o que você escuta
- **Timer** de gravação em tempo real (congela durante a pausa)
- Escolha de **pasta e nome do arquivo** (relativos à pasta de Downloads); o nome padrão traz data e hora (`tab-2026-09-28-1430.webm` / `tab-audio-…`)
- Ao parar: diálogo **“Salvar como”** para confirmar onde salvar o `.webm`
- **Nenhuma gravação se perde:** se o download falhar ou o “Salvar como” for cancelado, a página de gravação mostra **Salvar novamente** / **Descartar**
- Se a **aba gravada for fechada**, a gravação é finalizada e salva automaticamente
- **Página de gravação** (aba da extensão): aviso para não fechar, controles, status, histórico das últimas 20 gravações (com o caminho real do arquivo) e botão para limpar o histórico
- Controles e status **sincronizados** entre o popup e a página de gravação
- **Idiomas:** português (Brasil) e inglês, escolhidos automaticamente pelo idioma do navegador

---

## Instalação (desenvolvimento)

1. Baixe ou clone este repositório
2. Abra `chrome://extensions`
3. Ative **Modo do desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta `extension/`
5. (Opcional) Fixe a extensão na barra de ferramentas

Para atualizar depois de mudar o código, clique no ícone de recarregar da extensão em `chrome://extensions`.

---

## Como usar

1. Abra a aba que você quer gravar e clique no ícone do **Tab Recorder**
2. No popup, confira **Pasta**, **Arquivo** e **Modo** (Vídeo + áudio ou Somente áudio)
3. Clique em **● Gravar** — a extensão abre (ou reutiliza) a **página de gravação** em segundo plano
4. Use **Pausar/Retomar** e **Áudio** (mute) no popup ou na página de gravação
5. Clique em **■ Parar** e confirme onde salvar no diálogo **“Salvar como”**

> ⚠️ Não feche a página de gravação enquanto grava — é nela que a captura acontece. Se fechar, a gravação em andamento é perdida (o navegador pede confirmação antes).

---

## Como funciona

| Parte | Papel |
| --- | --- |
| `popup.js` | Lê/guarda pasta, arquivo e modo; pede o `streamId` ao `chrome.tabCapture` e manda `START` ao background |
| `background.js` | Service worker: guarda o estado da gravação (em `chrome.storage.session`, sobrevive ao reinício do worker), sanitiza pasta/nome e repassa os comandos à página de gravação |
| `recorder.js` | Página de gravação: captura a aba com `getUserMedia`, grava com `MediaRecorder`, faz o download e mantém o histórico |
| `common.js` / `common.css` | i18n (`data-i18n`) e barra de controles/status compartilhados pelo popup e pela página de gravação |

O background fala com a página de gravação por uma **porta** (`chrome.runtime.connect`); comandos enviados enquanto ela reconecta ficam em fila. Estados: `idle` → `recording` ⇄ `paused` → `saving` → `idle`.

---

## Permissões

| Permissão | Para quê |
| --- | --- |
| `tabCapture` | Capturar vídeo e áudio da aba |
| `activeTab` | Permitir a captura da aba em que você clicou no ícone |
| `downloads` | Salvar o arquivo `.webm` |
| `storage` | Guardar preferências, histórico e o estado da gravação |

---

## Idiomas (i18n)

Os textos ficam em `extension/_locales/<idioma>/messages.json`; o Chrome escolhe pelo idioma do navegador e usa **inglês** (`en`) como padrão.

Para adicionar um idioma, copie `_locales/en/messages.json` para uma pasta nova (ex.: `_locales/es/`) e traduza os valores de `message`. No HTML, textos são marcados com `data-i18n`, `data-i18n-title`, `data-i18n-placeholder` e `data-i18n-alt`; no JavaScript, use `t('chave')`.

---

## Estrutura

```
extension/
├── _locales/
│   ├── en/messages.json      (inglês — padrão)
│   └── pt_BR/messages.json   (português do Brasil)
├── logo.png         (ícone empacotado na extensão)
├── manifest.json
├── background.js    (service worker: estado da gravação e coordenação)
├── common.css       (estilos compartilhados)
├── common.js        (i18n e barra de controles compartilhados)
├── popup.html
├── popup.js
├── recorder.html
└── recorder.js      (captura, MediaRecorder e download)
id/
└── icone.png        (identidade visual / README)
```

Na raiz: `README.md`, `LICENSE`.

---

## Limitações

- Páginas com DRM (ex.: alguns serviços de streaming) podem bloquear a captura ou gravar tela preta
- Não é possível gravar páginas internas do Chrome (`chrome://…`) nem a Chrome Web Store
- O local de salvamento é relativo à pasta de Downloads do Chrome
- A gravação inteira fica na memória até ser salva — gravações muito longas exigem mais RAM
- O `.webm` gerado pelo `MediaRecorder` não traz a duração nos metadados; alguns players não permitem avançar/voltar no vídeo
- A página de gravação precisa ficar aberta durante a gravação

---

## Próximos passos

- Usar um **documento offscreen** (`chrome.offscreen`) no lugar da página de gravação visível
- Corrigir a **duração do WebM** para permitir avançar/voltar em qualquer player
- Gravar os pedaços em **IndexedDB/OPFS** para aguentar gravações longas

---

## Histórico de versões

### 1.1.0
- Gravação não se perde mais quando o download falha ou é cancelado (**Salvar novamente** / **Descartar**)
- Fechar ou recarregar a página de gravação não trava mais o estado em “Gravando”
- Mute silencia só o áudio gravado; estado do mute sincronizado entre popup e página de gravação
- Fim da captura (aba gravada fechada) finaliza e salva a gravação
- Estado completo (pausa, timer, mute) restaurado quando o service worker reinicia
- Novo estado **“Salvando…”**; pasta e nome de arquivo sanitizados; nome padrão sempre com data/hora atual
- Interface em **português (Brasil) e inglês**
- Limpeza de código e remoção da permissão `scripting`

### 1.0.0
- Versão inicial: gravação de vídeo + áudio ou só áudio, pausa, mute, escolha de pasta/arquivo e histórico

---

## English

**Tab Recorder** is a Chrome extension (Manifest V3) that records **video + audio**, or **audio only**, from the current tab and saves it as `.webm`.

- Record / Pause / Resume / Stop, and mute the recorded audio while still hearing the tab
- Pick the folder and filename (relative to your Downloads folder); a **Save as** dialog confirms the location
- If a download fails or is cancelled, the recording is kept on the recording page with **Save again** / **Discard**
- If the recorded tab is closed, the recording is finalized and saved automatically
- UI in **English** and **Brazilian Portuguese**, following the browser language

**Install:** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `extension/` folder.  
**Use:** open the tab to record, click the extension icon, then **● Record**. Keep the recording page open while recording, and click **■ Stop** to save.

---

© Morris Ruschel (Mad Wolf) — projeto aberto no GitHub.
