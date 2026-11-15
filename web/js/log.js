// CMP-002: renders turns in order, keeps the newest in view, and moves
// data-testid=reply to the latest companion reply only.
import { copy } from './copy.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function voiceTag() {
  const tag = document.createElement('span');
  tag.className = 'turn__tag';
  tag.innerHTML = '<svg class="icon icon--small" aria-hidden="true"><use href="#i-mic"/></svg>';
  const word = document.createElement('span');
  word.className = 'turn__tag-text';
  word.textContent = copy.voiceTag;
  tag.append(word);
  return tag;
}

const transcribingWords = () => copy.transcribing.replace(/…$/, '');

export function createLog(scroller, list, emptyState) {
  let typing = null;
  let offer = null; // Q-028: the breathing chip's own list item, under the newest worried reply
  let offerBtn = null;
  let offerStop = false; // Q-029: the chip reads 停下 while the guide runs
  const emptyOriginal = emptyState;

  function scrollToNewest() {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function removeOffer() {
    offer?.remove();
    offer = null;
    offerBtn = null;
    offerStop = false;
  }

  function add(li) {
    emptyState?.remove();
    emptyState = null;
    list.append(li);
    scrollToNewest();
    return li;
  }

  return {
    addYou(text, { voice = false } = {}) {
      const li = document.createElement('li');
      li.className = 'turn turn--you';
      if (voice) li.append(voiceTag());
      const body = document.createElement('span');
      body.className = 'turn__text';
      body.textContent = text;
      li.append(body);
      return add(li);
    },
    // Q-014 (CMP-002 you-transcribing): own turn with the voice tag and "transcribing" + moving dots.
    addTranscribing() {
      const li = document.createElement('li');
      li.className = 'turn turn--you turn--transcribing';
      li.append(voiceTag());
      const body = document.createElement('span');
      body.className = 'turn__text';
      const words = document.createElement('span');
      words.className = 'turn__placeholder';
      words.textContent = transcribingWords();
      body.append(words);
      const dots = document.createElement('span');
      dots.className = 'typing typing--inline';
      dots.setAttribute('aria-hidden', 'true');
      dots.innerHTML = '<span class="typing__dot"></span><span class="typing__dot"></span>'
        + '<span class="typing__dot"></span><span class="typing__static">…</span>';
      body.append(dots);
      li.append(body);
      return add(li);
    },
    // The same box takes the words, in place, in primary colour.
    setWords(turn, text) {
      turn.classList.remove('turn--transcribing');
      turn.querySelector('.turn__text').textContent = text;
    },
    showTyping() {
      const li = document.createElement('li');
      li.className = 'turn turn--typing';
      li.innerHTML = '<span class="typing" aria-hidden="true"><span class="typing__dot"></span>'
        + '<span class="typing__dot"></span><span class="typing__dot"></span>'
        + '<span class="typing__static">…</span></span>';
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = copy.typing;
      li.append(sr);
      typing = add(li);
    },
    // Q-011: a failed send takes its own turn and the typing dots away; with no turn left the empty
    // state returns (it is the state the page opened in).
    // Q-015: the words that are not chat (voice tag, transcribing placeholder, typing label) follow the
    // interface language; typed, spoken and reply text never change.
    refresh() {
      list.querySelectorAll('.turn__tag-text').forEach((el) => { el.textContent = copy.voiceTag; });
      list.querySelectorAll('.turn__placeholder').forEach((el) => { el.textContent = transcribingWords(); });
      list.querySelectorAll('.turn--typing .sr-only').forEach((el) => { el.textContent = copy.typing; });
      list.querySelectorAll('.breath-chip__text').forEach((el) => { el.textContent = offerStop ? copy.breathStop : copy.breathOffer; });
      if (offerStop) offerBtn?.setAttribute?.('aria-label', copy.breathStopName);
    },
    dropFailed(turn) {
      typing?.remove();
      typing = null;
      turn?.remove();
      if (emptyOriginal && !list.children.length) {
        emptyState = emptyOriginal;
        scroller.prepend(emptyOriginal);
      }
    },
    // Q-022: every turn and the typing dots leave at once; the original empty state comes back.
    clear() {
      list.replaceChildren();
      typing = null;
      offer = null;
      offerBtn = null;
      offerStop = false;
      if (emptyOriginal) {
        emptyState = emptyOriginal;
        if (!emptyOriginal.isConnected) scroller.prepend(emptyOriginal);
      }
      scroller.scrollTop = 0;
    },
    // Q-028 / CMP-009 offer: a small outlined button in its own item, 12 px under the newest reply. Only one
    // exists; a new reply, a send and a clear take it away. onStart is Q-029's hook (the guide starts there).
    showOffer(onStart) {
      removeOffer();
      const li = document.createElement('li');
      li.className = 'turn turn--offer';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'breath-chip';
      btn.dataset.testid = 'breath-offer';
      btn.innerHTML = '<svg class="icon icon--chip" aria-hidden="true"><use href="#i-wind"/></svg>';
      const word = document.createElement('span');
      word.className = 'breath-chip__text';
      word.textContent = copy.breathOffer;
      btn.append(word);
      btn.addEventListener('click', () => onStart?.(btn));
      li.append(btn);
      offer = add(li);
      offerBtn = btn;
      offerStop = false;
      return btn;
    },
    // Q-029 / CMP-009 stop variant: the same button (so focus stays) swaps icon, words and accessible name.
    // No chip: nothing to do. Offer again when the guide ends.
    setOfferStop(on) {
      if (!offerBtn || offerStop === on) return;
      offerStop = on;
      offerBtn.querySelector('use')?.setAttribute('href', on ? '#i-square' : '#i-wind');
      const word = offerBtn.querySelector('.breath-chip__text');
      if (word) word.textContent = on ? copy.breathStop : copy.breathOffer;
      if (on) offerBtn.setAttribute('aria-label', copy.breathStopName);
      else offerBtn.removeAttribute('aria-label');
    },
    removeOffer,
    get offerShown() { return offer !== null; },
    addReply(text) {
      typing?.remove();
      typing = null;
      removeOffer();
      list.querySelector('[data-testid="reply"]')?.removeAttribute('data-testid');
      const li = document.createElement('li');
      li.className = 'turn turn--reply';
      li.dataset.testid = 'reply';
      li.textContent = text;
      return add(li);
    },
  };
}
