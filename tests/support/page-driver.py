#!/usr/bin/env python3
# Headless-browser driver for tests/memory-page.test.js (be-tester #4). One scenario per call:
#   python3 page-driver.py <scenario> '<json args>'  ->  one JSON object on stdout.
# It only drives the page of a gateway the node test started (args.base); it never starts or stops a server.
# Hooks are the data-testid values of web/index.html and web/js/memory-ui.js.
import json
import sys
import time
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

INPUT = '[data-testid=fake-input]'
REPLY = '[data-testid=reply]'
READY = "!!document.querySelector('[data-testid=memory-notice]') || (document.querySelector('.log__privacy-text') && document.querySelector('.log__privacy-text').textContent.length > 0)"


class Page:
    def __init__(self, pw, base, lang='zh', width=1280, height=900, storage=None, once=False):
        self.base = base
        self.browser = pw.chromium.launch()
        self.ctx = self.browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN' if lang == 'zh' else 'en-US')
        if storage and once:  # live runs (be-tester #6): seed once per tab, so a migration that removes the key is not undone by a reload
            self.ctx.add_init_script('(() => { try { if (sessionStorage.getItem("__seeded")) return; sessionStorage.setItem("__seeded", "1"); for (const [k, v] of Object.entries(%s)) localStorage.setItem(k, v); } catch (e) {} })()' % json.dumps(storage))
        elif storage:
            self.ctx.add_init_script('(() => { try { for (const [k, v] of Object.entries(%s)) localStorage.setItem(k, v); } catch (e) {} })()' % json.dumps(storage))
        self.page = self.ctx.new_page()
        self.requests = []
        self.responses = []
        self.page.on('request', lambda r: self.requests.append({'method': r.method, 'url': r.url, 'body': r.post_data}))
        self.page.on('response', lambda r: self.responses.append({'method': r.request.method, 'url': r.url, 'status': r.status}))
        self.respond_json = []
        self.page.on('response', self._grab)

    def _grab(self, r):  # the /api/respond bodies (mood, reply), for the live checks
        try:
            if r.request.method == 'POST' and urlparse(r.url).path == '/api/respond' and r.status == 200:
                self.respond_json.append(r.json())
        except Exception:
            pass

    def goto(self, wait_profile=True):
        self.page.goto(self.base + '/')
        if wait_profile:  # the profile read has answered (or failed) when the first-run notice is up (FND-046: the privacy line is empty then) or the privacy line has words
            self.page.wait_for_function(READY, timeout=10000)
        return self

    def close(self):
        self.browser.close()

    def api(self, path, method='GET', data=None):
        r = self.ctx.request.fetch(self.base + path, method=method, data=json.dumps(data) if data is not None else None, headers={'content-type': 'application/json'} if data is not None else None)
        try:
            body = r.json()
        except Exception:
            body = None
        return {'status': r.status, 'json': body}

    def visible(self, sel):
        loc = self.page.locator(sel)
        return loc.count() > 0 and loc.first.is_visible()

    def text(self, sel, default=''):
        loc = self.page.locator(sel)
        return loc.first.inner_text() if loc.count() else default

    def send(self, line):
        before = self.page.locator(REPLY).count()
        self.page.fill(INPUT, line)
        self.page.press(INPUT, 'Enter')
        self.page.wait_for_function("(() => { const r = document.querySelector('[data-testid=reply]'); return r && r.textContent.length > 0 && !document.querySelector('.typing, [data-typing]'); })()", timeout=15000)
        self.page.wait_for_timeout(300)
        return before

    def turns(self):
        return self.page.locator('.log__turns > li').count()

    def hint(self):
        return self.text('.hint__text')

    def post_responses(self, path):
        return [r for r in self.responses if r['method'] == 'POST' and urlparse(r['url']).path == path]

    def respond_bodies(self):
        out = []
        for r in self.requests:
            if r['method'] == 'POST' and urlparse(r['url']).path == '/api/respond':
                try:
                    out.append(json.loads(r['body']))
                except Exception:
                    out.append(None)
        return out

    def open_drawer(self, which):
        self.page.click('[data-testid=open-%s]' % which)
        self.page.wait_for_selector('[data-testid=drawer]', state='visible', timeout=5000)

    def settle(self, ms=500):
        self.page.wait_for_timeout(ms)


def post_status(pg, path):
    rs = pg.post_responses(path)
    return rs[-1]['status'] if rs else None


def api_post_error(pg, path):  # the body of the last POST answer, read with the same request the page sent
    return None


# ------------------------------------------------------------------ scenarios
def s_notice(a, pw):
    pg = Page(pw, a['base'], a.get('lang', 'zh'), storage=a.get('storage')).goto()
    pg.page.wait_for_timeout(300)
    out = {
        'notice_visible': pg.visible('[data-testid=memory-notice]'),
        'notice_text': pg.text('[data-testid=memory-notice]'),
        'has_turn_off': pg.visible('[data-testid=notice-off]'),
        'has_ack': pg.visible('[data-testid=notice-ok]'),
        'name_shown': pg.text('.caption__name'),
        'privacy': pg.text('.log__privacy-text'),
        'turns_before_send': pg.turns(),
    }
    pg.close()
    return out


def about_chunks(pg):
    return pg.page.evaluate("""() => {
      const box = document.querySelector('[data-testid=about-box]');
      if (!box) return null;
      const cap = box.querySelector('.about__file');
      const clone = box.cloneNode(true); clone.querySelector('.about__file')?.remove();
      return { content: clone.textContent, withCaption: box.textContent, caption: cap ? cap.textContent : null,
               editable: !!box.querySelector('input, textarea, select, [contenteditable]') || box.isContentEditable };
    }""")


def s_about(a, pw):
    pg = Page(pw, a['base']).goto()
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000)
    pg.settle(300)
    ch = about_chunks(pg)
    out = {'empty_state': pg.visible('[data-testid=about-empty]'), 'chunks': ch}
    if ch:
        pg.page.locator('[data-testid=about-box]').click()
        pg.page.keyboard.type('abc')
        after = about_chunks(pg)
        out['typing_changed'] = after['content'] != ch['content']
    pg.close()
    return out


