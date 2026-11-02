// 1.5.7: the cat does cat things by Bob's picture while he's idle. Scripted, no brain, no setting: it costs nothing
//. Every 1½ to 3 minutes of idle, the cat does one short antic for about 8 seconds
// and a one-line moment shows under Bob's status. Stops as soon as Bob is busy. Kept out of screen readers (aria-hidden).
import { catMoment } from './patches.js';

const ANTICS = ['nap', 'swat', 'pounce', 'stroll', 'stare'];
const ICON = { nap: '🐈💤', swat: '🐈', pounce: '🐈', stroll: '🐈', stare: '🐈' };

export function createCatAntics() {
  const cat = document.getElementById('cat'), line = document.getElementById('catLine');
  if (!cat || !line) return { idle() {} };
  let name = 'Patches', idle = false, timer = null, hide = null, n = Math.floor(Math.random() * 100);
  fetch('/api/settings').then((r) => r.json()).then((s) => { if (s.catName) name = s.catName; }).catch(() => {});
  const stop = () => { clearTimeout(timer); clearTimeout(hide); cat.className = 'cat'; cat.textContent = '🐈'; line.hidden = true; };
  function plan() {
    clearTimeout(timer);
    if (!idle) return;
    timer = setTimeout(play, 90000 + Math.random() * 90000);
  }
  function play() {
    if (!idle || document.hidden) return plan();
    const a = ANTICS[n % ANTICS.length];
    cat.className = `cat antic-${a}`;
    cat.textContent = ICON[a];
    line.textContent = `${catMoment(name, n++)}.`;
    line.hidden = false;
    hide = setTimeout(() => { cat.className = 'cat'; cat.textContent = '🐈'; line.hidden = true; plan(); }, 8000);
  }
  return {
    idle(on) {
      if (on === idle) return;
      idle = on;
      if (on) plan(); else stop();
    },
    play // for a quick look (tests, screenshots)
  };
}
