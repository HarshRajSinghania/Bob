// The reference shelf: pictures of characters, scenes and styles Bob paints and films from.
// Add with the button, by dropping files on the shelf, or by saving a picture attached in chat.
const KIND_LABEL = { character: 'Character', scene: 'Scene', style: 'Style', object: 'Object', chat: 'From chats' };
const ORDER = ['character', 'scene', 'style', 'object', 'chat'];

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export async function uploadRef(file, { name = '', kind = 'chat', notes = '' } = {}) {
  const q = new URLSearchParams({ name, kind, notes });
  const r = await fetch('/api/refs?' + q, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-bob': '1' }, body: file });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Upload failed.');
  return j;
}

async function postJSON(url, data) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'That didn\'t work.');
  return j;
}

// onUse(ref): attach the reference to the next message.
export function createShelf({ onUse }) {
  const dlg = document.getElementById('shelf');
  const body = document.getElementById('shelf-body');
  document.getElementById('shelf-close').onclick = () => dlg.close();

  async function draw(msg = '') {
    let refs = [];
    try { refs = await (await fetch('/api/refs')).json(); } catch {}
    const groups = ORDER.map((k) => [k, refs.filter((r) => r.kind === k)]).filter(([, l]) => l.length);
    body.innerHTML = `
      <p class="hint">Pictures here can be used by name: "paint Captain Mira at the helm", or "film the harbour scene at night". Bob looks at each one once and remembers what it shows.</p>
      <form id="ref-add" class="ref-add">
        <label>Name <input name="name" maxlength="60" placeholder="Captain Mira" required></label>
        <label>Kind <select name="kind">${ORDER.filter((k) => k !== 'chat').map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join('')}</select></label>
        <label class="wide">Notes (optional) <input name="notes" maxlength="300" placeholder="Red scarf, scar over left eye"></label>
        <label class="wide">Picture <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required></label>
        <button class="send" type="submit">Add to References</button>
      </form>
      ${msg ? `<p class="hint" role="status">${esc(msg)}</p>` : ''}
      ${groups.length ? '' : '<p class="hint">No references yet. Add a picture above, or drop one here.</p>'}
      ${groups.map(([k, list]) => `
        <h3>${KIND_LABEL[k]}</h3>
        <div class="ref-grid">${list.map((r) => `
          <figure class="ref" data-id="${esc(r.id)}">
            <img src="${esc(r.url)}" alt="${esc(r.name)}" loading="lazy">
            <figcaption><strong>${esc(r.name)}</strong>${r.notes ? `<span>${esc(r.notes)}</span>` : ''}</figcaption>
            <div class="ref-actions">
              <button type="button" data-act="use">Use in chat</button>
              <button type="button" data-act="edit">Rename</button>
              <button type="button" data-act="del" title="Remove from References">✕</button>
            </div>
          </figure>`).join('')}</div>`).join('')}`;

    body.querySelector('#ref-add').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { const r = await uploadRef(f.get('file'), { name: f.get('name'), kind: f.get('kind'), notes: f.get('notes') }); draw(`Added ${r.name}.`); }
      catch (err) { draw(err.message); }
    };
    for (const fig of body.querySelectorAll('.ref')) {
      const id = fig.dataset.id;
      const ref = refs.find((r) => r.id === id);
      fig.querySelector('[data-act=use]').onclick = () => { onUse(ref); dlg.close(); };
      fig.querySelector('[data-act=edit]').onclick = () => {
        const cap = fig.querySelector('figcaption');
        cap.innerHTML = `<input maxlength="60" value="${esc(ref.name)}" aria-label="Name"><select aria-label="Kind">${ORDER.filter((k) => k !== 'chat').map((k) => `<option value="${k}"${k === ref.kind ? ' selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select><button type="button">Save</button>`;
        cap.querySelector('button').onclick = async () => {
          try { await postJSON('/api/refs/update', { id, name: cap.querySelector('input').value, kind: cap.querySelector('select').value }); draw('Saved.'); }
          catch (err) { draw(err.message); }
        };
      };
      fig.querySelector('[data-act=del]').onclick = async () => {
        const b = fig.querySelector('[data-act=del]');
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure?'; return; }
        try { await postJSON('/api/refs/delete', { id }); draw(`Removed ${ref.name}.`); } catch (err) { draw(err.message); }
      };
    }
  }

  // Drop pictures straight onto the open shelf: each becomes a character, named after its file.
  dlg.addEventListener('dragover', (e) => { e.preventDefault(); });
  dlg.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type));
    let last = '';
    for (const f of files) {
      try { const r = await uploadRef(f, { name: f.name.replace(/\.[^.]+$/, ''), kind: 'character' }); last = `Added ${r.name}. Rename it or change its kind if needed.`; }
      catch (err) { last = err.message; }
    }
    draw(last);
  });

  return {
    open() { draw(); dlg.showModal(); },
    // Move a chat picture onto the shelf with a proper name and kind.
    async keep(ref, name, kind) { return postJSON('/api/refs/update', { id: ref.id, name, kind }); }
  };
}
