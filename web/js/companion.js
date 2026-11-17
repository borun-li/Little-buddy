// CMP-001: shows one mood at a time. setMood is called when a reply appears, never at send.
// R2 (docs/frontend/r2-personalise/02-ui.md CMP-001, CMP-030, CMP-031): the layer is the chosen character's template for the mood,
// wearing the outfit and the stage's plant (look-art.js); data-mood stays the 5 ids.
import { copy, getName } from './copy.js';
import { characterId, dress, fillSlot, fillPlant, reprefix, ITEM_IDS } from './look-art.js';
import { GROWTH_SCALE, FACE_MS, CAPTION_MS, SPARK_OUT_MS, BURST_MS, REDUCED_FADE_MS, anim, burst, captionSpark, captionSparkOut, springGrowth, growPlant } from './stage-up.js';

const FADE_MS = 240;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_OUTFIT = () => ({ head: 'none', clothes: 'none', shoes: 'none', accessory: 'none' });

// caption: the caption row (Q-023): name button, " · phrase", speaker slot (Q-025). The row is not hidden;
// the mood word is announced through the companion's own name, so the phrase stays aria-hidden.
// opts.preview (R2, CMP-001 phone mirror): no caption, no name, ids prefixed so they stay unique in the document.
export function createCompanion(root, caption, { preview = false, idPrefix = '' } = {}) {
  const nameButton = caption?.querySelector('.caption__name');
  const phraseEl = caption?.querySelector('.caption__phrase');
  const layers = root.querySelector('.companion__layers');
  let current = null;
  let waking = false;
  let shown = null;    // the face on screen: the mood's, or a poke's borrowed face (Q-024)
  let pokeWord = null; // function while a poke is on screen: its caption word
  let deferred = null; // a reply's mood that arrived during a poke; applied when it ends
  let breathing = false; // Q-029: the guide runs; the accessible name is breathName
  let live = null;       // Q-029: sr-only status that hears the phase word once (created on first use)
  let char = 'honey';    // R2: the look on show
  let outfit = DEFAULT_OUTFIT();
  let stage = 1;
  const mirrors = new Set(); // R2 (Q-064): other companions that wear and say what this one does
  let note = null;       // Q-062: growth.thanks while the stage-up caption shows (wins over a poke word and the mood phrase)
  let moment = null;     // Q-062: the stage-up on screen: { timers: [[id, fn]], anims, nodes }
  const label = () => (breathing ? copy.breathName(getName()) : copy.companionName(copy.moods[current].name));

  function setCaption() {
    if (!caption) return;
    const phrase = note ? note() : pokeWord ? pokeWord() : waking ? copy.moods.waking.caption : copy.moods[current].caption;
    const name = getName();
    nameButton.textContent = name;
    nameButton.setAttribute('aria-label', copy.renameName(name));
    phraseEl.textContent = ` · ${phrase}`;
  }

  function drawLayer(mood, animate, { keepOld = false } = {}) {
    const tpl = document.getElementById(`mood-${char}-${mood}`);
    if (!tpl) throw new Error(`unknown mood ${char}-${mood}`);
    const layer = document.createElement('div');
    layer.className = 'companion__layer';
    layer.dataset.moodLayer = mood;
    layer.append(tpl.content.cloneNode(true));
    const svg = layer.querySelector?.('svg'); // a template without art (a test double) is drawn as it is
    if (svg) { if (idPrefix) reprefix(svg, idPrefix); dress(svg, mood, outfit, stage); }

    const old = keepOld ? [] : [...layers.children];
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
    if (!preview) root.setAttribute('aria-label', label());
    setCaption();
  }

  const top = () => layers.lastElementChild?.querySelector('svg');
  const each = (fn) => mirrors.forEach(fn);

  // Q-024 face swap without the mirror call (showFace mirrors, then calls this; the stage-up calls it directly, mirrored once).
  function face(f, wordFn) {
    if (f) {
      pokeWord = wordFn;
      if (shown !== f) drawLayer(f, true);
      setCaption();
      return;
    }
    pokeWord = null;
    const next = deferred;
    deferred = null;
    if (next && next !== current) render(next, true);
    else { if (shown !== current) drawLayer(current, true); setCaption(); }
  }
  function stageNow(n, { plants = true } = {}) {
    stage = n;
    root.dataset.stage = String(n);
    if (plants) layers.querySelectorAll('svg').forEach((svg) => fillPlant(svg, n));
  }
  // Q-062: an unfinished moment is finished at once (its pending steps run now, its motion stops at the end state).
  function endMoment() {
    if (!moment) return;
    const m = moment; moment = null;
    m.anims.forEach((a) => a?.cancel());
    m.timers.forEach(([id, fn]) => { clearTimeout(id); fn(); });
    m.nodes.forEach((n) => n.remove());
  }
  const later = (m, ms, fn) => {
    const entry = [0, () => { m.timers = m.timers.filter((t) => t !== entry); fn(); }];
    entry[0] = setTimeout(entry[1], ms);
    m.timers.push(entry);
  };

  render('neutral', false);
  return {
    get mood() { return current; },
    get shownMood() { return shown; },
    setMood(mood) {
      each((m) => m.setMood(mood));
      if (pokeWord) { deferred = mood === current ? null : mood; return; } // applies when the poke ends
      if (mood !== current) render(mood, true);
    },
    // Q-024: swap the face layer (and the caption word) without touching data-mood, the glow or the name.
    // showFace(face, wordFn) starts or changes a poke face; showFace(null) ends it, then a deferred mood applies.
    showFace(f, wordFn) {
      each((m) => m.showFace(f, wordFn));
      face(f, wordFn);
    },
    // The poke's own motion class on the root (restarts when it changes); null clears it.
    setMotion(id) {
      [...root.classList].filter((c) => c.startsWith('is-poke-')).forEach((c) => root.classList.remove(c));
      if (id) { void root.offsetWidth; root.classList.add(`is-poke-${id}`); }
    },
    // R2: the saved or chosen look. look = { character: 1|2|3, outfit: { head, clothes, shoes, accessory } }. A new character
    // crossfades like a mood change (240 ms); an item fades in or out in its slot. animate false = at open, nothing moves.
    setLook(look, { animate = true } = {}) {
      each((m) => m.setLook(look, { animate }));
      const nextChar = characterId(look.character);
      const nextOutfit = { ...DEFAULT_OUTFIT(), ...look.outfit };
      const charChanged = nextChar !== char;
      const changed = Object.keys(ITEM_IDS).filter((s) => String(nextOutfit[s]) !== String(outfit[s]));
      char = nextChar; outfit = nextOutfit;
      root.dataset.character = String(look.character);
      for (const s of Object.keys(ITEM_IDS)) root.dataset[s] = String(outfit[s]);
      if (charChanged) { drawLayer(shown, animate); return; }
      const svg = top();
      if (svg) for (const s of changed) fillSlot(svg, s, outfit[s], shown, { animate, reduce: reduceMotion() });
    },
    // R2: stage 1 | 2 | 3 sets the body size (CSS, data-stage) and the plant. Q-062 (stage-up moment) hooks in app.js applyStage.
    setStage(n) {
      each((m) => m.setStage(n));
      if (n === stage && root.dataset.stage === String(n)) return;
      endMoment();
      stageNow(n);
    },
    // Q-062 / Q-063 (CMP-032, CMP-033): the stage-up moment, from the stage on screen to `to` (app.js decides once per stage).
    //  full motion: size springs (600 ms), plant grows (400 ms), confetti + sparkles (1.5 s), pleasant-high face 1.5 s (showFace
    //    path: data-mood untouched, a reply's mood waits), caption growth.thanks 3 s with the flaring spark;
    //  reduced motion: the new look crossfades in 240 ms (Web Animations: CSS animation is off in .companion), same caption 3 s,
    //    still spark; no confetti, sparkles, hop or face swap.
    // opts: thanks (word fn, caption only), band (spark), captionOnly (breathing changed the look already: caption + spark only).
    // Mirrors (the phone preview) play the art part; they have no caption.
    stageUp(to, { thanks = null, band = to, captionOnly = false } = {}) {
      each((m) => m.stageUp(to, { band, captionOnly }));
      endMoment();
      const from = stage;
      const reduce = reduceMotion();
      const m = moment = { timers: [], anims: [], nodes: [] };
      if (!captionOnly && to !== from) {
        if (reduce) {
          const old = [...layers.children];
          old.forEach((el) => { // the old look keeps its size and plant; its ids step aside so the two layers never share one
            el.style.setProperty('--g', String(GROWTH_SCALE[from]));
            const svg = el.querySelector('svg');
            if (svg) reprefix(svg, 'was-');
          });
          stageNow(to, { plants: false });
          drawLayer(shown, false, { keepOld: true });
          const fresh = layers.lastElementChild;
          m.anims.push(anim(fresh, [{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: 'linear' }),
            ...old.map((el) => anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_FADE_MS, easing: 'linear', fill: 'forwards' })));
          later(m, REDUCED_FADE_MS, () => old.forEach((el) => el.remove()));
        } else {
          const oldPlant = top()?.querySelector('[id$="--slot-plant"] > *')?.cloneNode(true) ?? null;
          stageNow(to);
          const ours = () => '';
          face('pleasant-high', ours); // the caption note wins over this word; the face ends after 1.5 s
          later(m, FACE_MS, () => { if (pokeWord === ours) face(null, null); });
          const svgs = [...layers.querySelectorAll('svg')];
          svgs.forEach((svg, i) => m.anims.push(springGrowth(svg, from, to), ...growPlant(svg, i === svgs.length - 1 ? oldPlant : null)));
          const b = burst();
          root.append(b.overlay);
          m.nodes.push(b.overlay);
          m.anims.push(...b.anims);
          later(m, BURST_MS, () => b.overlay.remove());
        }
      }
      if (caption && thanks) {
        note = thanks;
        setCaption();
        const sp = captionSpark(band, { reduce });
        phraseEl.after(sp.box);
        m.nodes.push(sp.box);
        m.anims.push(...sp.anims);
        later(m, reduce ? CAPTION_MS - REDUCED_FADE_MS : SPARK_OUT_MS, () => m.anims.push(captionSparkOut(sp.box, { reduce })));
        later(m, CAPTION_MS, () => { note = null; sp.box.remove(); setCaption(); });
      }
      m.anims = m.anims.filter(Boolean);
    },
    // R2 (Q-064): a second companion that mirrors this one (look, stage, mood, face). It starts from this one's state.
    addMirror(other) {
      mirrors.add(other);
      other.setLook({ character: ['honey', 'cotton', 'matcha'].indexOf(char) + 1, outfit }, { animate: false });
      other.setStage(stage);
      other.setMood(current);
      if (shown !== current) other.showFace(shown, pokeWord);
    },
    removeMirror(other) { mirrors.delete(other); },
    // The reply side is still warming: caption "还在醒来", art unchanged (FLOW-006).
    // Q-015: caption and accessible name again in the current language
    refresh() { if (!preview) root.setAttribute('aria-label', label()); setCaption(); },
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
