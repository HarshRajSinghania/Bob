# Bob of The Idle Process

Bob is a local AI who lives on your PC. Chat, plans and reminders, research, coding help, spreadsheets, pictures, video, music, sound effects and voice, all on your own hardware. He's a self-aware NPC innkeeper with a dry sense of humour and a cat named Patches.

Nothing leaves your PC unless you switch on a cloud helper yourself, and nothing downloads until you click and confirm.

![Bob's window the first time he opens: the menu on the left, the chat in the middle, Now running on the right, and Bob suggesting models for this PC](docs/screenshot.png)

Windows 10 or 11, 64-bit. An NVIDIA graphics card helps a lot but isn't required: Bob suggests models that fit your PC.

## Getting Bob

**Download:** get `Bob-<version>-win-x64.zip` from the Releases page, unzip it anywhere and run `Bob.exe`. `Bob-<version>-win-x64.zip.sha256` has the checksum.

**From source:** on Windows, double-click **Install Bob.cmd** in Bob's folder. Bob opens in his own window and gets a Start menu entry. There is no browser step and no "install as an app".

How Bob runs: `Bob app\Bob.exe` is Electron's official `electron.exe`, unchanged and only renamed, and Bob's own files sit next to it in `Bob app\resources\app`. Windows Smart App Control already knows Electron's program, so it doesn't block Bob, which can happen to a freshly built exe. Updates only change Bob's files, never the exe.

The first time he opens, Bob suggests models for your graphics card. You pick, he downloads, and a progress bar shows every step.

## Where Bob keeps things

Bob's program and his things live apart, so updating Bob never touches your models or notes.

- Default: `%LOCALAPPDATA%\Bob` (models, engines, his notes in `inn`, and `config.json`).
- To use a different folder, put a `home.json` next to Bob.exe (or in `%APPDATA%\Bob`):

  ```json
  { "agentDir": "D:\\Bob", "config": "D:\\Bob\\config.json" }
  ```

## Using Bob

The menu is on the left (fold it to icons with ‹ or Ctrl+B), the chat is in the middle, and **Now running** is on the right: tasks, downloads and graphics card memory (hide it with Ctrl+J, drag its edge to resize). Bob remembers how you leave them.


- **Talk:** type and press Enter (Shift+Enter for a new line). Send as many messages as you like: each one is a task and none get dropped.
- **Tasks:** every task, top to bottom in the order Bob does them. Drag a waiting one (or use ▲ ▼) to change what he does next. Each shows Queued, In progress, Delegated (to which of Bob's copies) or Completed, with times. Completed ones stay for a week; "Clear completed" tidies up.
- **Downloads:** everything you said yes to downloading. One or two at a time (your pick), top first; drag to reorder. Pause keeps what has downloaded and Resume carries on from there, even after Bob restarts. Cancel deletes the half-done file. A network hiccup is retried twice by itself. Unfinished downloads wait, paused, when Bob starts, unless you tick "Carry on when Bob starts".
- **Listen / Read aloud:** say "Hey Bob" hands-free (when hearing is set up), and have Bob read replies aloud: Kokoro (22 natural voices, on the processor), Chatterbox (most natural, graphics card, can copy a voice you have the right to use), Piper, or a Windows voice. The 📎 and 🎙 buttons by the message box attach a picture and talk to Bob.
- **References:** keep characters, scenes and styles so Bob can paint from them.
- **Copy and files:** every message and code block has a Copy button, and each link has one next to it (handy over Remote Desktop, where right-click and Ctrl+C often don't get through). Files Bob mentions are clickable and get a card with a preview, Open, Show in folder and Copy path.
- **Topics:** what you and Bob have talked about, by project, each with a short note on where things landed (yours to edit), open questions, pictures and the chat moments it came from. Rename, merge, pin, drag a message onto another topic, or forget a topic (keep just the note, or everything), always with a preview first. One search box covers chats, summaries, topics, pictures and notes, and Past chats lets you reopen an old conversation.
- **Housekeeping (off unless you turn it on):** while Bob is idle he sums up the older part of long chats instead of dropping it, files chats under Topics, moves lasting facts to his memory file, and finds what hasn't come up for a while: chats, pictures and sounds he made, finished tasks, old log lines, repeated memory lines. Each kind has its own age limit (minutes to months) and either "ask me first" (a list with a tick and a cross per item) or "tidy automatically". Everything removed goes to the Recycle Bin; pinned chats, pictures and topics are never touched; every action goes in the logbook. You can also say "forget what we said about X".
- **Session (next to Bob's name):** Normal, Art (Bob keeps chatting on a small brain while pictures paint), Coding, Office, Deep thought, Light / gaming. Bob may suggest one; he never switches by himself.
- **Models & settings:** models by category, Model roles (which model thinks and which one makes things for each job), On this PC, Style and Settings (engines and switches). Anything this PC can't run is greyed out and hidden from Bob.
- **Style:** themes (MouseHole, MouseWurX and your own), 133 avatars, Animations (On, Follow Windows, Off; On by default because Remote Desktop turns Windows' animation effects off) and whether Now running opens by itself when a task needs you (off unless you turn it on).
- **Alerts:** a Windows notification when Bob needs you.
- **Approvals:** Bob asks before doing anything outside his own folder.

Optional, all off until you switch them on: launch on start-up, cloud helpers (your own API keys, as Windows environment variables), the audio tools (music and sound effects), extra voices, and ComfyUI workflows Bob runs for you.

## Building Bob

Bob is a small Node server (`src/`) with a web page for his window (`public/`), wrapped in Electron (`electron/main.cjs`).

```
npm install
npm start            # run Bob from source
npm test             # every test suite
npm run voice-samples   # make the Kokoro clips that ship in public/voice-samples (Bob running, Kokoro set up)
npm run dist:portable   # optional, by hand only: a single portable Bob-<version>.exe (may be blocked by Smart App Control)
```

On Windows, double-click **Install Bob.cmd**. A window shows each step with a tick, a progress bar, the live log line, the time taken and what the step is for: checking Node.js, getting Electron (its official Windows zip, about 110 MB, checked against Electron's SHASUMS256.txt or the pin in `package.json` `bob.electronSha256`, kept in `inn\bob\electron` so it's only downloaded when the Electron version changes), testing, then putting Bob in `<home>\Bob app` with a Start menu shortcut that carries Bob's icon and app id (`ca.mousewurx.bob`, so the taskbar shows Bob). If a step fails, nothing outside the source folder changes and "Show the full log" says why. (**Double-click to build Bob.cmd** does the same.) To check the shortcut writer on Windows: `installer\bob-shortcut.ps1 -SelfTest`. To try the installer without touching a real install, run `installer\bob-build-window.ps1 -Mode install -AppDir <test folder> -NoShortcut`.

**Updating:** Models & settings, Settings, Updates, "Check for a newer Bob". When the source folder Bob was built from has a newer build, "Update Bob" opens the same window and shows the same steps in Bob's own window. When it's built, the window pops up and Bob asks in the chat too. "Restart Bob now" closes him straight away, swaps in the new files (the old ones stay as `resources\app-previous`; if Electron itself changed, the old exe stays as `Bob-previous.exe`) and opens him again. If he's in the middle of a task or a download you choose: restart anyway (he picks up where he left off), wait until he's done, or not now. "Later" leaves the new Bob waiting; it takes over the next time Bob starts. Checking when Bob starts is off unless you turn it on, and updating always takes your click.

**Voice samples:** every voice in Bob's voice tab and Settings has "Hear a sample". A voice on this PC makes its sample once and keeps it in `inn\bob\voice-samples`. A few Kokoro clips ship with Bob (Kokoro is Apache-2.0). A Piper voice that isn't downloaded plays Piper's official sample from rhasspy.github.io, and only when you click; Piper clips aren't shipped because their voice data licences vary.

Fonts: IBM Plex Mono is bundled in `public/fonts` under the SIL Open Font License (`IBM-Plex-Mono-OFL.txt`).

The server has no runtime dependencies; `node src/server.js` runs it on its own for development.

## Removing Bob

**From Bob:** Models & settings, Settings, **Remove Bob…**. After you confirm, Bob closes and a small window removes his program folder (`Bob app`), the Start menu shortcut, the "Launch on start-up" entry (if you turned it on) and his window data (`%APPDATA%\Bob`). Two boxes, unticked by default, also delete his own data folder (`inn\bob`: chats, settings, task list, saved voice samples) and the models he downloaded (`models\bob`). The rest of the `inn` folder (notice board, logbook, pictures) is never removed by the button. Those two, and the window data, go to the Recycle Bin; only the program folder is deleted outright.

**By hand:** turn off "Launch on start-up" in Settings first (or remove Bob under Task Manager, Startup apps), close Bob, then delete:

- the `Bob app` folder (or wherever `Bob.exe` is), and `Bob.lnk` in the Start menu (`%APPDATA%\Microsoft\Windows\Start Menu\Programs`)
- `%APPDATA%\Bob` (window data)
- if you don't want them any more: Bob's home folder (by default `%LOCALAPPDATA%\Bob`; it holds `inn`, his models and `config.json`)

Bob installs no services, drivers or scheduled tasks and needs no admin rights. The only thing he puts in the registry is Windows' own "start-up app" entry, and only if you turn on "Launch on start-up". Engines and models live inside his folders. Ollama, ComfyUI or Pinokio, if you installed them yourself, are separate programs with their own uninstallers.

## Licence

- Code: GNU GPL, version 3 or later ([LICENSE](LICENSE)).
- Art and writing (avatars, icons, themes, Bob's character and texts, the voice clips that ship with him): CC BY-SA 4.0 ([LICENSE-ART](LICENSE-ART), details in [ASSETS-LICENSE.md](ASSETS-LICENSE.md)).
- The MouseWurX name and logo and the name "Bob of The Idle Process" aren't licensed: see [TRADEMARKS.md](TRADEMARKS.md).
- Third-party parts and the models Bob can download keep their own licences: see [THIRD-PARTY.md](THIRD-PARTY.md).

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- Only files built from this repository's source by its GitHub Actions workflow (`.github/workflows/build.yml`) are signed. Bob's release zip also contains Electron's official runtime, unchanged. Those files are Electron's, and Bob doesn't sign them.
- Committers and reviewers: the members of this repository with write access.
- Approvers: the project owner (MouseWurX). Every signing request for a release is approved by hand.

**Privacy policy** ([PRIVACY.md](PRIVACY.md)): This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. In particular, Bob only reaches the internet when you click: model and engine downloads (from the address shown before you confirm), voice samples from a voice's publisher, web research you ask for, and cloud AI helpers you switch on with your own API key (each use asks first). Phone access over Tailscale is off unless you turn it on. Bob sends no telemetry.

### Versions

Bob 1.0.0 is the first public release. From here the version is `<major>.<minor>.<patch>`:

- **1.0.1, 1.0.2, ...** for fixes and small changes
- **1.1.0, 1.2.0, ...** when new features arrive
- **2.0.0** if something changes in a way that needs you to do something (for example, a new install)

A letter marks work that isn't merged yet (`1.0.1a`). Before 1.0 the versions were `0.9.<build>` (0.9.1 to 0.9.36).

It's set in `package.json`: `version`, and `bob.release` (`1.0`), `bob.patch` and `bob.build`. The build number goes up by one with every drop and never resets (1.0.0 is build 37), and "Check for a newer Bob" compares it, so any newer drop is offered whatever its label. `formatVersion` in `src/config.js` is the one place the label is made. The same label is used in the footer, the update check and git tags (`v1.0.0`).
