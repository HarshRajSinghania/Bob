# Bob settings inventory

Every user-facing setting: its name as shown, the hint, the default and where it lives.
Taken from the code in project-files/bob (Settings 1.5.0 layout) on 2026-11-02. The **Review** column holds open clarity notes. "ok" means it meets SETTINGS-STYLE.md.
Update this file in the same handover as any change to settings.

## Settings: Everyday
| Setting | Hint | Default | Review |
|---|---|---|---|
| Bob's voice | (row shows current voice, Play, Change → Voice & conversation) | Windows voice until Kokoro is set up | ok |
| Bob's look | (current look, Change → Style) | Sysop | ok |
| Theme | (current theme, Change → Style) | Bob's Inn | ok (1.5.2: row renamed "Theme") |
| Animations | On / Follow Windows / Off | On | ok |
| Bob's cat | (text box) | Patches | ok (1.5.2) |
| One brain (snappier) | Every copy of Bob uses the main brain, so there's no brain swap. | off | ok (1.5.2) |
| Launch Bob on start-up | Off unless you turn it on. | off | ok |
| Check for updates when Bob starts | Off unless you turn it on. Bob only tells you; updating always takes your click. | off | ok |
| (footer) Version, graphics card, free disk; Check for updates; Run first-time setup | | | ok |
| Show advanced settings | Brains, voice details, engines and speed, connections, Hands, housekeeping. | off (remembered per PC) | ok |

## Settings: Advanced
| Section | Setting | Hint / notes | Default | Review |
|---|---|---|---|---|
| Brains | Equip Bob slots (thinking and making jobs), session brains, context per session | | starter set | ok (1.5.2) |
| Voice details | Voice engine (Kokoro / Chatterbox / Windows), voice, speed 0.6–1.6×, Hey Bob, read replies aloud | Chatterbox: own-voice recording rules | Windows voice, 1.0×, Hey Bob off | ok |
| Look & feel | Open Now running when a task needs me; your own theme (link) | | off | ok (1.5.2) |
| Engines & speed | Bob's engine: Ollama (if you already have it) / Bob's own (llama.cpp, nothing else needed) | Takes effect next time Bob starts. | llama.cpp | ok |
| Engines & speed | Engine downloads (Get / Check for a newer build) | More: from official GitHub pages | none | ok |
| Engines & speed | Fit to free graphics memory | recommended; one line + More | on | ok (1.5.2) |
| Engines & speed | Speculative decoding + Draft brain, Guess up to, At least | experimental; long hint | off | ok (1.5.2) |
| Engines & speed | Extra settings for one brain: llama.cpp flags | e.g. --n-cpu-moe 8 | none | ok (Advanced, has an example) |
| Connections | Let Bob use ComfyUI; ComfyUI port | off unless you turn it on | off, 8188 | ok |
| Connections | Cloud helpers (per provider on/off + model) | Key found / No key yet | all off | ok |
| Hands | Let Bob use Hands (master switch) | Off = every Hand below is off. | off | ok |
| Hands | Files; Run programs and scripts; Schedules; Open and use apps | long "what" text each | all off | ok (1.5.2) |
| Hands | Folders the Files Hand may work in; Stop a command after | | none | ok |
| Housekeeping | Tidy up old things by himself | Only while he's idle (10 minutes quiet, nothing running)… | off | ok (1.5.2) |
| Housekeeping | Load a brain for it if none is loaded | Off: … so a game keeps the graphics card. | off | ok (1.5.2) |
| Housekeeping | Per item: Chats 3 months, Pictures and clips 6 months, Sounds and music 3 months, Finished tasks 3 days, Logbook 3 months | | as listed | ok |
| Remove Bob | Remove Bob (keeps chats, settings and models unless ticked) | More text | | ok |

## Other pages
| Page | Setting | Default | Review |
|---|---|---|---|
| Downloads | At once: 1 / 2 downloads | 1 | ok |
| Downloads | Carry on unfinished downloads when Bob starts | off | ok (1.5.2) |
| Style | Theme groups, your own theme (name, colours, font, corners, blueprint, outlined), avatars (133), Layout | Bob's Inn | ok (1.5.2) |
| Personality | What should Bob call you?; personality preset; sliders (humour, puns, side trips, mood, nerd references, talkative, manner…) | Factory Bob | ok, labels are plain |
| First-time setup | What should I call you?; Setup pack; model ticks | suggested pack | ok |

## Not yet reviewed
- 1.5.3 chat page: ✋ Hands kill switch (On / Stopped / Off in Settings; only stops, never switches on) and the Memory section (Graphics card + RAM meters, Brain: friendly name).
- Wake on input / Always on toggle and the memory label on the chat page (thread "Keep Bob light when idle"). Waiting for its handover.