def s_forget(a, pw):
    pg = Page(pw, a['base']).goto()
    for line in a.get('lines', []):
        pg.send(line)
    before_turns = pg.turns()
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=forget]', timeout=8000)
    pg.page.click('[data-testid=forget]')
    pg.page.wait_for_selector('[data-testid=forget-yes]', timeout=3000)
    t0 = time.time()
    pg.page.click('[data-testid=forget-yes]')
    pg.page.wait_for_selector('[data-testid=forget-result]', timeout=5000)
    ms = (time.time() - t0) * 1000
    pg.settle(300)
    out = {'ms': ms, 'result_text': pg.text('[data-testid=forget-result]'), 'about_empty_visible': pg.visible('[data-testid=about-empty]'),
           'turns_before': before_turns, 'turns_after': pg.turns(), 'forget_status': post_status(pg, '/api/forget')}
    pg.settle(300)  # the drawer's live region is written 50 ms after the result is drawn
    out['announce'] = pg.text('[data-testid=drawer-announce]')
    attr = lambda sel, name: pg.page.get_attribute(sel, name) if pg.page.locator(sel).count() else None
    out['announce_role'] = attr('[data-testid=drawer-announce]', 'role')
    out['result_role'] = attr('[data-testid=forget-result]', 'role')
    out['focus_testid'] = pg.page.evaluate("document.activeElement && document.activeElement.dataset.testid")
    out['diary_has_any'] = pg.api('/api/diary')['json']['hasAny']
    out['about_empty_api'] = pg.api('/api/profile')['json']['aboutEmpty']
    if a.get('send_after'):
        pg.page.click('[data-testid=drawer-close]')
        pg.send('忘掉之后的新一句')
        bodies = pg.respond_bodies()
        out['last_history'] = bodies[-1]['history'] if bodies else None
    pg.close()
    return out


def s_empty_tabs(a, pw):
    pg = Page(pw, a['base']).goto()
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000)
    out = {'about_empty_state': pg.visible('[data-testid=about-empty]'), 'about_box': pg.visible('[data-testid=about-box]')}
    pg.page.click('[data-testid=tab-diary]')
    pg.page.wait_for_selector('[data-testid=diary-start], [data-testid=diary-days]', timeout=8000)
    out['diary_empty_state'] = pg.visible('[data-testid=diary-start]')
    out['diary_days'] = pg.visible('[data-testid=diary-days]')
    out['notice_visible'] = pg.visible('[data-testid=memory-notice]')
    pg.close()
    return out


def s_setting_fail(a, pw):
    pg = Page(pw, a['base']).goto()
    case = a['case']
    pg.page.wait_for_timeout(300)
    out = {'notice_before': pg.visible('[data-testid=memory-notice]')}
    if case in ('name', 'region', 'memory'):
        pg.open_drawer('about')
        pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000)
        pg.settle(200)
    if case == 'name':
        pg.page.fill('[data-testid=about-name]', 'Mochi')
        pg.page.press('[data-testid=about-name]', 'Enter')
    elif case == 'region':
        pg.page.select_option('[data-testid=about-region]', 'US')
    elif case == 'memory':
        pg.page.click('[data-testid=memory-switch]')
    elif case == 'notice_ok':
        pg.page.click('[data-testid=notice-ok]')
    elif case == 'notice_off':
        pg.page.click('[data-testid=notice-off]')
    pg.page.wait_for_timeout(1200)
    out['status'] = post_status(pg, '/api/profile')
    out['msgs'] = [t for t in pg.page.eval_on_selector_all('.field-msg', 'els => els.map(e => e.textContent)') if t]
    out['hint'] = pg.hint()
    if case in ('notice_ok', 'notice_off'):  # what the controls show after the failed notice choice
        out['notice_after'] = pg.visible('[data-testid=memory-notice]')
        pg.open_drawer('about')
        pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000)
        pg.settle(200)
    out['shown'] = {
        'name': pg.page.input_value('[data-testid=about-name]') if pg.visible('[data-testid=about-name]') else None,
        'region': pg.page.input_value('[data-testid=about-region]') if pg.visible('[data-testid=about-region]') else None,
        'memoryOn': pg.page.get_attribute('[data-testid=memory-switch]', 'aria-checked') if pg.visible('[data-testid=memory-switch]') else None,
    }
    out.setdefault('notice_after', pg.visible('[data-testid=memory-notice]'))
    out['profile_api'] = pg.api('/api/profile')['json']
    pg.close()
    return out


def s_forget_fail(a, pw):
    pg = Page(pw, a['base']).goto()
    if a.get('line'):
        pg.send(a['line'])
    turns = pg.turns()
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=forget]', timeout=8000)
    pg.page.click('[data-testid=forget]')
    pg.page.click('[data-testid=forget-yes]')
    pg.page.wait_for_timeout(1200)
    out = {'status': post_status(pg, '/api/forget'), 'asked_text': pg.text('.forget'), 'result_visible': pg.visible('[data-testid=forget-result]'),
           'turns_before': turns, 'turns_after': pg.turns(), 'switch': pg.page.get_attribute('[data-testid=memory-switch]', 'aria-checked'),
           'about_empty_visible': pg.visible('[data-testid=about-empty]')}
    if a.get('expect_ok'):
        out['result_text'] = pg.text('[data-testid=forget-result]')
    pg.close()
    return out


def s_unreadable(a, pw):
    pg = Page(pw, a['base']).goto()
    pg.page.wait_for_timeout(300)
    out = {'privacy': pg.text('.log__privacy-text'), 'name_shown': pg.text('.caption__name'), 'notice_visible': pg.visible('[data-testid=memory-notice]')}
    pg.open_drawer('diary')
    pg.page.wait_for_selector('[data-testid=retry]', timeout=8000)
    out['diary_text'] = pg.text('[data-testid=panel-diary]')
    out['diary_retry'] = pg.visible('[data-testid=retry]')
    n = lambda: len([r for r in pg.requests if urlparse(r['url']).path == '/api/diary'])
    c1 = n(); pg.page.wait_for_timeout(10000); c2 = n()
    out['diary_requests'] = [c1, c2]
    pg.page.click('[data-testid=tab-about]')
    pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000)
    pg.settle(300)
    out['about_text'] = pg.text('[data-testid=panel-about]')
    out['dead'] = {'name_disabled': pg.page.is_disabled('[data-testid=about-name]'), 'region_disabled': pg.page.is_disabled('[data-testid=about-region]'),
                   'switch_disabled': pg.page.is_disabled('[data-testid=memory-switch]'), 'forget_present': pg.visible('[data-testid=forget]')}
    for sel in ('[data-testid=about-name]', '[data-testid=about-region]', '[data-testid=memory-switch]'):
        try:
            pg.page.click(sel, timeout=800, force=True)
        except Exception:
            pass
    pg.settle(400)
    out['post_requests'] = [r['url'] for r in pg.requests if r['method'] == 'POST' and urlparse(r['url']).path in ('/api/profile', '/api/forget')]
    pg.page.click('[data-testid=drawer-close]')
    pg.send('不读记忆也能聊天')
    out['chat_works'] = pg.visible(REPLY)
    pg.close()
    return out


