// CMP-001: shows one mood at a time. setMood is called when a reply appears, never at send.
import { copy, getName } from './copy.js';

const FADE_MS = 240;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// caption: the caption row (Q-023): name button, " · phrase", speaker slot (Q-025). The row is not hidden;
// the mood word is announced through the companion's own name, so the phrase stays aria-hidden.
export function createCompanion(root, caption) {
  const nameButton = caption.querySelector('.caption__name');
  const phraseEl = caption.querySelector('.caption__phrase');
  const layers = root.querySelector('.companion__layers');
  let current = null;
  let waking = false;
  let shown = null;    // the face on screen: the mood's, or a poke's borrowed face (Q-024)
  let pokeWord = null; // function while a poke is on screen: its caption word
  let deferred = null; // a reply's mood that arrived during a poke; applied when it ends
  let breathing = false; // Q-029: the guide runs; the accessible name is breathName
  let live = null;       // Q-029: sr-only status that hears the phase word once (created on first use)
  const label = () => (breathing ? copy.breathName(getName()) : copy.companionName(copy.moods[current].name));

  function setCaption() {
    const phrase = pokeWord ? pokeWord() : waking ? copy.moods.waking.caption : copy.moods[current].caption;
    const name = getName();
    nameButton.textContent = name;
    nameButton.setAttribute('aria-label', copy.renameName(name));
    phraseEl.textContent = ` · ${phrase}`;
  }

  function drawLayer(mood, animate) {
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
    shown = mood;
  }

  function render(mood, animate) {
    drawLayer(mood, animate);
    root.dataset.mood = mood;
    current = mood;
    root.setAttribute('aria-label', label());
    setCaption();
  }

  render('neutral', false);
  return {
    get mood() { return current; },
    setMood(mood) {
      if (pokeWord) { deferred = mood === current ? null : mood; return; } // applies when the poke ends
      if (mood !== current) render(mood, true);
    },
    // Q-024: swap the face layer (and the caption word) without touching data-mood, the glow or the name.
    // showFace(face, wordFn) starts or changes a poke face; showFace(null) ends it, then a deferred mood applies.
    showFace(face, wordFn) {
      if (face) {
        pokeWord = wordFn;
        if (shown !== face) drawLayer(face, true);
        setCaption();
        return;
      }
      pokeWord = null;
      const next = deferred;
      deferred = null;
      if (next && next !== current) render(next, true);
      else { if (shown !== current) drawLayer(current, true); setCaption(); }
    },
    // The poke's own motion class on the root (restarts when it changes); null clears it.
    setMotion(id) {
      [...root.classList].filter((c) => c.startsWith('is-poke-')).forEach((c) => root.classList.remove(c));
      if (id) { void root.offsetWidth; root.classList.add(`is-poke-${id}`); }
    },
    // The reply side is still warming: caption "还在醒来", art unchanged (FLOW-006).
    // Q-015: caption and accessible name again in the current language
    refresh() { root.setAttribute('aria-label', label()); setCaption(); },
    // Q-029: while the guide runs the art swells (CSS .is-breathing), the name is breathName and the part loops rest.
    // The face and caption go through showFace (same path as a poke), so a reply's mood waits until it ends.
    setBreathing(on) {
      if (on === breathing) return;
      breathing = on;
      root.classList.toggle('is-breathing', on);
      root.setAttribute('aria-label', label());
      if (!on && live) live.textContent = '';
    },
    // The phase word, announced once when it changes; the seconds are never announced.
    announce(text) {
      if (!live) {
        live = document.createElement('span');
        live.className = 'sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        root.after(live);
      }
      live.textContent = text;
    },
    setWaking(on) { if (on !== waking) { waking = on; setCaption(); } },
  };
}
