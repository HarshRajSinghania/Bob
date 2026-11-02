# Bob: the user guide

This guide is for everyone, not just programmers. You don't need to type commands or understand AI to use Bob. If a word is new to you, there's a short glossary at the end.

Bob is a helper who lives on your own PC. He chats, plans, researches, writes and fixes code, looks at pictures, paints new ones, edits them, makes short video clips and talks out loud. He does all of it on your own computer, so your chats and files stay with you.

Two promises run through everything Bob does:

- **Nothing leaves your PC unless you say so.** Bob only goes online when you click: to download something you picked, to research something you asked about, or to use a cloud helper you switched on yourself.
- **Nothing extra is switched on until you switch it on.** Anything optional starts off. Bob may suggest something, but you decide.

---

## 1. Getting started

1. Download Bob's zip from the Releases page, unzip it anywhere you like, and double-click **Bob.exe**.
2. Bob opens in his own window. The first time, he looks at your graphics card and suggests a **starter set**: the models that suit your PC.
3. Click **Equip starter set**, look over the list, and confirm. Every download shows a progress bar, its size, its speed and how long is left.
4. When the downloads finish, say hello.

You can close Bob while things download. Unfinished downloads wait, paused, and carry on when you press Resume.

### What do I need?

- Windows 10 or 11 (64-bit).
- **32 GB of memory (RAM)** is what the starter sets are planned around. Less can work for chat, but pictures and video need the room.
- Space on your drive: about 8 GB for the basics, 30 to 60 GB if you want pictures and video too.
- A graphics card is **optional**. Bob can chat, plan, research, read pictures and talk with no graphics card at all. An NVIDIA card makes him much faster and lets him paint and film.

---

## 2. Finding your way around

Bob's window has three parts:

- **The menu on the left.** Chat, Tasks, Topics, References, Get models, Style, Settings, and so on. Fold it down to icons with the ‹ button (or Ctrl+B).
- **The chat in the middle.** Type and press Enter. Shift+Enter starts a new line.
- **Now running on the right.** What Bob is doing, what's downloading, and how full your graphics card is. Hide it with Ctrl+J.

Handy things in the chat:

- Every message and every piece of code has a **Copy** button. This helps a lot over remote desktop apps, where right-click and Ctrl+C often don't work.
- Links and files Bob mentions are **clickable**. A file gets a little card with a preview, **Open**, **Show in folder** and **Copy path**.
- 📎 attaches a picture, and 🎙 lets you talk instead of typing.
- You can send as many messages as you like. Each one becomes a task, and Bob works through them in order. None get lost.

### Settings, Get models and Style

These open as a page in the middle of the window, in place of the chat. **← Back to chat** (or Esc, or Chat in the menu) takes you back. A bar along the top of the page, which stays put while you scroll, jumps between Equip Bob, the model pages, Style and Settings, so clicking Bob's picture gets you everywhere too.

- **Get models:** Equip Bob, the model shops (Voice & conversation, Coding, Seeing pictures, Pictures & video) and **On this PC**.
- **Settings** starts as one short page showing what's set now: Bob's voice (with **Play sample** and **Change**), his look, the colours, animations, the cat's name, one brain, launch on start-up and checking for updates (both off unless you turn them on), and the version, graphics card and disk space, with **Check for updates** and **Run first-time setup**.
- **Show advanced settings** (off unless you turn it on, and remembered) adds a search box and the rest: Brains (model roles, session brains, context), Voice details, Look & feel, Engines & speed, Connections (ComfyUI, cloud helpers), Hands, Housekeeping and Remove Bob. Longer explanations fold behind **More**.

---

## 3. Equip Bob: choosing his models

Bob uses different AI **models** for different jobs, the way a person might use a different tool for each task. **Equip Bob** shows them like a character sheet in a game: a picture of Bob with a slot for each job.

**To open it**, click Bob's picture (or click **Get models** in the left menu: it opens on Equip Bob).

### The slots