def s_diary(a, pw):
    pg = Page(pw, a['base']).goto()
    t0 = time.time()
    pg.open_drawer('diary')
    pg.page.wait_for_selector('[data-testid=diary-days] .day, [data-testid=diary-start]', timeout=10000)
    ms = (time.time() - t0) * 1000
    pg.settle(200)
    data = pg.page.evaluate("""() => {
      const dots = [...document.querySelectorAll('.curve__dot')].map(d => ({ left: d.style.left, top: d.style.top, cls: d.className }));
      const none = document.querySelectorAll('.curve__none').length;
      const days = [...document.querySelectorAll('[data-testid=diary-days] .day')].map(s => ({
        head: s.querySelector('.day__head').textContent,
        rows: [...s.querySelectorAll('.day__row')].map(r => ({ point: r.querySelector('.day__point').textContent, mood: r.querySelector('.mood').textContent }))
      }));
      const lines = [...document.querySelectorAll('.curve__line')].map(l => l.getAttribute('points'));
      return { dots, none, lines, days, curve: !!document.querySelector('.curve'), start: !!document.querySelector('[data-testid=diary-start]') };
    }""")
    data['ms'] = ms
    pg.close()
    return data


def s_sweep(a, pw):
    pg = Page(pw, a['base'], storage=a.get('storage')).goto()
    checks = []
    def ck(name, ok, detail=None):
        checks.append({'name': name, 'ok': bool(ok), 'detail': detail})
    prof = lambda: pg.api('/api/profile')['json']
    ck('notice visible at open', pg.visible('[data-testid=memory-notice]'))
    title_zh = pg.text('.notice__title')
    pg.page.click('.lang-switch [data-lang=en]'); pg.settle(300)
    title_en = pg.text('.notice__title')
    ck('language switch re-says the notice in English', title_en != title_zh and 'will remember' in title_en, [title_zh, title_en])
    ck('stage buttons follow the language', pg.page.get_attribute('[data-testid=open-diary]', 'aria-label') == 'Mood diary', pg.page.get_attribute('[data-testid=open-diary]', 'aria-label'))
    pg.open_drawer('diary')
    ck('drawer tab words in English', pg.text('[data-testid=tab-diary]') == 'Mood diary' and pg.text('[data-testid=tab-about]') == 'What Buddy remembers', [pg.text('[data-testid=tab-diary]'), pg.text('[data-testid=tab-about]')])
    pg.page.click('[data-testid=drawer-close]')
    pg.page.click('.lang-switch [data-lang=zh]'); pg.settle(300)
    ck('back to Chinese', '会记住' in pg.text('.notice__title'), pg.text('.notice__title'))
    pg.page.click('[data-testid=notice-ok]'); pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    ck('知道了 stores noticeSeen', prof()['noticeSeen'] is True)
    pg.page.reload(); pg.page.wait_for_function(READY); pg.settle(300)
    ck('notice gone after reload', not pg.visible('[data-testid=memory-notice]'))
    # drawer open/close and tabs
    pg.open_drawer('diary')
    ck('diary panel shown', pg.visible('[data-testid=panel-diary]'))
    pg.page.click('[data-testid=tab-about]'); pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000)
    ck('about panel shown', pg.visible('[data-testid=panel-about]') and not pg.visible('[data-testid=panel-diary]'))
    pg.page.click('[data-testid=tab-diary]'); pg.settle(200)
    ck('back to diary tab', pg.visible('[data-testid=panel-diary]'))
    pg.page.click('[data-testid=drawer-close]'); pg.settle(200)
    ck('drawer closes', not pg.visible('[data-testid=drawer]'))
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000); pg.settle(200)
    pg.page.fill('[data-testid=about-name]', 'Mochi'); pg.page.press('[data-testid=about-name]', 'Enter'); pg.settle(600)
    ck('rename stores the name', prof()['name'] == 'Mochi', prof()['name'])
    ck('caption follows the name', pg.text('.caption__name') == 'Mochi', pg.text('.caption__name'))
    for r in ('US', 'other', 'CN'):
        pg.page.select_option('[data-testid=about-region]', r); pg.settle(500)
        ck('region %s stored' % r, prof()['region'] == r, prof()['region'])
    pg.page.click('[data-testid=memory-switch]'); pg.settle(600)
    ck('switch off stored', prof()['memoryOn'] is False)
    pg.page.click('[data-testid=memory-switch]'); pg.settle(600)
    ck('switch on stored', prof()['memoryOn'] is True)
    before = prof()
    ck('kept something before forget', before['kept'] is True and before['aboutEmpty'] is False)
    pg.page.click('[data-testid=forget]'); pg.page.click('[data-testid=forget-no]'); pg.settle(400)
    ck('forget not confirmed keeps everything', prof()['about'] == before['about'] and prof()['kept'] is True)
    pg.page.click('[data-testid=forget]'); pg.page.click('[data-testid=forget-yes]'); pg.page.wait_for_selector('[data-testid=forget-result]', timeout=5000)
    after = prof()
    ck('forget confirmed empties', after['aboutEmpty'] is True and after['kept'] is False and after['name'] == 'Mochi' and after['region'] == 'CN')
    local = lambda u: u.startswith(('data:', 'blob:'))  # a blob: or data: URL is made by the page itself, never fetched from a network
    net = [r for r in pg.responses if not local(r['url'])]
    bad = [r for r in net if urlparse(r['url']).netloc != urlparse(a['base']).netloc]
    ck('only the page origin was requested', not bad and all(urlparse(r['url']).netloc == urlparse(a['base']).netloc for r in pg.requests if not local(r['url'])), bad[:3])
    ck('every response ok', all(r['status'] in (200, 204, 304) for r in net), [r for r in net if r['status'] not in (200, 204, 304)][:5])
    urls = sorted({r['url'] for r in pg.responses if r['method'] == 'GET' and r['url'].startswith(('http://', 'https://'))})
    refetch = [(u, pg.ctx.request.get(u).status) for u in urls]
    ck('every referenced resource answers 200', all(s == 200 for _, s in refetch), [x for x in refetch if x[1] != 200][:5])
    pg.close()
    return {'checks': checks, 'urls': urls}


