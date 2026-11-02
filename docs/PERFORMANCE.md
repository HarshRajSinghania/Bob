# How Bob stays fast and light

Bob runs AI models on your own PC, and your PC has other jobs too: games, a browser, maybe Unreal or Blender. So Bob was built with two goals that pull against each other:

1. **Answer quickly.**
2. **Get out of the way.** Hold as little graphics memory as possible, and let it go the moment he's done.

This page explains what we did about both, with the numbers we measured. It's written for curious people and programmers. You don't need any of this to use Bob, because the defaults already do the right thing.

**The reference PC** for every number here: Ryzen 7 9800X3D, RTX 5070 Ti (16 GB), 32 GB DDR5, NVMe SSD, Windows 11. Your numbers will differ, so Bob has a built-in **Test Bob's speed** button to measure your own (see [Measure it yourself](#measure-it-yourself)).

A few words used below:

- **Brain**: a language model (an LLM). Bob uses different ones for different jobs.
- **Graphics memory (VRAM)**: the memory on the graphics card. Models are fastest when they fit entirely inside it.
- **Tokens**: pieces of words. Speeds are in tokens per second (tok/s); a token is roughly three quarters of a word.
- **First word**: time from pressing Enter to the first word of the reply appearing. **Full answer**: time until the reply is finished.
- **Cold / warm**: cold means the brain had to load first; warm means it was already loaded.

---

## The headline numbers

| What | Before | Now |
|---|---|---|
| Gaming session, "hi", brain already loaded | about 30 s (old Qwen3 4B thought first, even when told not to) | **0.1 s to the first word, 1.8 s to the full answer** (Qwen3 4B Instruct 2507) |
| Gaming session, "hi", brain not loaded yet | 29 to 39 s | **1.7 s / 2.8 s** |
| Gaming session, a 4,000-token chat, warm | (not usable) | **0.2 s / 2.8 s** |
| 26B main brain, generation speed | 5 tok/s (spilled out of the card at 131K context) | **71 to 75 tok/s** (32K context, fits on the card) |
| Quick replies on Low effort | about 200 tokens of thinking before the first word | no thinking step: the first word comes straight away |
| Prompt reading on the 30B coding brain | about 1,500 tok/s | **about 2,800 tok/s** (engine tuning) |
| Task queue file after a long day | 6.8 MB | **0.23 MB** |
| Graphics memory Bob holds while idle | a whole brain, all day | **nothing** (Free memory when Bob is idle, on by default) |

The Gaming session runs **entirely on the processor**, so those Gaming times come with zero graphics memory used.

---

## Picking the Gaming brain

The Gaming session's promise is simple: **the graphics card belongs to your game.** Nothing of Bob's goes on it. He still chats and listens, but on the processor (CPU), with a small brain in system RAM. Pictures, clips, music and anything at Medium effort or higher wait in Tasks until you switch back. Nothing is dropped.

A brain on the processor is much slower than on the card, so the choice of brain decides whether Gaming feels alive or broken.

### What we measured

Two things matter for a chat brain:

- **Time to first thought**: how long until Bob starts answering. This is what makes him feel responsive.
- **Time to full answer**: how long until he's done.

We timed each candidate on the processor, with Bob idle and one model at a time, for a short message ("hi") and for a realistic 4,000-token chat. Each was measured cold (loading first) and warm.

| Brain (on the processor) | "hi" cold: first word / full answer | "hi" warm | 4K-token chat cold | 4K-token chat warm | RAM | Load |
|---|---|---|---|---|---|---|
| **Qwen3 4B Instruct 2507** (picked) | 1.7 / 2.8 s | 0.1 / 1.8 s | 2.1 / 5.6 s | 0.2 / 2.8 s | 3.5 GB | 1.1 s |
| Qwen3 1.7B | 1.7 / 2.1 s | 0.1 / 0.5 s | | | 1.4 GB | |
| Gemma 4 E4B | 6.7 / 7.6 s | | | | | |
| Qwen3 4B (the older "hybrid" version) | about 30 s, because it thinks first | | | | 2.5 GB | |

### Can it use tools?

Speed isn't enough. Bob does things by calling tools (set a reminder, show a picture, look at his to-do list), so a Gaming brain that fakes tool calls is worse than a slow one. We ran a 25-case routing test that checks whether a brain picks the right tool:

