// CMP-002: renders turns in order, keeps the newest in view, and moves
// data-testid=reply to the latest companion reply only.
import { copy } from './copy.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createLog(scroller, list, emptyState) {
  let typing = null;

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
      if (voice) {
        const tag = document.createElement('span');
        tag.className = 'turn__tag';
        tag.innerHTML = '<svg class="icon icon--small" aria-hidden="true"><use href="#i-mic"/></svg>';
        tag.append(copy.voiceTag);
        li.append(tag);
      }
      const body = document.createElement('span');
      body.className = 'turn__text';
      body.textContent = text;
      li.append(body);
      return add(li);
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