def s_sweep_off(a, pw):
    pg = Page(pw, a['base']).goto()
    checks = []
    pg.page.click('[data-testid=notice-off]'); pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    p = pg.api('/api/profile')['json']
    checks.append({'name': '关掉记忆 stores memoryOn false and noticeSeen true', 'ok': p['memoryOn'] is False and p['noticeSeen'] is True, 'detail': [p['memoryOn'], p['noticeSeen']]})
    checks.append({'name': 'privacy line says memory is off', 'ok': '记忆关着' in pg.text('.log__privacy-text'), 'detail': pg.text('.log__privacy-text')})
    pg.close()
    return {'checks': checks}


# ------------------------------------------------------------------ live scenarios (real Bonsai; be-tester #6, TC-203, TC-207, TC-213)
def wait_privacy(pg):
    pg.page.wait_for_function(READY, timeout=10000)


def s_live_open(a, pw):  # TC-203 steps 1-2: an earlier-version user (localStorage name), notice before any send, then 知道了, reload
    pg = Page(pw, a['base'], storage=a.get('storage'), once=True).goto()
    pg.page.wait_for_timeout(1000)
    out = {'notice_before_first_send': pg.visible('[data-testid=memory-notice]'), 'notice_text': pg.text('[data-testid=memory-notice]'),
           'has_turn_off': pg.visible('[data-testid=notice-off]'), 'name_shown': pg.text('.caption__name'), 'turns_before_send': pg.turns()}
    out['profile'] = pg.api('/api/profile')['json']
    out['ls_after_open'] = pg.page.evaluate("localStorage.getItem('companion.name')")
    pg.page.click('[data-testid=notice-ok]')
    pg.page.wait_for_timeout(800)
    pg.page.reload()
    wait_privacy(pg)
    pg.page.wait_for_timeout(500)
    out['notice_after_ack_reload'] = pg.visible('[data-testid=memory-notice]')
    out['name_after_reload'] = pg.text('.caption__name')
    out['ls_after_reload'] = pg.page.evaluate("localStorage.getItem('companion.name')")
    pg.close()
    return out


def s_live_read(a, pw):  # a new tab after a restart: notice? name shown? (profile says the rest)
    pg = Page(pw, a['base']).goto()
    pg.page.wait_for_timeout(600)
    out = {'notice_visible': pg.visible('[data-testid=memory-notice]'), 'name_shown': pg.text('.caption__name'), 'profile': pg.api('/api/profile')['json']}
    pg.close()
    return out


def s_live_rename(a, pw):  # TC-203 steps 4-5: rename to Mochi in the 关于你 tab, three new chats each ask the name
    pg = Page(pw, a['base']).goto()
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000)
    pg.settle(200)
    pg.page.fill('[data-testid=about-name]', a.get('name', 'Mochi'))
    pg.page.press('[data-testid=about-name]', 'Enter')
    pg.page.wait_for_timeout(1200)
    pg.page.click('[data-testid=drawer-close]')
    pg.page.wait_for_timeout(300)
    out = {'caption_after_rename': pg.text('.caption__name'), 'status': post_status(pg, '/api/profile'), 'replies': []}
    for i in range(a.get('sends', 3)):
        if i:
            pg.page.reload()
            wait_privacy(pg)
        pg.send(a.get('line', '你叫什么名字？'))
        out['replies'].append(pg.text(REPLY))
    out['profile'] = pg.api('/api/profile')['json']
    pg.close()
    return out


def s_live_inflight(a, pw):  # TC-207: send, open 小伙伴记得的你 and forget before the reply, then watch the page for the late reply
    pg = Page(pw, a['base']).goto()
    pg.page.fill(INPUT, a['line'])
    pg.page.press(INPUT, 'Enter')
    t0 = time.time()
    pg.page.click('[data-testid=open-about]')
    pg.page.wait_for_selector('[data-testid=forget]', timeout=8000)
    pg.page.click('[data-testid=forget]')
    pg.page.wait_for_selector('[data-testid=forget-yes]', timeout=3000)
    pg.page.click('[data-testid=forget-yes]')
    pg.page.wait_for_selector('[data-testid=forget-result]', timeout=5000)
    out = {'forget_after_send_ms': (time.time() - t0) * 1000, 'forget_status': post_status(pg, '/api/forget'), 'responses_at_forget': len(pg.respond_json)}
    pg.page.click('[data-testid=drawer-close]')
    pg.page.wait_for_timeout(a.get('watch_ms', 20000))  # the reply arrives (or fails) meanwhile
    out['responses_after'] = len(pg.respond_json)
    out['turns_after'] = pg.turns()
    out['reply_visible'] = pg.visible(REPLY)
    out['hint'] = pg.hint()
    pg.close()
    return out


def s_live_goal_a(a, pw):  # TC-213 stage A: open, read the notice, send three lines
    pg = Page(pw, a['base'], width=1280, height=900).goto()
    pg.page.wait_for_timeout(600)
    out = {'notice_text': pg.text('[data-testid=memory-notice]'), 'notice_visible': pg.visible('[data-testid=memory-notice]'), 'path': pg.api('/api/profile')['json']['path']}
    pg.page.screenshot(path=a['shots'] + '/r1-goal-1-notice.png')
    for line in a['lines']:
        pg.send(line)
    out['moods'] = [j.get('mood') for j in pg.respond_json]
    out['replies'] = [j.get('reply') for j in pg.respond_json]
    pg.page.screenshot(path=a['shots'] + '/r1-goal-2-chat.png')
    pg.close()
    return out


def s_live_goal_b(a, pw):  # TC-213 stage B: after restart and reload: ask, diary, about, rename + region, forget me
    pg = Page(pw, a['base'], width=1280, height=900).goto()
    pg.send(a['ask'])
    out = {'ask_reply': pg.text(REPLY), 'ask_mood': pg.respond_json[-1].get('mood') if pg.respond_json else None}
    pg.open_drawer('diary')
    pg.page.wait_for_selector('[data-testid=diary-days] .day, [data-testid=diary-start]', timeout=10000)
    pg.settle(300)
    out['diary'] = pg.page.evaluate("""() => ({
      dots: document.querySelectorAll('.curve__dot').length,
      days: [...document.querySelectorAll('[data-testid=diary-days] .day')].map(s => ({ head: s.querySelector('.day__head').textContent,
        rows: [...s.querySelectorAll('.day__row')].map(r => ({ point: r.querySelector('.day__point').textContent, mood: r.querySelector('.mood').textContent })) }))
    })""")
    pg.page.screenshot(path=a['shots'] + '/r1-goal-3-diary.png')
    pg.page.click('[data-testid=tab-about]')
    pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000)
    pg.settle(300)
    out['about_text'] = pg.text('[data-testid=about-box]')
    out['about_empty_visible'] = pg.visible('[data-testid=about-empty]')
    pg.page.screenshot(path=a['shots'] + '/r1-goal-4-about.png')
    pg.page.fill('[data-testid=about-name]', a['name'])
    pg.page.press('[data-testid=about-name]', 'Enter')
    pg.page.wait_for_timeout(1000)
    pg.page.select_option('[data-testid=about-region]', a['region'])
    pg.page.wait_for_timeout(1000)
    out['profile_after_settings'] = pg.api('/api/profile')['json']
    pg.page.screenshot(path=a['shots'] + '/r1-goal-5-settings.png')
    pg.page.click('[data-testid=forget]')
    pg.page.wait_for_selector('[data-testid=forget-yes]', timeout=3000)
    pg.page.click('[data-testid=forget-yes]')
    pg.page.wait_for_selector('[data-testid=forget-result]', timeout=5000)
    pg.settle(400)
    out['forget_result'] = pg.text('[data-testid=forget-result]')
    out['after_forget'] = {'about_empty': pg.api('/api/profile')['json']['aboutEmpty'], 'diary_has_any': pg.api('/api/diary')['json']['hasAny']}
    pg.page.screenshot(path=a['shots'] + '/r1-goal-6-forgotten.png')
    pg.close()
    return out


