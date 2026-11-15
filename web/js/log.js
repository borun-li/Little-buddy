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
  let card = null; // Q-030: the help card's own list item, under its crisis reply (one at a time)
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

  function removeCard() {
    card?.remove();
    card = null;
  }

  // 988 and 911 are 600 weight plain text (no links); built from text nodes only.
  function fillNumbers(el, text) {
    el.replaceChildren();
    text.split(/(988|911)/).forEach((part) => {
      if (!part) return;
      if (part === '988' || part === '911') {
        const b = document.createElement('strong');
        b.textContent = part;
        el.append(b);
      } else el.append(part);
    });
  }

  function fillCard() {
    if (!card) return;
    const r = card.querySelector('.crisis-card');
    r?.setAttribute('aria-label', copy.crisisLabel);
    const t = card.querySelector('.crisis-card__title');
    if (t) t.textContent = copy.crisisTitle;
    const a = card.querySelector('.crisis-card__988');
    if (a) fillNumbers(a, copy.crisis988);
    const b = card.querySelector('.crisis-card__911');
    if (b) fillNumbers(b, copy.crisis911);
    const c = card.querySelector('.crisis-card__close');
    if (c) {
      c.textContent = copy.crisisClose;
      c.setAttribute('aria-label', copy.crisisCloseName);
    }
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
      fillCard();
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
      card = null;
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
    // Q-030 / CMP-010: a calm region under its crisis reply; 收起 removes it and calls onClose (the page
    // moves focus to the input). A new card replaces the old one. Arriving takes no focus.
    showCrisisCard(onClose) {
      removeCard();
      const li = document.createElement('li');
      li.className = 'turn turn--card';
      const region = document.createElement('div');
      region.className = 'crisis-card';
      region.setAttribute('role', 'region');
      region.dataset.testid = 'crisis-card';
      const title = document.createElement('p');
      title.className = 'crisis-card__title';
      const l988 = document.createElement('p');
      l988.className = 'crisis-card__988';
      const l911 = document.createElement('p');
      l911.className = 'crisis-card__911';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'crisis-card__close';
      close.addEventListener('click', () => { removeCard(); onClose?.(); });
      region.append(title, l988, l911, close);
      li.append(region);
      card = add(li);
      fillCard();
      return close;
    },
    removeCard,
    get cardShown() { return card !== null; },
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
