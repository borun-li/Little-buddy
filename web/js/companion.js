// CMP-001: shows one mood at a time. setMood is called when a reply appears, never at send.
import { copy } from './copy.js';

const FADE_MS = 240;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCompanion(root, caption) {
  const layers = root.querySelector('.companion__layers');
  let current = null;
  let waking = false;

  function setCaption() {
    const phrase = waking ? copy.moods.waking.caption : copy.moods[current].caption;
    caption.textContent = copy.companionCaption(phrase);
  }

  function render(mood, animate) {
    const tpl = document.getElementById(`mood-${mood}`);
    if (!tpl) throw new Error(`unknown mood ${mood}`);
    const layer = document.createElement('div');
    layer.className = 'companion__layer';
    layer.dataset.moodLayer = mood;
    layer.append(tpl.content.cloneNode(true));

    const old = [...layers.children];
    if (animate && !reduceMotion()) {
      layer.classList.add('is-entering');
      // Part animations (squash, hops) bubble animationend too; only the layer's own fade ends the entry.
      layer.addEventListener('animationend', function done(e) {
        if (e.target !== layer) return;
        layer.classList.remove('is-entering');
        layer.removeEventListener('animationend', done);
      });
      old.forEach((el) => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), FADE_MS);
      });
    } else {
      old.forEach((el) => el.remove());
    }
    layers.append(layer);

    const words = copy.moods[mood];
    root.dataset.mood = mood;
    root.setAttribute('aria-label', copy.companionName(words.name));
    current = mood;
    setCaption();
  }

  render('neutral', false);
  return {
    get mood() { return current; },
    setMood(mood) { if (mood !== current) render(mood, true); },
    // The reply side is still warming: caption "还在醒来", art unchanged (FLOW-006).
    setWaking(on) { if (on !== waking) { waking = on; setCaption(); } },
  };
}