def s_live_goal_c(a, pw):  # TC-213 stage C: after the last restart and reload: everything empty, name and region kept
    pg = Page(pw, a['base'], width=1280, height=900).goto()
    pg.page.wait_for_timeout(500)
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-empty], [data-testid=about-box]', timeout=8000)
    pg.settle(300)
    out = {'about_empty_visible': pg.visible('[data-testid=about-empty]'), 'name_input': pg.page.input_value('[data-testid=about-name]'), 'region_input': pg.page.input_value('[data-testid=about-region]'), 'profile': pg.api('/api/profile')['json'], 'diary_api': pg.api('/api/diary')['json']['hasAny']}
    pg.page.click('[data-testid=tab-diary]')
    pg.page.wait_for_selector('[data-testid=diary-start], [data-testid=diary-days] .day', timeout=8000)
    pg.settle(300)
    out['diary_start_visible'] = pg.visible('[data-testid=diary-start]')
    pg.page.screenshot(path=a['shots'] + '/r1-goal-7-after-restart.png')
    pg.close()
    return out


# ------------------------------------------------------------------ fe-tester #3 (review fixes, round 2)
def s_caption_fail(a, pw):  # FND-042: rename in the caption when the save answers an error; then the next send
    pg = Page(pw, a['base'], a.get('lang', 'zh'))
    if a.get('status'):
        body = json.dumps({'error': a.get('code', 'not_saved')})
        def handler(route):
            if route.request.method == 'POST':
                route.fulfill(status=a['status'], content_type='application/json', body=body)
            else:
                route.continue_()
        pg.page.route('**/api/profile', handler)
    pg.goto()
    pg.page.wait_for_timeout(300)
    out = {'caption_before': pg.text('.caption__name')}
    pg.page.click('.caption__name')
    pg.page.fill('.name-field', a.get('new', 'Mochi'))
    pg.page.press('.name-field', 'Enter')
    pg.page.wait_for_timeout(1200)
    out['caption_after'] = pg.text('.caption__name')
    out['hint'] = pg.hint()
    out['post_status'] = post_status(pg, '/api/profile')
    pg.send('今天开心')
    bodies = pg.respond_bodies()
    out['respond_names'] = [b.get('name') if b else None for b in bodies]
    out['hint_after_send'] = pg.hint()
    out['profile_api'] = pg.api('/api/profile')['json']
    pg.page.reload()
    pg.page.wait_for_function(READY, timeout=10000)
    out['caption_after_reload'] = pg.text('.caption__name')
    pg.close()
    return out


def s_clear_inflight(a, pw):  # FND-043: 清空 while the reply is on its way
    pg = Page(pw, a['base'], storage=a.get('storage'))
    failed = []
    pg.page.on('requestfailed', lambda r: failed.append(urlparse(r.url).path))
    pg.goto()
    if pg.visible('[data-testid=notice-ok]'):
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    pg.page.fill(INPUT, a['line'])
    pg.page.press(INPUT, 'Enter')
    pg.page.wait_for_function("!!document.querySelector('.typing, [data-typing]')", timeout=3000)
    pg.page.wait_for_timeout(300)  # the request has left
    if a.get('clear', True):
        pg.page.click('[data-testid=clear]')
    pg.page.wait_for_timeout(a.get('watch_ms', 5000))
    out = {'failed': failed, 'respond_requests': len(pg.respond_bodies()), 'respond_ok': len(pg.respond_json),
           'turns': pg.turns(), 'reply_visible': pg.visible(REPLY), 'hint': pg.hint(), 'typing': pg.visible('.typing, [data-typing]'),
           'input_disabled': pg.page.is_disabled(INPUT)}
    pg.close()
    return out


def s_drawer_keys(a, pw):  # FND-044: the drawer body is a Tab stop inside the trap, and the keys scroll it
    pg = Page(pw, a['base'], width=1280, height=600).goto()
    if pg.visible('[data-testid=notice-ok]'):
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    pg.open_drawer(a.get('tab', 'diary'))
    pg.page.wait_for_selector('[data-testid=diary-days] .day', timeout=10000)
    pg.settle(300)
    desc = "(() => { const e = document.activeElement; return e ? (e.classList.contains('drawer__scroll') ? 'scroll' : (e.dataset.testid || e.tagName)) : null; })()"
    metrics = pg.page.evaluate("(() => { const s = document.querySelector('.drawer__scroll'); return { sh: s.scrollHeight, ch: s.clientHeight, role: s.getAttribute('role'), tabindex: s.getAttribute('tabindex'), label: s.getAttribute('aria-labelledby') }; })()")
    out = {'metrics': metrics, 'order': [pg.page.evaluate(desc)], 'inside': []}
    inside = "!!document.activeElement && !!document.activeElement.closest('.drawer')"
    for _ in range(a.get('tabs', 8)):
        pg.page.keyboard.press('Tab')
        out['order'].append(pg.page.evaluate(desc))
        out['inside'].append(pg.page.evaluate(inside))
        if out['order'][-1] == 'scroll':
            break
    st = lambda: pg.page.evaluate("document.querySelector('.drawer__scroll').scrollTop")
    out['top0'] = st()
    if out['order'][-1] == 'scroll':
        pg.page.keyboard.press('ArrowDown'); pg.settle(400); out['after_arrow'] = st()
        pg.page.keyboard.press('PageDown'); pg.settle(400); out['after_page'] = st()
        pg.page.keyboard.press('End'); pg.settle(400); out['after_end'] = st()
    pg.close()
    return out


