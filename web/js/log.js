// CMP-002: renders turns in order, keeps the newest in view, and moves
// data-testid=reply to the latest companion reply only.
import { copy } from './copy.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function voiceTag() {
  const tag = document.createElement('span');
  tag.className = 'turn__tag';
  tag.innerHTML = '<svg class="icon icon--small" aria-hidden="true"><use href="#i-mic"/></svg>';
  tag.append(copy.voiceTag);
  return tag;
}

export function createLog(scroller, list, emptyState) {
  let typing = null;
  const emptyOriginal = emptyState;

  function scrollToNewest() {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' });
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
      body.append(copy.transcribing.replace(/…$/, ''));
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
    dropFailed(turn) {
      typing?.remove();
      typing = null;
      turn?.remove();
      if (emptyOriginal && !list.children.length) {
        emptyState = emptyOriginal;
        scroller.prepend(emptyOriginal);
      }
    },
    addReply(text) {
      typing?.remove();
      typing = null;
      list.querySelector('[data-testid="reply"]')?.removeAttribute('data-testid');
      const li = document.createElement('li');
      li.className = 'turn turn--reply';
      li.dataset.testid = 'reply';
      li.textContent = text;
      return add(li);
    },
  };
}
