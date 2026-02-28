# Tab Recorder

Extensão Chrome (Manifest V3) que grava **vídeo + áudio** da aba atual e oferece uma barra de comandos com Gravar, Pausar, Stop e opção de onde salvar o arquivo.

**Autor:** Morris Ruschel (Mad Wolf)  
**Licença:** MIT — veja [LICENSE](LICENSE). Código aberto, use e modifique como quiser.

**Repositório:** [GitHub — google-chrome-extension-tab-recorder](https://github.com/MorrisRuschel/google-chrome-extension-tab-recorder)

---

## Funcionalidades

- Gravar **vídeo + áudio** da aba atual (áudio real via `chrome.tabCapture`)
- **Barra de comandos:** Gravar, Pausar/Retomar, Stop, Mute/Unmute do áudio gravado
- **Timer** de gravação (atualizado em tempo real)
- Escolha de **pasta e nome do arquivo** (relativo à pasta de Downloads); o nome é respeitado na janela “Salvar como”
- **Ouvir o áudio** da aba enquanto grava
- Ao parar: diálogo **“Salvar como”** para escolher onde salvar o `.webm`
- **Página de gravação** (aba da extensão): aviso para não fechar, controles (Pausar, Stop, Áudio), histórico das últimas gravações e botão para limpar o histórico
- **Reutilização da aba:** ao clicar em Gravar, a extensão reutiliza a aba da página de gravação se ela já estiver aberta (só abre uma nova se estiver fechada)
- No **popup:** link “Página de gravação” para abrir a aba da extensão ou ir para ela se já existir

---

## Instalação (desenvolvimento)

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`
4. (Opcional) Fixe a extensão na barra e use o ícone para abrir o popup

---

## Estrutura

```
extension/
├── logo.png         (ícone da extensão)
├── manifest.json
├── popup.html
├── popup.js
├── background.js
├── recorder.html
└── recorder.js
```

Na raiz do repositório: `README.md`, `LICENSE`.

---

## Limitações

- Páginas com DRM podem bloquear a captura
- O local de salvamento é relativo à pasta de Downloads do Chrome
- Gravações muito longas podem exigir mais memória

---

© Morris Ruschel (Mad Wolf) — projeto aberto no GitHub.