def s_privacy(a, pw):  # FND-046 / Q-037 / Q-038: the privacy line, the hints after 清空 and 关掉记忆
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=a.get('width', 1280), height=a.get('height', 900)).goto()
    pg.page.wait_for_timeout(400)
    body_text = "document.body.textContent"
    out = {'notice_first': pg.visible('[data-testid=memory-notice]'),
           'privacy_while_notice': pg.page.evaluate("document.querySelector('.log__privacy-text') ? document.querySelector('.log__privacy-text').textContent : null"),
           'body_has_privacy_while_notice': [pg.page.evaluate("(w) => document.body.textContent.includes(w)", w) for w in a.get('privacy_words', [])]}
    mode = a.get('mode', 'ok')
    if mode == 'off':
        pg.page.click('[data-testid=notice-off]')
    elif out['notice_first']:
        pg.page.click('[data-testid=notice-ok]')
    pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    pg.page.wait_for_timeout(300)
    out['notice_after'] = pg.visible('[data-testid=memory-notice]')
    out['privacy_after'] = pg.text('.log__privacy-text')
    out['hint_after_answer'] = pg.hint()
    if mode == 'clear':
        pg.send('今天开心')
        out['hint_after_send'] = pg.hint()
        pg.page.click('[data-testid=clear]')
        pg.page.wait_for_timeout(400)
        out['hint_after_clear'] = pg.hint()
        out['turns_after_clear'] = pg.turns()
    pg.close()
    return out


def fit_probe(pg, tag):
    return pg.page.evaluate("""(tag) => { const d = document.documentElement; const s = document.querySelector('.drawer__scroll'); const dr = document.querySelector('.drawer');
      return { tag, doc: [d.scrollWidth, d.clientWidth], body: [document.body.scrollWidth, document.body.clientWidth], scrollX: window.scrollX,
               drawer: dr && !dr.hidden ? [s.scrollWidth, s.clientWidth] : null }; }""", tag)


def s_fit(a, pw):  # Q-049: no sideways scroll at one width and language, over notice, chat and both tabs (first open, so the notice shows)
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=a['width'], height=a.get('height', 844)).goto()
    pg.page.wait_for_timeout(300)
    probes = []
    if pg.visible('[data-testid=memory-notice]'):
        probes.append(fit_probe(pg, 'notice'))
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
        pg.page.wait_for_timeout(300)
    probes.append(fit_probe(pg, 'chat'))
    pg.send('今天开心')
    probes.append(fit_probe(pg, 'chat with a reply'))
    pg.open_drawer('diary')
    pg.page.wait_for_selector('[data-testid=diary-days] .day', timeout=10000); pg.settle(300)
    probes.append(fit_probe(pg, 'diary'))
    pg.page.click('[data-testid=tab-about]')
    pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000); pg.settle(300)
    probes.append(fit_probe(pg, 'about'))
    pg.page.click('[data-testid=forget]'); pg.settle(300)
    probes.append(fit_probe(pg, 'forget asked'))
    pg.close()
    return {'probes': probes}


def s_loading(a, pw):  # Q-047: the About tab while /api/profile has not answered (the answer is held until released)
    pg = Page(pw, a['base'], a.get('lang', 'zh')).goto()
    if pg.visible('[data-testid=notice-ok]'):
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    held = []
    def handler(route):
        if route.request.method == 'GET':
            held.append(route)
        else:
            route.continue_()
    pg.page.route('**/api/profile', handler)
    pg.open_drawer('about')
    pg.page.wait_for_timeout(a.get('hold_ms', 800))
    real = ['[data-testid=about-box]', '[data-testid=about-empty]', '[data-testid=about-name]', '[data-testid=about-region]', '[data-testid=memory-switch]', '[data-testid=forget]']
    out = {'held_requests': len(held), 'skeleton': pg.visible('.skeleton--about'), 'busy': pg.page.get_attribute('[data-testid=panel-about]', 'aria-busy'),
           'real_during': [s for s in real if pg.visible(s)], 'panel_text': pg.text('[data-testid=panel-about]'),
           'focusables_in_panel': pg.page.evaluate("document.querySelectorAll('[data-testid=panel-about] button, [data-testid=panel-about] input, [data-testid=panel-about] select, [data-testid=panel-about] [tabindex]').length")}
    for r in held:
        r.continue_()
    pg.page.wait_for_selector('[data-testid=about-name]', timeout=8000)
    pg.settle(200)
    out['skeleton_after'] = pg.visible('.skeleton--about')
    out['real_after'] = [s for s in real if pg.visible(s)]
    pg.close()
    return out


def s_region_a11y(a, pw):  # FND-052 / FND-061: what the region select is described by; what the unreadable state shows
    pg = Page(pw, a['base']).goto()
    if pg.visible('[data-testid=notice-ok]'):
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)
    pg.open_drawer('about')
    pg.page.wait_for_selector('[data-testid=about-region]', timeout=8000)
    pg.settle(300)
    out = pg.page.evaluate("""() => {
      const sel = document.querySelector('[data-testid=about-region]');
      const ids = (sel.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const el = (id) => document.getElementById(id);
      return { described_by: sel.getAttribute('aria-describedby'), described_text: ids.map((i) => (el(i) ? el(i).textContent.trim() : '?')).join(' '),
               line_text: el('region-line') ? el('region-line').textContent : '', note_text: el('region-note') ? el('region-note').textContent : '',
               shown_option: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : null, disabled: sel.disabled };
    }""")
    pg.close()
    return out


# ---- R2 prototype (fe-tester #1, Q-066 / Q-067, tests/look-page.test.js) ----

def dismiss_notice(pg):
    if pg.visible('[data-testid=notice-ok]'):
        pg.page.click('[data-testid=notice-ok]')
        pg.page.wait_for_selector('[data-testid=memory-notice]', state='detached', timeout=3000)


FOCUS = "(() => { const e = document.activeElement; return e ? (e.dataset.testid || (e.dataset.lang ? 'lang-' + e.dataset.lang : e.tagName)) : null; })()"


