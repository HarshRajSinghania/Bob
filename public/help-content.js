// Bob's in-app Help: every entry, in plain words (docs/SETTINGS-STYLE.md glossary). Each entry has an id (the "?"
// buttons open Help at it), a title, extra search words, and its text as simple HTML. Keep docs/USER-GUIDE.md in step.
export const HELP = [
  { id: 'start', group: 'Getting started', title: 'Getting started', words: 'first time setup install begin welcome starter',
    html: `<p>Bob is a helper who lives on your own PC. He chats, plans, researches, writes and fixes code, looks at pictures, paints, edits, makes short clips and talks out loud, all on your own computer.</p>
<ol><li>Open Bob from the Start menu.</li><li>The first time, he reads your graphics card and RAM and suggests a <strong>starter set</strong>: the models that suit your PC.</li><li>Untick anything you don't want, then confirm. Each download shows its size, speed and time left.</li><li>When the downloads finish, say hello.</li></ol>
<p>Two promises run through everything: <strong>nothing leaves your PC unless you say so</strong>, and <strong>nothing extra is switched on until you switch it on</strong>.</p>
<p>To see the first-time setup again: Settings, <strong>Run first-time setup</strong>.</p>` },

  { id: 'around', group: 'Getting started', title: 'Finding your way around', words: 'menu layout now running chat copy paste fold panel',
    html: `<ul><li><strong>The menu on the left:</strong> Chat, Tasks, Downloads, References, Topics, Tidy up, Get models, Settings, Style and Help. Fold it to icons with Ctrl+B.</li>
<li><strong>The chat in the middle.</strong> Enter sends; Shift+Enter starts a new line. Send as many messages as you like: each becomes a task, and Bob works through them in order.</li>
<li><strong>Now running on the right:</strong> tasks, downloads, and how full your graphics card and RAM are. Hide it with Ctrl+J.</li></ul>
<p>Every message and every piece of code has a <strong>Copy</strong> button, which helps over remote desktop apps such as Parsec. Files Bob mentions get a card with <strong>Open</strong>, <strong>Show in folder</strong> and <strong>Copy path</strong>.</p>` },

  { id: 'keys', group: 'Getting started', title: 'Keyboard shortcuts', words: 'keys shortcut ctrl f1 escape',
    html: `<table><tr><th>Keys</th><th>What it does</th></tr>
<tr><td>F1</td><td>Opens this Help</td></tr><tr><td>Ctrl+B</td><td>Folds or opens the left menu</td></tr><tr><td>Ctrl+J</td><td>Shows or hides Now running</td></tr>
<tr><td>Esc</td><td>Back to the chat from Settings, Get models, Style or Help</td></tr><tr><td>Enter / Shift+Enter</td><td>Send / new line</td></tr></table>` },

  { id: 'recommended', group: 'Models', title: 'How Bob picks models for your PC', words: 'recommended fits your card does not suit star badge show models that don\'t suit compatible slot job score',
    html: `<p>On <strong>Get models</strong> and in <strong>Equip Bob</strong>, each model can carry one of these:</p>
<ul><li><span class="tag rec">★ Recommended for your PC</span> Bob's pick for that job on your PC. In Equip Bob it reads <em>Recommended for this job on your PC</em>, because the best pick depends on the job.</li>
<li><span class="tag">Fits your card</span> It runs well here too. It just isn't the first pick.</li>
<li><span class="tag warn">Doesn't suit this PC</span> It wants more graphics memory or RAM than this PC has, so it would be slow or wouldn't run. A one-line reason sits under it.</li>
<li><span class="tag bad">Can't install on this PC</span> Not enough free disk space, or it needs Windows.</li></ul>
<p><strong>How the pick is made, for brains:</strong> a model scores higher the more jobs it can cover, because one brain doing several jobs means Bob stops to swap brains less. It also scores higher the less it takes from your PC, and much lower if it would spill out of the graphics card into RAM. Bigger brains get a bonus for jobs that need careful thinking (Brain, Deep thinking, Coding, Review). The Quick brain only cares about being light. On small cards (8 GB or less), Bob prefers brains that leave room for longer chats. On a 6 GB card, like many laptops, that makes the light Qwen3 4B the Brain, and Gemma 4 E4B loads only to see pictures and hear you.</p>
<p><strong>For pictures, video and voices</strong>, the pick comes from the starter set for your graphics card.</p>
<p><strong>Each slot only lists models that can do that job.</strong> A brain that can't see pictures never shows under Seeing pictures, and a big brain never shows under Quick brain. Models that don't suit this PC are hidden until you turn on <strong>Show models that don't suit this PC</strong> (off unless you turn it on). Models already on your PC always show.</p>
<p>Bob judges your PC by the graphics card and RAM shown at the top of each model page.</p>` },

  { id: 'equip', group: 'Models', title: 'Equip Bob: choosing his models', words: 'slots paper doll kit drag brain quick deep coding second look eyes memory ears voice painter editor video music sound',
    html: `<p>Bob uses a different model for each kind of job. <strong>Equip Bob</strong> shows them like a character sheet: Bob in the middle, with a slot for each job. Click Bob's picture, or Get models in the menu, to open it.</p>
<table><tr><th>Slot</th><th>What it does</th></tr>
<tr><td>🧠 Brain</td><td>Thinks, chats and plans. Everything else hangs off this one.</td></tr>
<tr><td>⚡ Quick brain</td><td>A small, fast brain for the Art and Light / gaming sessions.</td></tr>
<tr><td>🔭 Deep thinking</td><td>The strongest thinker, for the Deep thought session.</td></tr>
<tr><td>🔨 Coding</td><td>Writes and fixes code. Empty means the Brain codes.</td></tr>
<tr><td>🧐 Review</td><td>Checks code and plans before you rely on them.</td></tr>
<tr><td>👁 Seeing pictures</td><td>Looks at pictures and screenshots you attach.</td></tr>
<tr><td>🗂 Memory (finding past chats)</td><td>Matches what you say to past Topics by meaning.</td></tr>
<tr><td>👂 Hearing you</td><td>Turns your voice into text.</td></tr>
<tr><td>🔊 Voice</td><td>Reads his replies aloud.</td></tr>
<tr><td>🎨 Painter, ✂ Picture editor, 🎞 Video</td><td>Paints, edits pictures, makes short clips.</td></tr>
<tr><td>🎵 Music, 💥 Sound effects</td><td>Optional extras from the audio tools.</td></tr></table>
<ul><li><strong>Click a slot</strong>, then click a model in the list (or drag it onto the slot). Nothing is equipped without you.</li>
<li>Models you don't have yet show a <strong>Get</strong> button. Nothing downloads until you confirm.</li>
<li><strong>One model can fill several slots</strong>, and Bob offers this with <em>Also use it for</em>. That's what makes small PCs work well.</li>
<li>To empty a slot, use the <strong>✕</strong> on it. The Brain can't be emptied.</li>
<li>The bar shows whether everything equipped fits on the graphics card at once. If not, Bob takes turns (about 20 seconds a swap).</li></ul>` },

  { id: 'starter', group: 'Models', title: 'Starter sets', words: 'starter set pack 16 gb 8 gb 6 gb laptop processor only commercial',
    html: `<p>A starter set is a ready-made selection for your kind of graphics card: 16 GB or more, 8 GB, 6 GB (most laptops), or no graphics card. Bob picks the set by reading your card, and marks it <em>(this PC)</em>. You can pick another set and untick anything before you confirm.</p>
<p>Everything in the starter sets is free to use, including for commercial work. The "8 GB" and "6 GB" versions are the same models squeezed to fit smaller cards: pictures lose a little fine detail but look much the same.</p>` },

  { id: 'memory-brains', group: 'Models', title: 'Memory, brains and swaps', words: 'free memory idle unload small brain big brain swap one brain context graphics memory ram keep light tools all tools at once',
    html: `<ul><li><strong>Free memory when Bob is idle</strong> (top of the chat, on unless you turn it off): while Bob is quiet nothing stays on your graphics card. Typing loads his small brain again in a few seconds.</li>
<li><strong>Big brains</strong> (Coding, Deep thought) load only for their job and go about 2 minutes later.</li>
<li><strong>Brain swaps:</strong> when a job needs a different brain, Bob puts one away and loads the other, usually 10 to 20 seconds. Using one brain for several jobs avoids that.</li>
<li><strong>One brain (snappier)</strong> in Settings makes every copy of Bob use the main brain, so he never swaps.</li>
<li><strong>Context</strong> (how much Bob keeps in mind): more lets him read longer files and chats, but uses more graphics memory and loads slower. Set it per session in Settings, Brains.</li>
<li><strong>Tools only when needed:</strong> Bob starts each chat with a few everyday tools, and adds the picture, file and Hands ones when a message needs them. That leaves more room for your chat. To send them all every time, turn on <strong>Give Bob all his tools at once</strong> in Settings, Show advanced settings, Engines &amp; speed.</li>
<li><strong>Now running, Memory</strong> shows how full the graphics card and RAM are, and which brain is loaded.</li></ul>` },

  { id: 'sessions', group: 'Using Bob', title: 'Sessions', words: 'session normal art coding office deep thought light gaming',
    html: `<p>The <strong>Session</strong> picker at the bottom of the menu tells Bob how to share your PC with you.</p>
<ul><li><strong>Normal:</strong> everyday use.</li><li><strong>Art:</strong> Bob chats on his Quick brain so painting and video get the graphics card.</li><li><strong>Coding:</strong> the Coding brain leads.</li><li><strong>Office:</strong> documents, spreadsheets and planning.</li><li><strong>Deep thought:</strong> the strongest brain, for hard questions. Slower.</li><li><strong>Light / gaming:</strong> Bob uses as little of your PC as he can.</li></ul>
<p>Bob may suggest a session, but he never switches by himself.</p>` },

  { id: 'personality', group: 'Using Bob', title: 'Bob\'s personality', words: 'attributes dials wit puns presets reset',
    html: `<p>Click Bob's picture and look at <strong>Attributes</strong>. Ten dials, each from 0 to 4, turn his wit, puns, tangents, outlook, nerd references, chattiness and more up or down. His greeting changes as you move a dial so you can hear the difference. <strong>Reset to Bob</strong> puts everything back.</p>` },

  { id: 'topics', group: 'Using Bob', title: 'Topics, past chats and forgetting', words: 'topics search past chats forget pin merge rename',
    html: `<p><strong>Topics</strong> collects what you and Bob talked about, grouped by project, with a short note, open questions, pictures and links back to the chat. One search box looks through chats, topics, pictures and notes. <strong>Past chats</strong> reopens an old conversation.</p>
<p>To make Bob forget something, use <strong>Forget</strong> on a topic or say "forget what we said about…". You see a preview first.</p>` },

  { id: 'housekeeping', group: 'Using Bob', title: 'Housekeeping and Tidy up', words: 'housekeeping tidy old chats pictures logs recycle bin pinned',
    html: `<p><strong>Housekeeping</strong> (off unless you turn it on) lets Bob tidy while he's idle: sum up long chats, file chats under Topics and find old things. For each kind you choose how old is "old" and whether Bob asks first or tidies by himself.</p>
<p><strong>Tidy up</strong> in the menu does it now, by hand, with a tick or a cross for each item. Anything removed goes to the Recycle Bin, pinned things are never touched, and every action is in Bob's logbook.</p>` },

  { id: 'pictures', group: 'Using Bob', title: 'Pictures, edits and video', words: 'paint picture edit video clip references painter',
    html: `<p>Just ask: "paint a lighthouse at dusk", or attach a picture with 📎 and say what to change. Keep characters, places and styles on the <strong>References</strong> shelf and ask Bob to use one. Clips are a few seconds long. While Bob paints he puts his chat brain away, so chat waits until the picture is done. If a slot is empty, Bob tells you which model would fill it.</p>` },

  { id: 'voice', group: 'Using Bob', title: 'Voice: listening and reading aloud', words: 'voice kokoro piper read aloud listen hey bob microphone ears sample',
    html: `<ul><li><strong>Read aloud</strong> (menu): Bob speaks his replies. Kokoro is the recommended voice (runs on the processor). Every voice has a <strong>Play</strong> button.</li>
<li><strong>Talk to Bob:</strong> fill the 👂 Hearing you slot, then use 🎙 or turn on <strong>Listen</strong> for "Hey Bob" (only while the window is open).</li></ul>` },

  { id: 'hands', group: 'Hands and safety', title: 'Hands: letting Bob do things on your PC', words: 'hands files run commands schedules apps permission preview allow undo stop everything kill switch self-test read-only',
    html: `<p>Hands let Bob do things on your PC instead of only talking about them: <strong>Files</strong> (zip, move, copy, rename, tidy folders), <strong>Run</strong> (programs and scripts), <strong>Schedules</strong> (a job at a set time) and <strong>Apps</strong> (click and type in another program).</p>
<ul><li><strong>Every Hand is off</strong> until you switch it on in Settings, Show advanced settings, Hands.</li>
<li><strong>Bob shows exactly what he's about to do</strong> on a card and waits for your click. "Allow for the rest of this job" is your choice and ends with the job.</li>
<li><strong>✋ Hands</strong> at the top of the chat is a kill switch: anything running stops, waiting cards are answered No. It never switches a Hand on.</li>
<li>File changes keep an undo list; anything removed goes to the Recycle Bin. Folders you mark read-only stay untouched.</li>
<li>Some things are never allowed: anything needing administrator rights, and Bob's list of destructive commands.</li>
<li><strong>Run the self-test</strong> (Settings, Show advanced settings, Hands) checks the safety nets in a throwaway folder. Nothing of yours is touched.</li></ul>` },

  { id: 'privacy', group: 'Hands and safety', title: 'What stays on your PC', words: 'privacy online cloud network internet data keys',
    html: `<p>Bob goes online only when you click: to download something you picked, to research something you asked about, or to use a cloud helper you switched on. Cloud helpers ask you every time, show the rough cost and exactly what text would leave your PC. Bob never stores your keys.</p>` },

  { id: 'settings-everyday', group: 'Settings', title: 'Settings: the everyday page', words: 'everyday voice look theme colours animations cat one brain launch start-up updates first-time setup',
    html: `<p>Settings opens on one short page that shows what's set now:</p>
<ul><li><strong>Bob's voice</strong> with <strong>Play sample</strong> and <strong>Change</strong>.</li><li><strong>Bob's look</strong> and <strong>Theme</strong> (changed on the Style page).</li><li><strong>Animations:</strong> On, Follow Windows or Off.</li><li><strong>Bob's cat:</strong> the cat's name in his stories.</li><li><strong>One brain (snappier):</strong> no brain swaps, see <a href="#" data-helpgo="memory-brains">Memory, brains and swaps</a>.</li><li><strong>Launch Bob on start-up</strong> and <strong>Check for updates when Bob starts:</strong> both off unless you turn them on.</li><li><strong>Check for updates</strong> and <strong>Run first-time setup</strong>.</li></ul>
<p><strong>Show advanced settings</strong> (off unless you turn it on, and remembered) adds a search box and the sections below.</p>` },

  { id: 'settings-brains', group: 'Settings', title: 'Settings: Brains', words: 'model roles thinking making session brains context',
    html: `<p>The plain-list version of Equip Bob: which brain thinks for each job, which model makes pictures, clips and hearing, the brain each session keeps, and how much each session keeps in mind (context). See <a href="#" data-helpgo="equip">Equip Bob</a> and <a href="#" data-helpgo="memory-brains">Memory, brains and swaps</a>.</p>` },

  { id: 'settings-voice', group: 'Settings', title: 'Settings: Voice details', words: 'kokoro chatterbox speed hey bob read aloud listen',
    html: `<p>Bob's voice and speaking speed, and the same Listen ("Hey Bob") and Read aloud switches as the left menu. Hearing you and the other voices are on Get models, Voice &amp; conversation. See <a href="#" data-helpgo="voice">Voice</a>.</p>` },

  { id: 'settings-look', group: 'Settings', title: 'Settings: Look & feel', words: 'theme editor now running layout',
    html: `<p>Whether <strong>Now running</strong> opens by itself when a task needs you (off unless you turn it on), and a link to make your own theme on the Style page.</p>` },

  { id: 'settings-engines', group: 'Settings', title: 'Settings: Engines & speed', words: 'engine ollama llama.cpp free memory quiet keep alive downloads threads batch speculative decoding fit graphics memory',
    html: `<ul><li><strong>Free memory after Bob has been quiet for:</strong> how long the small brain stays loaded while "Free memory when Bob is idle" is on.</li>
<li><strong>Bob's engine:</strong> Ollama (if you already have it) or Bob's own (llama.cpp, nothing else needed). Takes effect next time Bob starts.</li>
<li><strong>Engine downloads:</strong> the programs that run the models, from their official pages. <strong>Check for a newer build</strong> looks for updates.</li>
<li><strong>Speed (Bob's own engine):</strong> threads and batch sizes (leave empty for the default), <strong>Fit to free graphics memory</strong> (recommended), and <strong>Speculative decoding</strong> (experimental: a small brain guesses ahead and the big one checks).</li></ul>` },

  { id: 'settings-connections', group: 'Settings', title: 'Settings: Connections', words: 'comfyui workflows port cloud helpers api key environment variable',
    html: `<ul><li><strong>Let Bob use ComfyUI</strong> (off unless you turn it on): for jobs Bob's own engines can't do. ComfyUI must be running on this PC.</li>
<li><strong>Cloud helpers</strong> (off unless you turn one on): paid online AIs for one big job. Add your key yourself as a Windows user environment variable; Bob never stores it.</li></ul>` },

  { id: 'settings-hands', group: 'Settings', title: 'Settings: Hands', words: 'hands folders read-only stop command after recipes self-test',
    html: `<p>Switch each Hand on or off, choose the folders the Files Hand may work in (and which are read-only), how long a command may run, and see recent jobs. <strong>✋ Stop everything</strong> there does the same as the ✋ Hands kill switch on the chat page. <strong>Run the self-test</strong> checks the safety nets. See <a href="#" data-helpgo="hands">Hands</a>.</p>` },

  { id: 'settings-housekeeping', group: 'Settings', title: 'Settings: Housekeeping', words: 'tidy old chats pictures logs ask first automatically',
    html: `<p>Turn housekeeping on, choose how old is "old" for each kind of thing, and whether Bob asks first or tidies by himself. <strong>Load a brain for it if none is loaded</strong> stays off while gaming. See <a href="#" data-helpgo="housekeeping">Housekeeping and Tidy up</a>.</p>` },

  { id: 'settings-remove', group: 'Settings', title: 'Updating and removing Bob', words: 'update remove uninstall restart previous',
    html: `<p><strong>Updating:</strong> Settings, <strong>Check for updates</strong>, then <strong>Update Bob</strong> and watch the steps. Chats, models and settings are kept. If Bob is busy he asks whether to restart now or wait until he's done.</p>
<p><strong>Removing:</strong> Settings, Show advanced settings, Remove Bob, <strong>Remove Bob…</strong>. His chats, settings and models stay unless you tick them; those go to the Recycle Bin.</p>` },

  { id: 'trouble', group: 'Troubleshooting', title: 'When something goes wrong', words: 'problem fix error slow stuck blocked smart app control parsec copy paste kokoro one more step download update failed out of graphics memory hear',
    html: `<table><tr><th>What you see</th><th>What to try</th></tr>
<tr><td>Windows (Smart App Control) blocks Bob</td><td>Start Bob from the Start menu shortcut. Bob.exe is Electron's own program, only renamed, which Windows usually trusts. Leave Smart App Control on; check the Releases page notes.</td></tr>
<tr><td>Copy and paste don't work over Parsec or remote desktop</td><td>Use the <strong>Copy</strong> buttons on messages, code, links and file cards.</td></tr>
<tr><td>"Downloaded. One more step"</td><td>The model is here but its engine isn't. Press the <strong>Get …</strong> button right there (for Kokoro, about 100 MB).</td></tr>
<tr><td>A download stopped or failed</td><td>Open <strong>Downloads</strong> and press <strong>Resume</strong>. It carries on from where it stopped.</td></tr>
<tr><td>An update failed</td><td>The update window names the step that failed. Bob keeps the previous version, so he still opens. Try again from Settings, Check for updates.</td></tr>
<tr><td>"Out of graphics memory", or everything is slow</td><td>Close games or other graphics-heavy apps, use the Art or Light session, or pick a model marked <span class="tag rec">★ Recommended</span> in Equip Bob.</td></tr>
<tr><td>The first reply takes a while</td><td>Bob is loading his brain after being idle (a few seconds; big brains longer).</td></tr>
<tr><td>Bob can't hear you</td><td>Fill the 👂 Hearing you slot (Gemma 4 E4B does it).</td></tr>
<tr><td>Bob can't paint or edit</td><td>Fill the 🎨 Painter or ✂ Picture editor slot, and get the painter engine when Bob offers it.</td></tr>
<tr><td>A Hand won't do anything</td><td>Check it's on in Settings, Show advanced settings, Hands, and that ✋ Hands at the top of the chat isn't <em>Stopped</em>.</td></tr>
<tr><td>A model you want isn't listed in a slot</td><td>That slot only lists models that can do its job. Models that don't suit this PC are hidden: turn on <strong>Show models that don't suit this PC</strong>.</td></tr></table>` },

  { id: 'glossary', group: 'Troubleshooting', title: 'Glossary', words: 'words meaning model brain gpu vram ram graphics memory gguf engine commercial session hands context',
    html: `<dl>
<dt>Brain</dt><dd>A model that thinks and chats. Bigger brains are usually smarter but slower and need more memory.</dd>
<dt>Model</dt><dd>The file that does one kind of AI job: a brain, a painter, a voice.</dd>
<dt>Graphics card, graphics memory</dt><dd>The part of your PC that makes AI fast. Its memory (6, 8, 16 GB) decides which models fit. Also called GPU and VRAM.</dd>
<dt>RAM</dt><dd>Your PC's main memory. A brain too big for the graphics card can keep the rest here. It works, but more slowly.</dd>
<dt>Brain swap</dt><dd>Putting one brain away and loading another, usually 10 to 20 seconds.</dd>
<dt>Context</dt><dd>How much Bob keeps in mind at once.</dd>
<dt>Squeezed version</dt><dd>A smaller copy of a model (GGUF) that fits small cards, with a little less detail.</dd>
<dt>Engine</dt><dd>The program that runs a kind of model. Bob offers it when a model needs it.</dd>
<dt>Session</dt><dd>How Bob shares your PC with you: Normal, Art, Coding, Office, Deep thought, Light.</dd>
<dt>Hands</dt><dd>Bob doing things on your PC (files, programs, schedules, apps). Off until you turn them on.</dd>
<dt>Equip Bob</dt><dd>The page where you choose which model does each job.</dd>
<dt>Now running</dt><dd>The right-hand panel: tasks, downloads and memory.</dd>
<dt>Commercial use</dt><dd>Using what you make for money. All starter set models allow it; Bob marks the few that don't.</dd></dl>` }
];