| Brain | Right (out of 25) | Notes |
|---|---|---|
| Gemma 4 E4B | 24 | Bob's everyday Quick brain on the card. The bar to beat. |
| Qwen3 4B (hybrid) | 23 | Accurate, but about 8 times slower: it ignored "don't think" and its thinking leaked into the reply. |
| Qwen3 1.7B | 22 | Very fast, but in several cases it wrote fake tool calls as plain text instead of real ones. |

### Why Qwen3 4B Instruct 2507

- The **2507 Instruct** version is the same 4B model family, trained to answer directly with no thinking phase. That removes the 30-second "let me think about this" that made the older 4B unusable on the processor.
- It is about as fast to the first word as the 1.7B, and the 4B family uses tools far more reliably than the 1.7B.
- At 3.5 GB of RAM it leaves plenty of room for a game on a 32 GB PC.
- Gemma 4 E4B is a great brain on the card, but on the processor it takes about 4 times longer to start answering.

You can change it: Settings, Show advanced settings, Brains, Session brains.

### The card or processor rule

Where each brain runs, in plain terms:

| Session | Chat brain runs on | Why |
|---|---|---|
| Normal | the graphics card | Fastest replies. Freed when idle. |
| Art | the processor | The card is kept for pictures, video and sound, so Bob can keep talking while a picture paints. |
| Coding | the graphics card | One big coding brain with a long memory. Small side jobs go to the processor. |
| Office | the graphics card | One all-rounder brain, no swaps. |
| Gaming | the processor, always | The card belongs to your game. |

**Why not run everything on the processor all the time?** Because long prompts are where the processor hurts. With a 4,300-token prompt, Gemma 4 E4B takes about **31 s** to the first word on the processor and about **4.4 s** on the card. Short chats on a small instruct brain are fine on the processor; long ones on a bigger brain are not. So in Normal it's a choice: **Keep the graphics card free for quick answers** (Settings, Engines & speed) moves Low-effort replies to the processor, and it is off by default.

---

## Keeping graphics memory free

### Bob lets go when he's quiet

**Free memory when Bob is idle** is on by default. After a quiet time you choose (1 minute to 1 hour, 5 minutes to start with), Bob unloads his Quick brain and holds **nothing** on the graphics card. Typing loads it again.

What that costs: the Quick brain (Gemma 4 E4B) loads in about **6 s** and uses 6.2 GB. Unloading takes **0.3 s**.

Optional, off by default: **Get Bob ready while you type** starts that load the moment you start typing, so most of the 6 s is hidden behind your typing.

### Big brains only for big jobs

The 26B brain (Medium effort and up) and the coding brain load **only for the job that needs them**, then go about 2 minutes later. The 26B takes 22 to 29 s to load and uses 15.6 GB, nearly the whole card, so keeping it around "just in case" would starve everything else.

### Back to the Quick brain after every job

After a big job or a picture, Bob goes straight back to the small Quick brain. Your next chat message gets a fast answer instead of waiting behind a reload.

### Pictures don't make you wait twice

A picture with Z-Image Turbo (1024 px, 8 steps) takes about 28 to 31 s in total on the reference PC: about 6 to 8 s to load, 8 to 9 s to read the prompt, 16 to 18 s to paint and 1.7 s to decode, peaking at 13.5 GB.

The painter and the chat brain can't share a 16 GB card, so Bob hands the card over. Three things keep that hand-off cheap:

- **Show pictures without waiting for Bob's brain** (on by default): the finished picture appears straight away with a short line. Bob doesn't reload his brain just to say "here it is". That reload was about 6 s on the Quick brain and 22 to 29 s on the 26B.
- **"Make another picture?"**: for about 10 seconds after a picture Bob asks. Say yes and the picture model stays ready for 2 minutes, so the next one skips the load. Say no (or ignore it) and it's freed at once.
- **Careful hand-offs**: the brain gives the card to the painter before it loads, and Bob checks free system RAM too, not just graphics memory.

An optional quick-load version of the picture model (Q8) is an 11 GB download instead of 20 GB, loads faster, and leaves room for the Quick brain alongside it.

We also measured whether merging the chat and picture engines into one process would help. On this PC the swap is about 6 s of a 36 s picture (17 to 20%), and both still can't fit on the card at once, so we kept them separate and made the hand-off cheaper instead.

---

## Engine tuning

Bob ships his own engine, **llama.cpp**, so he needs nothing else installed. (Ollama still works if you already use it.)