def s_r2_drawer(a, pw):  # Q-056: ←/→ cycle the three tabs; Tab from the selected tab goes switch (中文, EN) then 关闭, inside .drawer__end
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=a.get('width', 1440), height=900).goto()
    dismiss_notice(pg)
    pg.open_drawer('diary')
    pg.settle(300)
    pg.page.focus('[data-testid=tab-diary]')
    sel = "[...document.querySelectorAll('[role=tab]')].filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.dataset.testid).join(',')"
    keys = []
    for k in a.get('keys', ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']):
        pg.page.keyboard.press(k)
        pg.settle(250)
        keys.append({'key': k, 'focus': pg.page.evaluate(FOCUS), 'selected': pg.page.evaluate(sel)})
    pg.page.focus('[data-testid=tab-diary]')
    pg.page.keyboard.press('Enter')
    pg.settle(250)
    order = [pg.page.evaluate(FOCUS)]
    for _ in range(3):
        pg.page.keyboard.press('Tab')
        order.append(pg.page.evaluate(FOCUS))
    end = pg.page.evaluate("""() => { const end = document.querySelector('.drawer__bar > .drawer__end');
      return { inEnd: end ? [...end.querySelectorAll('button')].map((b) => b.dataset.testid || 'lang-' + b.dataset.lang) : null,
               barChildren: [...document.querySelector('.drawer__bar').children].map((c) => c.className) }; }""")
    pg.close()
    return {'keys': keys, 'order': order, **end}


def s_r2_art(a, pw):  # Q-054 / Q-055: what look-art.js puts in each slot of each template; the growth transform per data-stage
    pg = Page(pw, a['base'], width=1440, height=900).goto()
    dismiss_notice(pg)
    out = pg.page.evaluate("""async ({ chars, moods, slots, item }) => {
      const art = await import('/js/look-art.js');
      const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px'; document.body.append(host);
      const rows = [];
      for (const c of chars) for (const m of moods) {
        const svg = document.getElementById(`mood-${c}-${m}`).content.querySelector('svg').cloneNode(true);
        host.append(svg);
        for (const s of slots) {
          art.fillSlot(svg, s, item, m);
          const slot = svg.querySelector(`[id="${c}-${m}--slot-${s}"]`);
          const outer = (e) => { const up = e.parentElement.closest('[transform]'); return !up || !slot.contains(up); }; // outermost transformed groups = the placements
          const clip = slot.querySelector('[clip-path]')?.getAttribute('clip-path') ?? null;
          const outline = [...slot.querySelectorAll(':scope > g > path')].map((p) => ({ d: p.getAttribute('d'), sw: p.getAttribute('stroke-width'), fill: p.getAttribute('fill') }));
          rows.push({ c, m, s, n: slot.children.length, tf: [...slot.querySelectorAll('[transform]')].filter(outer).map((e) => e.getAttribute('transform')), clip,
                      clipIds: [...svg.querySelectorAll('clipPath')].map((e) => e.id), bodyD: svg.querySelector(`[id="${c}-${m}--body-fur"]`)?.getAttribute('d') ?? null, outline });
          art.fillSlot(svg, s, 'none', m);
          rows[rows.length - 1].afterNone = slot.children.length;
        }
        svg.remove();
      }
      host.remove();
      return rows;
    }""", {'chars': a['chars'], 'moods': a['moods'], 'slots': a['slots'], 'item': a.get('item', 1)})
    stages = pg.page.evaluate("""async (stages) => {
      const root = document.querySelector('[data-testid=companion]');
      const out = [];
      for (const n of stages) {
        root.dataset.stage = String(n);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const svg = root.querySelector('.companion__layers > .companion__layer:last-child svg');
        const g = svg.querySelector('[id$="--growth"]');
        const m = svg.getScreenCTM().inverse().multiply(g.getScreenCTM());
        out.push({ stage: n, g: getComputedStyle(root).getPropertyValue('--g').trim(), m: [m.a, m.b, m.c, m.d, m.e, m.f] });
      }
      return out;
    }""", a.get('stages', [1, 2, 3]))
    pg.close()
    return {'rows': out, 'stages': stages}


def s_r2_growth(a, pw):  # Q-061: the 成长 block look-ui.js draws for each days value (stub client; the page's own client untouched)
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=1440, height=900).goto()
    dismiss_notice(pg)
    out = pg.page.evaluate("""async (days) => {
      const { createLookUi } = await import('/js/look-ui.js');
      const { growthOf } = await import('/js/look-client.js');
      const rows = [];
      for (const d of days) {
        const client = { getLook: async () => ({ character: 1, outfit: { head: 'none', clothes: 'none', shoes: 'none', accessory: 'none' } }),
          getVoice: async () => 'serena', getGrowth: async () => growthOf(d), setLook: async () => { throw new Error('x'); }, setVoice: async () => 'serena',
          setDemoDays: async (n) => growthOf(n), preview: async () => {} };
        const panel = document.createElement('section'); document.body.append(panel);
        await createLookUi({ client }).render(panel);
        const next = panel.querySelector('[data-testid=growth-next]'); const bar = panel.querySelector('[data-testid=growth-bar]');
        rows.push({ days: d, next: next.hidden ? null : next.textContent, nextVisible: !!(next.offsetWidth || next.offsetHeight),
                    line: panel.querySelector('[data-testid=growth-line]').textContent,
                    segs: bar.querySelectorAll('.growth__seg').length, on: bar.querySelectorAll('.growth__seg.is-on').length,
                    valuetext: bar.getAttribute('aria-valuetext') });
        panel.remove();
      }
      return rows;
    }""", a['days'])
    pg.close()
    return {'rows': out}


def s_r2_fit(a, pw):  # Q-067: no sideways scroll at one width and language, chat and the look and about tabs, wearing a full look; every request local
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=a['width'], height=a.get('height', 844), storage=a.get('storage')).goto()
    pg.page.wait_for_timeout(300)
    probes = []
    if pg.visible('[data-testid=memory-notice]'):
        probes.append(fit_probe(pg, 'notice'))
        dismiss_notice(pg)
        pg.settle(300)
    probes.append(fit_probe(pg, 'chat'))
    pg.open_drawer('look')
    pg.page.wait_for_selector('[data-testid=growth-bar]', timeout=8000); pg.settle(400)
    probes.append(fit_probe(pg, 'look top'))
    pg.page.click('[data-testid=preview-serena]'); pg.settle(500)
    pg.page.evaluate("document.querySelector('.drawer__scroll').scrollTop = 1e6"); pg.settle(200)
    probes.append(fit_probe(pg, 'look bottom'))
    pg.page.click('[data-testid=tab-about]')
    pg.page.wait_for_selector('[data-testid=about-box], [data-testid=about-empty]', timeout=8000); pg.settle(300)
    probes.append(fit_probe(pg, 'about'))
    worn = pg.page.evaluate("(() => { const r = document.querySelector('[data-testid=companion]'); return { character: r.dataset.character, stage: r.dataset.stage, items: r.querySelectorAll('.companion__layer:last-child .slot-item').length }; })()")
    reqs = [r['url'] for r in pg.requests]
    pg.close()
    return {'probes': probes, 'requests': reqs, 'worn': worn}


