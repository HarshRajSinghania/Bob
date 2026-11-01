// Bob's engines (the programs that run models): llama.cpp, stable-diffusion.cpp, whisper.cpp, Piper.
// Fetched from their official GitHub releases, only when someone clicks "Get" in the cellar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { hostAllowed } from './models.js';
import { setupWorkshop, setupVoice, audioReady, voicesReady } from './audio.js';

export const ENGINES = [
  {
    id: 'llamacpp', name: 'llama.cpp', what: 'Thinking engine: runs the chat and coding brains without Ollama.', repo: 'ggml-org/llama.cpp', dir: 'llama.cpp', exe: 'llama-server.exe',
    nvidia: [/bin-win-cuda-?(\d+(?:\.\d+)?)-x64\.zip$/], other: [/bin-win-vulkan-x64\.zip$/, /bin-win-cpu-x64\.zip$/],
    runtime: (asset) => { const m = asset.match(/cuda-?(\d+(?:\.\d+)?)/); return m ? new RegExp(`^cudart-.*cuda-?${m[1].replace('.', '\\.')}-x64\\.zip$`) : null; }
  },
  {
    id: 'sdcpp', name: 'stable-diffusion.cpp', what: 'Painter: makes pictures and clips without ComfyUI.', repo: 'leejet/stable-diffusion.cpp', dir: 'sd.cpp', exe: 'sd-cli.exe', aka: ['sd.exe'],
    nvidia: [/bin-win-cuda-?(\d+)[^-]*-x64\.zip$/], other: [/bin-win-vulkan-x64\.zip$/, /bin-win-avx2-x64\.zip$/],
    runtime: () => /^cudart-.*-x64\.zip$/
  },
  {
    id: 'whispercpp', name: 'whisper.cpp', what: 'Ears: turns your voice into text without Ollama.', repo: 'ggml-org/whisper.cpp', dir: 'whisper.cpp', exe: 'whisper-cli.exe',
    // Bob listens on the processor (-ng), so the plain CPU build is enough and the smallest; CUDA builds are a fallback.
    // Newer CUDA zips are named whisper-bin-win-cuda-12.4-x64.zip, older ones whisper-cublas-12.4.0-bin-x64.zip.
    nvidia: [], other: [/^whisper-bin-x64\.zip$/, /^whisper-blas-bin-x64\.zip$/, /^whisper-(?:cublas-(\d+)[\d.]*-bin|bin-win-cuda-(\d+)[\d.]*)-x64\.zip$/],
    runtime: () => null
  },
  {
    // Piper's last Windows build. The repo is archived, so this release is fixed rather than "latest".
    id: 'piper', name: 'Piper', what: 'Voice: Bob reads replies aloud in his own voice, on the processor.', repo: 'rhasspy/piper', tag: '2023.11.14-2', sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea', dir: 'piper', exe: 'piper.exe',
    nvidia: [], other: [/^piper_windows_amd64\.zip$/],
    runtime: () => null
  },
  {
    // uv builds Bob a private Python for music and sound effects; nothing touches other Pythons on the PC.
    id: 'audio', name: 'Audio tools', what: 'Music (ACE-Step 1.5) and sound effects (AudioLDM 2). About 12 GB with the models. Needs Python 3.12 from python.org installed first (free); Bob keeps his own copy of the packages.',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    after: setupWorkshop,
    ready: (cfg) => { const a = audioReady(cfg); return a.music || a.sfx; }
  },
  {
    // Same uv as the audio tools; only the small Kokoro package is added. The voice files come from Bob's voice tab.
    id: 'kokoro', name: 'Kokoro voices', what: 'Bob\'s voice: Kokoro-82M (Apache-2.0), natural-sounding and small, runs on the processor. About 100 MB, plus a 330 MB voice pack from the Bob\'s voice tab. Needs Python 3.12 or 3.11.',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    after: (cfg, o) => setupVoice(cfg, 'kokoro', o),
    ready: (cfg) => voicesReady(cfg).kokoro
  },
  {
    id: 'chatterbox', name: 'Chatterbox voice', what: 'Bob\'s voice: Chatterbox (MIT, Resemble AI). Very natural, can copy a voice from a short recording, uses the graphics card (about 4 GB while talking). About 4 GB to set up, plus 3 GB of model on first use. Needs Python 3.12 or 3.11.',
    repo: 'astral-sh/uv', dir: 'audio-workshop', exe: 'uv.exe',
    nvidia: [], other: [/^uv-x86_64-pc-windows-msvc\.zip$/],
    runtime: () => null,
    after: (cfg, o) => setupVoice(cfg, 'chatterbox', o),
    ready: (cfg) => voicesReady(cfg).chatterbox
  }
];

