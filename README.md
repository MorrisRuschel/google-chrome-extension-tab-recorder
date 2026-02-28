# Tab Recorder

Extensão Chrome (Manifest V3) que grava **vídeo + áudio** da aba atual e oferece uma barra de comandos com Gravar, Pausar, Stop e opção de onde salvar o arquivo.

**Autor:** Morris Ruschel (Mad Wolf)  
**Licença:** MIT — veja [LICENSE](LICENSE). Código aberto, use e modifique como quiser.

---

## Funcionalidades

- Gravar vídeo e áudio da aba atual (áudio real via `chrome.tabCapture`)
- Barra de comandos: Gravar, Pausar/Retomar, Stop, Mute/Unmute do áudio gravado
- Timer de gravação
- Escolha de pasta e nome do arquivo (relativo à pasta de Downloads)
- Ouvir o áudio da aba enquanto grava
- Ao parar: diálogo para escolher onde salvar o `.webm`

---

## Instalação (desenvolvimento)

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação** e selecione a pasta `extension/`
4. Fixe a extensão na barra (opcional) e use o ícone para abrir o popup

---

## Estrutura

```
extension/
├── manifest.json
├── popup.html / popup.js
├── background.js
├── recorder.html / recorder.js
└── README.md (este arquivo)
```

---

## Limitações

- Páginas com DRM podem bloquear a captura
- O local de salvamento é relativo à pasta de Downloads do Chrome
- Gravações muito longas podem exigir mais memória

---

© Morris Ruschel (Mad Wolf) — projeto aberto no GitHub.