# Q-062 / Q-063 / Q-064 / CMP-033 (fe-tester #2): a recorder installed before the page's scripts. Every 40 ms it samples the
# stage, caption, burst, preview, 成长 line and spark and the duplicate ids; a MutationObserver logs every text written to a
# status span and every burst / caption spark added. t = ms since window.__rec.reset() (or since navigation start).
RECORDER = r"""(() => {
  if (window.top !== window) return;
  const R = window.__rec = { t0: 0, samples: [], said: [], added: [], anims: new Set() };
  const now = () => Math.round(performance.now() - R.t0);
  R.reset = () => { R.t0 = performance.now(); R.samples = []; R.said = []; R.added = []; R.anims = new Set(); };
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; };
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
  const cls = (e) => (e ? (typeof e.className === 'string' ? e.className : e.getAttribute('class')) : null);
  R.animSigs = () => [...R.anims].map((a) => {
    const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
    const props = [...new Set(kf.flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))].sort();
    const t = a.effect ? a.effect.target : null;
    return { kind: a.constructor.name, target: cls(t), props, duration: a.effect ? a.effect.getTiming().duration : null };
  });
  function sample() {
    const root = document.querySelector('[data-testid=companion]');
    if (!root) return;
    for (const a of document.getAnimations()) R.anims.add(a);
    const pv = document.querySelector('.companion--preview');
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const seen = new Set(); const dup = [];
    for (const id of ids) { if (seen.has(id)) dup.push(id); seen.add(id); }
    const gs = document.querySelector('[data-testid=growth-spark]');
    const st = root.nextElementSibling && root.nextElementSibling.getAttribute('role') === 'status' ? root.nextElementSibling : null;
    R.samples.push({
      t: now(), mood: root.dataset.mood, stage: root.dataset.stage,
      face: (root.querySelector('.companion__layers > .companion__layer:last-child') || { dataset: {} }).dataset.moodLayer || null,
      name: txt('.companion__caption .caption__name'), phrase: txt('.companion__caption .caption__phrase'),
      sparks: [...document.querySelectorAll('.caption__spark')].map((b) => ({ prev: cls(b.previousElementSibling), inPv: !!b.closest('.companion--preview'),
        svg: cls(b.querySelector('svg.spark')), flare: !!b.querySelector('.spark-flare') })),
      burst: root.querySelectorAll('.companion__burst').length,
      pv: pv ? { burst: pv.querySelectorAll('.companion__burst').length, stage: pv.dataset.stage, face: (pv.querySelector('.companion__layer:last-child') || { dataset: {} }).dataset.moodLayer || null,
        caption: pv.querySelectorAll('.caption__spark, .caption__phrase, .caption__name').length } : null,
      line: txt('[data-testid=growth-line]'), said: txt('[data-testid=growth-said]'), status: st ? st.textContent : null,
      gspark: gs ? { band: gs.dataset.band, box: box(gs), svg: box(gs.querySelector('svg')), svgCls: cls(gs.querySelector('svg')) } : null,
      ids: ids.length, dup: dup.slice(0, 5), ndup: dup.length,
    });
  }
  function watch(records) {
    for (const m of records) {
      const el = m.target.nodeType === 3 ? m.target.parentElement : m.target;
      if (el && el.matches && el.matches('[role=status]')) {
        const text = [...m.addedNodes].map((n) => n.textContent).join('');
        if (text) R.said.push({ t: now(), who: el.dataset.testid || (el.previousElementSibling && el.previousElementSibling.dataset.testid === 'companion' ? 'companion' : 'other'), text });
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const c = cls(n) || '';
        if (/\bcompanion__burst\b|\bcaption__spark\b/.test(c)) R.added.push({ t: now(), what: /burst/.test(c) ? 'burst' : 'spark', pv: !!n.closest('.companion--preview') });
      }
    }
  }
  setInterval(sample, 40); // from the first script on: an open-time moment can run before DOMContentLoaded
  new MutationObserver(watch).observe(document, { childList: true, subtree: true, characterData: true });
})()"""

REC_READ = "(() => { const R = window.__rec; return { samples: R.samples, said: R.said, added: R.added, anims: R.animSigs(), seen: localStorage.getItem('companion.stageSeen') }; })()"


def s_r2_stageup(a, pw):  # Q-062/063/064, CMP-033, DFB-004: steps = [{open} | {days: n} | {reload, set: {key: value}}, each with ms]; one recording per step
    pg = Page(pw, a['base'], a.get('lang', 'zh'), width=a.get('width', 1440), height=a.get('height', 900), storage=a.get('storage'), once=True)
    if a.get('reduce'):
        pg.page.emulate_media(reduced_motion='reduce')
    pg.ctx.add_init_script(RECORDER)
    errors = []
    pg.page.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto()
    steps = []
    drawer = False
    for st in a['steps']:
        if st.get('open'):  # the first open itself (t from navigation start)
            pass
        elif st.get('reload'):
            for k, v in (st.get('set') or {}).items():
                pg.page.evaluate('([k, v]) => localStorage.setItem(k, v)', [k, v])
            pg.page.reload()
            pg.page.wait_for_function(READY, timeout=10000)
            drawer = False
        else:
            if pg.visible('[data-testid=memory-notice]'):
                dismiss_notice(pg)
            if not drawer:
                pg.open_drawer('look')
                pg.page.wait_for_selector('[data-testid=demo-days]', timeout=8000)
                pg.settle(st.get('before', 2600))  # any open-time moment and the drawer's own motion are over
                drawer = True
            pg.page.fill('[data-testid=demo-days]', str(st['days']))
            pre = pg.page.evaluate("[document.querySelector('.companion__caption .caption__name').textContent, document.querySelector('.companion__caption .caption__phrase').textContent]")
            pg.page.evaluate('window.__rec.reset()')
            pg.page.press('[data-testid=demo-days]', 'Enter')
        pg.settle(st.get('ms', 3800))
        steps.append({**pg.page.evaluate(REC_READ), 'pre': pre if 'days' in st else None})
    pg.close()
    return {'steps': steps, 'errors': errors}


SCEN = {k[2:]: v for k, v in globals().items() if k.startswith('s_')}

if __name__ == '__main__':
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    with sync_playwright() as pw:
        try:
            res = SCEN[sys.argv[1]](args, pw)
        except Exception as e:  # report, never hang
            res = {'driver_error': '%s: %s' % (type(e).__name__, e)}
    print('RESULT ' + json.dumps(res, ensure_ascii=False))