export function engineExe(cfg, e) {
  const dir = path.join(cfg.agentDir, e.dir);
  for (const sub of ['', 'bin', 'Release']) for (const n of [e.exe, ...(e.aka || [])]) { const p = path.join(dir, sub, n); if (fs.existsSync(p)) return p; }
  return null;
}

// Which release is installed (written after each install; older installs don't have it).
export function installedVersion(cfg, e) {
  try { return JSON.parse(fs.readFileSync(path.join(cfg.agentDir, e.dir, `bob-${e.id}.json`), 'utf8')).version || null; } catch { return null; }
}

export function engineStatus(cfg) {
  return ENGINES.map((e) => ({ id: e.id, name: e.name, what: e.what, installed: e.ready ? Boolean(e.ready(cfg)) : Boolean(engineExe(cfg, e)), version: installedVersion(cfg, e), pinned: Boolean(e.tag), folder: path.join(cfg.agentDir, e.dir) }));
}

// The newest release with a Windows build, for "Get newer build". Same rules as installing.
export async function latestEngine(cfg, id, nvidia, fetchImpl = fetch) {
  const e = ENGINES.find((x) => x.id === id);
  if (!e) throw new Error('No such engine.');
  const { rel, asset } = await findRelease(e, nvidia, undefined, fetchImpl);
  return { id, installed: installedVersion(cfg, e), latest: rel.tag_name, asset: asset.name, newer: installedVersion(cfg, e) !== rel.tag_name };
}

// Pick the right zip from a release's asset list for this graphics card. Highest CUDA version wins.
export function pickAsset(assets, e, nvidia) {
  for (const re of [...(nvidia ? e.nvidia : []), ...e.other]) {
    const hits = assets.filter((a) => re.test(a.name));
    if (!hits.length) continue;
    const ver = (n) => { const m = n.match(re) || []; return Number(m[1] ?? m[2] ?? 0); };
    hits.sort((a, b) => ver(b.name) - ver(a.name));
    return hits[0];
  }
  return null;
}

async function grab(asset, folder, pub, signal, tick) {
  if (!hostAllowed(asset.browser_download_url)) throw new Error('That download isn\'t from GitHub. Stopped.');
  const zip = path.join(folder, asset.name + '.part');
  const res = await fetch(asset.browser_download_url, { redirect: 'follow', signal, headers: { 'user-agent': 'Bob' } });
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  if (!hostAllowed(res.url)) throw new Error('The download was redirected somewhere I don\'t trust. Stopped.');
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(zip);
  const base = pub.done;
  let got = 0, last = 0;
  pub.file = asset.name; pub.phase = 'downloading'; tick();
  try {
    for await (const c of res.body) {
      hash.update(c); got += c.length;
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
      pub.done = base + got;
      if (Date.now() - last > 500) { last = Date.now(); tick(); }
    }
  } finally { await new Promise((r) => out.end(r)); }
  pub.phase = 'checking'; tick();
  const want = String(asset.digest || asset.pinnedSha256 || '').replace(/^sha256:/, '');
  // GitHub publishes a sha256 for every release file; no checksum means we can't trust it.
  if (!/^[0-9a-f]{64}$/.test(want)) { fs.rmSync(zip, { force: true }); throw new Error(`GitHub gave no checksum for ${asset.name}, so I won't install it.`); }
  if (hash.digest('hex') !== want) { fs.rmSync(zip, { force: true }); throw new Error(`${asset.name} came through damaged (checksum didn't match).`); }
  pub.phase = 'unpacking'; tick();
  // Windows 10+ ships tar (bsdtar), which unpacks zip files.
  await new Promise((resolve, reject) => execFile('tar', ['-xf', zip, '-C', folder], { windowsHide: true, timeout: 300000 }, (err) => (err ? reject(new Error('Couldn\'t unpack ' + asset.name + ': ' + err.message)) : resolve())));
  fs.rmSync(zip, { force: true });
}

