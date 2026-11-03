// Bob's way of throwing things away: never a hard delete. On Windows a file or folder goes to the Recycle Bin
// (the same Microsoft.VisualBasic call the uninstaller uses), so the user can put it back from there.
// Anywhere else (and in tests) it moves into inn\bob\trash\<date>\, which plays the same part.
// Only paths inside the folders housekeeping may touch are accepted; anything else is refused.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isInside } from './config.js';

// The folders housekeeping may tidy: Bob's own data, the painter's output, the reference shelf,
// plus any folder the user adds in settings (housekeeping.extraFolders).
export function tidyRoots(cfg) {
  const extra = [].concat(cfg.housekeeping?.extraFolders || []).filter((f) => typeof f === 'string' && path.isAbsolute(f));
  // 1.5.41: Bob's own pictures folder, never a folder the user picked for saving (that one holds their files too).
  return [cfg.dataDir, cfg.defaultPainterDir || cfg.painterDir, path.join(cfg.innDir, 'references'), ...extra];
}

// Files that are never thrown away, wherever they are.
const NEVER = /^(settings\.json|config\.json|config\.example\.json|topics\.json|housekeeping\.json|about-me\.md|backstory\.md|refs\.json)$/i;

// roots: the folders allowed for this call (housekeeping's by default; the Files Hand passes the folders the user ticked).
export function mayRecycle(cfg, file, roots = tidyRoots(cfg)) {
  if (!file || !path.isAbsolute(file)) return false;
  const full = path.resolve(file);
  if (NEVER.test(path.basename(full))) return false;
  if (roots.some((r) => path.resolve(r) === full)) return false; // never a whole root
  if (isInside(trashDir(cfg), full)) return false;
  return roots.some((r) => isInside(r, full));
}

export const trashDir = (cfg) => path.join(cfg.dataDir, 'trash');

function stamp() { return new Date().toISOString().slice(0, 10); }

function toTrash(cfg, file) {
  const dir = path.join(trashDir(cfg), stamp());
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, path.basename(file));
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(dir, `${path.parse(file).name} (${n})${path.extname(file)}`);
  try { fs.renameSync(file, dest); } catch { fs.cpSync(file, dest, { recursive: true }); fs.rmSync(file, { recursive: true, force: true }); }
  return dest;
}

// The Recycle Bin, for many paths in one PowerShell run. Returns the paths that went.
function toRecycleBin(files) {
  const list = files.map((f) => `'${f.replace(/'/g, "''")}'`).join(',');
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($p in @(${list})) { try { if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') } elseif (Test-Path -LiteralPath $p) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }; Write-Output ('OK ' + $p) } catch { Write-Output ('NO ' + $p) } }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return (r.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('OK ')).map((l) => l.slice(3));
}

// Throws away the given paths. Returns { gone: [...], refused: [...] } and never throws for one bad path.
// Off Windows (and in tests) `trashed` maps each path to where it went in inn\bob\trash, so it can be put back.
export function recycle(cfg, paths, { roots } = {}) {
  const gone = [], refused = [], trashed = {};
  const ok = [];
  for (const p of [].concat(paths || [])) {
    if (!mayRecycle(cfg, p, roots || tidyRoots(cfg))) { refused.push(p); continue; }
    if (!fs.existsSync(p)) continue;
    ok.push(path.resolve(p));
  }
  if (!ok.length) return { gone, refused, trashed };
  const useBin = cfg.recycleBin ?? (process.platform === 'win32');
  if (useBin) {
    const went = new Set(toRecycleBin(ok).map((p) => path.resolve(p)));
    for (const p of ok) (went.has(p) && !fs.existsSync(p) ? gone : refused).push(p);
  } else {
    for (const p of ok) { try { trashed[p] = toTrash(cfg, p); gone.push(p); } catch { refused.push(p); } }
  }
  return { gone, refused, trashed };
}

// A copy of a file, thrown away at once: the "before" version of something Bob is about to change
// (a chat before parts of it are forgotten, the memory file before it's tidied) ends up in the Recycle Bin.
export function backupToBin(cfg, file, label = 'before') {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(cfg.dataDir, 'tidy-backups');
  fs.mkdirSync(dir, { recursive: true });
  const { name, ext } = path.parse(file);
  const copy = path.join(dir, `${name} (${label} ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')})${ext}`);
  fs.copyFileSync(file, copy);
  const r = recycle(cfg, [copy]);
  return r.gone.length ? copy : null;
}
