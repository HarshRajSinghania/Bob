// The reference shelf: pictures of characters, scenes and styles that Bob can look at and paint from.
// Files live in inn\references, with a small index (refs.json). Pictures attached in chat land here too,
// under "From chats", so Bob can find them again by name.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const KINDS = ['character', 'scene', 'style', 'object', 'chat'];
const MAX_BYTES = 15e6;

function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export class RefShelf {
  constructor(cfg) {
    this.dir = path.join(cfg.innDir, 'references');
    fs.mkdirSync(this.dir, { recursive: true });
    this.index = path.join(this.dir, 'refs.json');
  }

  list() {
    try { return JSON.parse(fs.readFileSync(this.index, 'utf8')); } catch { return []; }
  }

  save(list) { fs.writeFileSync(this.index, JSON.stringify(list, null, 2)); }

  add(buf, { name, kind, notes } = {}) {
    if (!buf || !buf.length) throw new Error('That picture is empty.');
    if (buf.length > MAX_BYTES) throw new Error('That picture is too big (15 MB max).');
    const ext = sniff(buf);
    if (!ext) throw new Error('I can only keep PNG, JPEG or WebP pictures.');
    const list = this.list();
    const id = crypto.randomUUID().slice(0, 8);
    const k = KINDS.includes(kind) ? kind : 'chat';
    let n = String(name || '').trim().slice(0, 60) || (k === 'chat' ? `Chat picture ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` : `Untitled ${k}`);
    if (list.some((r) => r.name.toLowerCase() === n.toLowerCase())) n = `${n} (${id.slice(0, 4)})`;
    const file = `${id}.${ext}`;
    fs.writeFileSync(path.join(this.dir, file), buf);
    const ref = { id, name: n, kind: k, notes: String(notes || '').slice(0, 300), file, added: new Date().toISOString().slice(0, 10) };
    list.push(ref);
    this.save(list);
    return ref;
  }

  update(id, { name, kind, notes }) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) throw new Error('No such reference.');
    if (typeof name === 'string' && name.trim()) {
      const n = name.trim().slice(0, 60);
      if (list.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error(`There's already a reference called ${n}.`);
      r.name = n;
    }
    if (KINDS.includes(kind)) r.kind = kind;
    if (typeof notes === 'string') r.notes = notes.slice(0, 300);
    this.save(list);
    return r;
  }

  // What Bob's eyes saw in the picture, kept so he doesn't have to look again.
  setSeen(id, text) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) return;
    r.seen = String(text || '').slice(0, 1500);
    this.save(list);
  }

  // Keep one of Bob's own pictures (from the painter folder) on the shelf.
  addFile(file, meta) { return this.add(fs.readFileSync(file), meta); }

  remove(id) {
    const list = this.list();
    const r = list.find((x) => x.id === id);
    if (!r) return false;
    fs.rmSync(path.join(this.dir, r.file), { force: true });
    this.save(list.filter((x) => x.id !== id));
    return true;
  }

  // By id or by name (case-insensitive), for Bob's tools.
  find(idOrName) {
    const q = String(idOrName || '').trim().toLowerCase();
    if (!q) return null;
    const list = this.list();
    return list.find((r) => r.id === q) || list.find((r) => r.name.toLowerCase() === q) || list.find((r) => r.name.toLowerCase().includes(q)) || null;
  }

  pathOf(ref) { return path.join(this.dir, ref.file); }

  base64(ref) { return fs.readFileSync(this.pathOf(ref)).toString('base64'); }

  // A short list for Bob's system prompt.
  describe() {
    const shelf = this.list().filter((r) => r.kind !== 'chat');
    if (!shelf.length) return '';
    return 'Reference shelf (pictures saved for you; use the name in make_image or make_video):\n' + shelf.slice(-40).map((r) => `- ${r.name} (${r.kind})${r.notes ? `: ${r.notes}` : ''}${r.seen ? ` [looks like: ${r.seen.slice(0, 200)}]` : ''}`).join('\n');
  }
}