- **Fit to free graphics memory** (`--fit`, on): llama.cpp places the model's layers around whatever else is using the card right now, instead of a fixed split. We found that forcing every layer onto the card (`-ngl 999`) quietly switched this off, so Bob no longer sets it.
- **32K context by default.** At 131K, the 26B brain no longer fit on a 16 GB card. The overflow went to shared system memory, and speed fell to **5 tok/s**. At 32K it uses 13.8 GB on the card, runs at **71 to 75 tok/s** and is ready in about 23 s. For normal chats, 32K was also about 15% faster than 128K. Office keeps 64K, and Coding keeps the engine's full default. Each session can be changed in Settings, Brains.
- **One chat gets the whole context** (`-np 1`), instead of splitting it across parallel slots Bob never uses.
- **Threads and batch sizes**: 8 threads, batch and micro-batch 2048. Gemma 4 26B runs at about 74 tok/s, on a par with Ollama's 77. Prompt reading on the 30B coding brain went from about 1,500 to about 2,800 tok/s.
- **Compact memory for the chat history** (8-bit KV cache) and flash attention, so long chats take less graphics memory.
- **A thinking cap on Medium effort**: at most about 1,500 tokens of thinking, then Bob is told to answer.
- **No thinking on Low effort**: quick replies skip the thinking step entirely. Gemma 4 used to spend about 200 tokens thinking before the first word.
- **Speculative decoding** (off, experimental): a small draft brain guesses ahead and the big one checks. It's often 1.5 to 2 times faster with identical answers, but it depends on the pair, so measure it.

For tinkerers, every one of these is in Settings, Show advanced settings, Engines & speed. The exact command Bob used is saved next to his notes, so you can see what ran.

---

## Shorter prompts, faster first words

Every word Bob sends to the brain has to be read before the reply starts. So:

- **Slim tools**: each chat starts with a small core of tools, and Bob adds the picture, file and Hands groups only when a message needs them. With every tool attached, a prompt is about 5,000 tokens; with the slim set it's about 2,000. On the processor, that difference is seconds.
- **Give Bob all his tools at once** (off) is there if a brain ever can't find a tool.
- **Slim task records**: finished jobs keep a short record instead of their whole transcript, which took the task queue from 6.8 MB to 0.23 MB and keeps start-up and the Tasks page snappy.

---

## Opt-in speed switches

These are all **off until you turn them on** (Settings, Show advanced settings, Engines & speed). Bob never changes your PC's settings by himself.

- **Get Bob ready while you type**: starts loading and reading his instructions as soon as you start typing. On the processor he also keeps a copy of that reading on disk, so the next start is quicker.
- **Let games go first**: when Bob works on the processor, he uses fewer cores at lower priority. His replies may be a little slower; your frame rate stays smooth. Worth turning on if you game with Bob open.
- **Match picture settings to my graphics card**: big cards keep the picture model in graphics memory (faster). Cards with 8 GB or less make pictures at 768 px so they fit. If a picture fails with these settings, Bob goes back to the usual ones.

---

## Measure it yourself

- **Test Bob's speed** (about a minute): Bob frees his brain, wakes it as if you'd started typing, and times the load, the first word, the full answer and a second reply. Your last 6 results are kept in a table along with the switches that were on, so you can test, change one thing, and test again.
- **Check this PC**: looks for things that slow AI down and explains how to fix each one. It checks for memory running below its rated speed (EXPO or XMP off in the BIOS), an old NVIDIA driver, a laptop on battery, models on a slow drive, and other apps holding graphics memory. It only reads; it never changes Windows or driver settings.

Neither one goes online.

---

## Reliability

Speed is no good if a job falls over halfway.

- **Pinned downloads**: every model and engine file has a known size and SHA-256 checksum. Bob checks each one after downloading and deletes anything that doesn't match. Downloads resume after a pause, a dropped connection or a restart, and nothing downloads until you confirm it.
- **Engine hiccups**: if the engine drops out during a hand-off, Bob reloads it and tries once more. If a chosen brain won't load at all, he falls back to the main brain.
- **Strict tool lists**: Bob never sends an empty choice list in a tool's description. llama.cpp rejected the whole request when that happened.

---

## What's next

Ideas we've measured but are holding for later:

- **A draft brain for the 26B** (multi-token prediction): about 1.25 to 1.3 times faster on code for about 1 GB more graphics memory. It needs engine support first, and it would be opt-in.
- **Keeping the picture engine loaded between pictures**: it could skip 13 to 17 s of loading and prompt reading on repeat pictures, but only on cards big enough to hold the painter and a brain together.

Numbers on this page come from Bob's own test runs. If yours look very different, run **Check this PC** first. It's usually memory speed or another app holding the card.