| Slot | What it does |
|---|---|
| 🧠 Brain | Thinks, chats and plans. Everything else hangs off this one. |
| ⚡ Quick brain | A small, fast brain for when the graphics card is busy (painting, or you're gaming). |
| 🔭 Deep thinking | The strongest thinker, for hard problems. Optional. |
| 🔨 Coding | Writes and fixes code. If it's empty, the Brain codes. |
| 🧐 Second look | Checks code and plans before you rely on them. Optional. |
| 👁 Eyes | Looks at pictures and screenshots you attach. |
| 🗂 Memory | Helps Topics and search find things by meaning, not just exact words. |
| 👂 Ears | Turns your voice into text. |
| 🔊 Voice | Reads his replies aloud. |
| 🎨 Painter | Paints new pictures. |
| ✂ Picture editor | Changes a picture you give him, or keeps a character looking the same across pictures. |
| 🎞 Video | Makes short clips. |
| 🎵 Music and 💥 Sound effects | Optional extras. |

### How to equip something

- **Click a slot**, then click a model in the list to put it there. You can also **drag** a model onto a slot.
- Models already on your PC are ready to go. Models you don't have yet show a **Get** button. Nothing downloads until you confirm.
- **One model can fill several slots.** For example, Gemma 4 E4B can be the Brain, the Quick brain, the Eyes and the Ears all at once. Bob offers this with "Also use it for…". That's the trick that makes small PCs work well.
- To empty a slot, use the **✕** on it. The Brain can't be emptied, because Bob needs something to think with.
- The bar along the bottom shows whether everything fits on your graphics card at the same time. If it doesn't, that's fine: Bob takes turns, putting one model away while another works.
- Prefer a plain list? There's a button for that at the top.

Anything your PC can't run is greyed out, and Bob won't try to use it.

### Starter sets

A starter set is a ready-made selection for your kind of PC. Bob picks the right one by reading your graphics card. You can untick anything you don't want before you confirm.

Everything in the starter sets is free to use, **including for commercial work** (selling what you make).

**The base, for every PC (no graphics card needed):**

| Job | Model | Download |
|---|---|---|
| Brain, Quick brain, Eyes, Ears | Gemma 4 E4B | about 6.6 GB |
| Voice | Kokoro (22 natural English voices) | about 0.4 GB |
| Memory | Nomic Embed Text | about 0.3 GB |

With just these, Bob can chat, plan, research the web, read pictures, hear you and talk back.

**Add-ons by graphics card:**

| Job | 16 GB card or more | 8 GB card | 6 GB card (most laptops) |
|---|---|---|---|
| Brain | Gemma 4 26B | Gemma 4 E4B | Gemma 4 E4B |
| Coding | Qwen3 Coder 30B | Qwen3 Coder 30B (slower, runs mostly in RAM) | Qwen2.5 Coder 7B |
| Painter | Z-Image Turbo | Z-Image Turbo, 8 GB version | Z-Image Turbo, 6 GB version |
| Picture editor | Qwen Image Edit | FLUX.2 klein 4B | FLUX.2 klein 4B, 6 GB version |
| Video | Wan 2.2 5B | Wan 2.2 5B, small card version | the same, left unticked (very slow) |

The "8 GB" and "6 GB" versions are the same models **squeezed** to fit smaller cards. Pictures lose a little fine detail but look much the same.

**How long things take** on a small card is a rough guess for now (these haven't been timed on every card yet). On an 8 GB card, expect roughly half a minute to a minute per picture, a minute or two per edit, and ten minutes or more for a few seconds of video. A 6 GB card is slower again. While Bob paints, he puts his chat brain away to make room, so chat waits until the picture is done.

---

## 4. Bob's personality

Bob has a dry, curious, slightly nerdy personality. You can turn that up or down.

Click Bob's picture and look at **Attributes** on the left. There are ten dials, each from 0 to 4. The middle (2) is Bob as he comes.

| Dial | Low end | High end |
|---|---|---|
| Dry wit | Plain | Bone dry |
| Puns | None | Relentless |
| Tangents | On rails | Scenic route |
| Outlook | Gloomy robot | Sunny |
| Nerd references | Hidden | Full nerd |
| Talkative | Terse | Chatty |
| Manner | Formal | Casual |
| Copied-mind musings | Never | Often |
| Builder itch | Calm | Must build |
| Curiosity | Just the job | Endlessly curious |

As you move a dial, Bob's **greeting** changes so you can hear the difference right away. There are presets too, such as *Replicant on a deadline* (short and to the point), *Butler mode* (formal and polite) and *Pun-dit* (you've been warned). **Reset to Bob** puts everything back.

Bob also knows what he looks like. Change his look under **Style** and he'll comment on it, once.

---

## 5. Sessions: matching Bob to what you're doing

Next to Bob's name is the **session** picker. A session tells Bob how to share your PC with you.

- **Normal:** everyday use.
- **Art:** Bob keeps chatting on his Quick brain so the big graphics work (painting, video) gets the card.
- **Coding:** the Coding brain leads.
- **Office:** documents, spreadsheets and planning.
- **Deep thought:** the strongest brain, for hard questions. Slower.
- **Light / gaming:** Bob uses as little of your PC as he can, so your games run well.

Bob may suggest a session, but he never switches by himself.

---

## 6. Topics and housekeeping: Bob's memory

### Topics

**Topics** collects what you and Bob have talked about, grouped by project. Each topic has:

- a short note on where things landed (you can edit it),
- open questions,
- pictures from that topic,
- links back to the chat moments it came from.

You can rename, merge, pin and drag messages between topics. One **search box** looks through chats, summaries, topics, pictures and notes all at once. **Past chats** reopens an old conversation.

To make Bob forget something, either use **Forget** on a topic or simply say "forget what we said about…". You always see a preview first, and you can choose to keep just the short note or remove everything.

### Housekeeping (off unless you turn it on)

Long chats and old files pile up. Housekeeping is Bob tidying up while he's idle. It's **off by default**. When you turn it on, Bob can:

- sum up the older part of a long chat instead of forgetting it,
- file chats under Topics,
- move lasting facts into his memory,
- find things that haven't come up for a while: old chats, pictures and sounds he made, finished tasks, old log lines and repeated notes.

For each kind of thing you choose how old is "old" (from minutes to months), and whether Bob should **ask me first** (you get a list with a tick and a cross for each item) or **tidy automatically**.

Safety nets:

- Anything removed goes to the **Recycle Bin**, so you can get it back.
- **Pinned** chats, pictures and topics are never touched.
- Every action is written in Bob's **logbook**.

There's also a **Tidy up** button if you'd rather do it now, by hand.

---

## 7. Pictures, edits and video

Just ask in the chat: "paint a lighthouse at dusk", "make this picture look like winter", or "make a short clip of the cat stretching".

- **References:** keep pictures of characters, places and styles on the **References** shelf. Ask Bob to use one and he'll keep that look in new pictures.
- **Edits:** attach a picture with 📎 and say what to change. The **Picture editor** slot needs a model for this.
- **Video:** clips are short (a few seconds). On small cards, keep them short; Bob tells you roughly how long a job will take before he starts.

If a slot is empty, Bob tells you which model would fill it.

---

## 8. Hands: letting Bob do things on your PC (opt-in)

Hands are Bob's way of doing things for you on your PC rather than just talking about them. They arrive step by step in newer versions:

- **Files:** zip and unzip, move, copy, rename, and tidy folders like Downloads.
- **Run:** run a program, command or script you've approved.
- **Schedules:** do a job at a set time.
- **Apps:** click and type in another program for you.

Hands are built to be careful:

- **Every Hand is off** until you switch it on in Settings (Show advanced settings, Hands), and each one has an off switch you can flip at any time.
- **Bob shows you exactly what he's about to do** (a preview card) and waits for your click.
- "**Allow for the rest of this job**" is something you have to choose, and it ends when the job ends.
- File changes keep an **undo** list, and anything removed goes to the Recycle Bin.
- Some things are **never allowed**, even if you approve: nothing that needs administrator rights, and nothing on Bob's list of destructive commands.
- Folders you mark **read-only** stay untouched.
- Everything is written in the logbook.

Even without Hands, Bob **asks before doing anything outside his own folder**.

**Self-test:** Settings → Show advanced settings → Hands → **Run the self-test** checks, in a throwaway folder of dummy files, that the Recycle Bin and Undo, tidying, running a program and Stop all work on your PC. It shows a pass or fail list in plain words and removes the folder afterwards. No Hand needs to be on, and nothing of yours is touched.

---

## 9. Voice

- **Read aloud:** Bob can speak his replies. Kokoro is the recommended voice (22 voices, runs on the processor). Every voice has a **Play** button with a short sample (the same line in each voice) that works before you download anything.
- **Talk to Bob:** with the Ears slot filled, use 🎙 or say "Hey Bob" hands-free (if you turn that on).

---

## 10. Optional extras (all off until you turn them on)

- **Launch on start-up**: Bob opens when Windows starts.
- **Cloud helpers**: hand a very big job to a paid online AI, using your own key. Bob asks you each time, because it costs money and sends that job off your PC.
- **Music and sound effects**: extra downloads for the audio tools.
- **Extra voices.**
- **Advanced workshop**: if you use ComfyUI, Bob can run its workflows for you.
- **Phone access** over a private network.
- **Check for updates when Bob starts.** Updating always waits for your click.

---

## 11. Updating and removing Bob

**Updating:** Settings → **Check for updates**. If there is one, click **Update Bob** and watch the steps. Your chats, models and settings are kept. If Bob is busy, he asks whether to restart now, wait until he's finished, or leave it for later.

**Removing:** Settings → Show advanced settings → Remove Bob → **Remove Bob…**. Bob's program is removed. Two boxes, unticked unless you tick them, also remove his chats and settings and the models he downloaded. Those go to the Recycle Bin.

---

## 12. When something goes wrong

| What you see | What to try |
|---|---|
| A download stopped | Press **Resume** in Now running. It carries on from where it stopped. |
| Pictures or video are very slow | Normal on small cards. Use the **Art** session, keep clips short, or use smaller picture sizes. |
| "Out of graphics memory" | Close games or other graphics-heavy apps, or pick the smaller (6 GB) version of the model in Equip Bob. |
| Bob can't hear you | Fill the 👂 Ears slot (Gemma 4 E4B does it). |
| Bob can't paint or edit | Fill the 🎨 Painter or ✂ Picture editor slot, and get the painter engine when Bob offers it. |
| Windows blocks Bob | Bob.exe is the official Electron program renamed, which Windows usually trusts. If it's blocked anyway, see the Releases page notes. |

---

## Glossary

- **Model:** the "brain file" that does one kind of AI job. Bigger models are usually smarter but slower and need more memory.
- **Graphics card (GPU) and graphics memory (VRAM):** the part of your PC that makes AI fast. The amount of graphics memory (6 GB, 8 GB, 16 GB) decides which models fit.
- **RAM:** your PC's main memory. Bob can use it for parts of a model that don't fit on the graphics card. It works, but more slowly.
- **Squeezed (GGUF) version:** a smaller copy of a model that fits small cards, with a little less detail.
- **Engine:** the program that runs a kind of model, for example the painter engine for pictures. Bob offers it when a model needs it.
- **Commercial use:** using what you make for money. All starter set models allow it. A few optional extras don't, and Bob marks those.

## Licences of the starter set models

| Model | Licence |
|---|---|
| Gemma 4 (E4B and 26B) | Apache 2.0 |
| Qwen3 Coder 30B, Qwen2.5 Coder 7B | Apache 2.0 |
| Nomic Embed Text | Apache 2.0 |
| Kokoro | Apache 2.0 (voices); MIT (the version Bob downloads) |
| Z-Image Turbo, all versions | Apache 2.0 |
| FLUX.2 klein 4B | Apache 2.0. The bigger FLUX.2 klein 9B and FLUX.2 dev are **not** free for commercial use, so Bob doesn't put them in starter sets. |
| Qwen Image Edit 2509 | Apache 2.0 |
| Wan 2.2 5B, all versions | Apache 2.0 |

Each model keeps its own licence, and Bob shows it, with the download size, before you confirm a download.
