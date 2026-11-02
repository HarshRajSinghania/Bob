# Third-party software

## Shipped with Bob

| Part | Where | Licence |
| --- | --- | --- |
| IBM Plex Mono (font) | `public/fonts/` | SIL Open Font License 1.1 (`public/fonts/IBM-Plex-Mono-OFL.txt`) |
| Chat templates for model families (Gemma 4, GPT-OSS, Qwen) | `src/templates/` | Apache-2.0 (from each model's publisher), collected by llama.cpp (MIT); see `src/templates/README.md` |
| Electron (Chromium and Node.js inside it) | the release zip: `Bob.exe` and the files beside it, Electron's official build, unchanged | MIT, with Chromium's notices in `LICENSES.chromium.html` in the same folder |

The font, the chat templates and Electron are separate works distributed alongside Bob, not combined into his code, so
their licences sit beside the GPL. Bob's own code has no runtime npm dependencies.

## Downloaded only when you click

Bob never ships these. Each one is fetched only when you press its button, after a confirm that shows
its size and licence, and runs as a separate program:

| Part | Licence |
| --- | --- |
| llama.cpp, whisper.cpp, stable-diffusion.cpp | MIT |
| Piper (voice engine) | MIT. Each Piper voice has its own data licence on its model card; some are personal use only, and Bob marks those |
| Kokoro-82M (voices) | Apache-2.0; kokoro-onnx: MIT |
| Chatterbox | MIT |
| ACE-Step 1.5 | MIT |
| ComfyUI (optional workshop, separate install) | GPL-3.0 |
| Ollama (optional, separate install) | MIT |
| Models in the model shop | each entry in `catalog.json` lists its licence and whether commercial use is allowed |

Bob leaves out models whose licences forbid commercial use where a good alternative exists (for example
F5-TTS and XTTS are not offered).

## Development only

`electron` and `electron-builder` (MIT) in `devDependencies`, used only for `npm start` and the optional
portable exe.