// Some zips put the programs in a subfolder (e.g. Release\). Move them up next to each other.
function flatten(folder, exeNames) {
  const find = (d, depth) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isFile() && exeNames.includes(ent.name)) return d;
      if (ent.isDirectory() && depth < 3) { const r = find(p, depth + 1); if (r) return r; }
    }
    return null;
  };
  const where = find(folder, 0);
  if (!where || where === folder) return;
  for (const f of fs.readdirSync(where)) fs.renameSync(path.join(where, f), path.join(folder, f));
}

// The newest release that actually has a Windows build. Some projects (whisper.cpp 1.9.5, for one) ship a
// release with no Windows zips at all, so Bob looks back through the last 15 instead of giving up.
export async function findRelease(e, nvidia, signal, fetchImpl = fetch) {
  const get = async (u) => {
    const r = await fetchImpl(u, { headers: { 'user-agent': 'Bob', accept: 'application/vnd.github+json' }, signal });
    if (!r.ok) throw new Error(`GitHub didn't answer for ${e.name} (${r.status}). Try again in a few minutes.`);
    return r.json();
  };
  if (e.tag) {
    const rel = await get(`https://api.github.com/repos/${e.repo}/releases/tags/${e.tag}`);
    const asset = pickAsset(rel.assets || [], e, nvidia);
    if (!asset) throw new Error(`The pinned ${e.name} release (${e.tag}) has no Windows build.`);
    return { rel, asset };
  }
  const list = await get(`https://api.github.com/repos/${e.repo}/releases?per_page=15`);
  for (const rel of Array.isArray(list) ? list : []) {
    if (rel.draft) continue; // whisper.cpp's Windows builds come out as separate "bNNNN" releases; take them too
    const asset = pickAsset(rel.assets || [], e, nvidia);
    if (asset) return { rel, asset };
  }
  throw new Error(`None of the last 15 ${e.name} releases has a Windows build, so there's nothing safe to install. Clicking again won't help; Bob will pick it up once the project posts one.`);
}

export async function installEngine(cfg, id, { nvidia, pub, signal, tick }) {
  const e = ENGINES.find((x) => x.id === id);
  if (!e) throw new Error('No such engine.');
  if (process.platform !== 'win32') throw new Error('Engines can only be fetched on Windows.');
  const { rel, asset } = await findRelease(e, nvidia, signal);
  const rtRe = nvidia && e.runtime(asset.name);
  const rt = rtRe ? (rel.assets || []).find((a) => rtRe.test(a.name)) : null;
  pub.total = asset.size + (rt?.size || 0);
  pub.done = 0;
  const folder = path.join(cfg.agentDir, e.dir);
  fs.mkdirSync(folder, { recursive: true });
  if (e.sha256) asset.pinnedSha256 = e.sha256; // old releases without a GitHub digest: checked against our own pin
  await grab(asset, folder, pub, signal, tick);
  if (rt) await grab(rt, folder, pub, signal, tick);
  flatten(folder, [e.exe, ...(e.aka || [])]);
  if (!engineExe(cfg, e)) throw new Error(`${e.name} unpacked, but ${e.exe} isn't in it. The release layout may have changed.`);
  if (e.after) await e.after(cfg, { pub, tick, signal });
  // Older stable-diffusion.cpp builds call the program sd.exe.
  if (e.id === 'sdcpp' && !fs.existsSync(path.join(folder, 'sd-cli.exe'))) fs.copyFileSync(path.join(folder, 'sd.exe'), path.join(folder, 'sd-cli.exe'));
  try { fs.writeFileSync(path.join(folder, `bob-${e.id}.json`), JSON.stringify({ version: rel.tag_name, asset: asset.name, at: new Date().toISOString() }, null, 2)); } catch {}
  return { version: rel.tag_name, asset: asset.name };
}
