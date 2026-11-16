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


class Page:
    def __init__(self, pw, base, lang='zh', width=1280, height=900, storage=None):
        self.base = base
        self.browser = pw.chromium.launch()
        self.ctx = self.browser.new_context(viewport={'width': width, 'height': height}, locale='zh-CN' if lang == 'zh' else 'en-US')
        if storage:
            self.ctx.add_init_script('(() => { try { for (const [k, v] of Object.entries(%s)) localStorage.setItem(k, v); } catch (e) {} })()' % json.dumps(storage))
        self.page = self.ctx.new_page()
        self.requests = []
        self.responses = []
        self.page.on('request', lambda r: self.requests.append({'method': r.method, 'url': r.url, 'body': r.post_data}))
        self.page.on('response', lambda r: self.responses.append({'method': r.request.method, 'url': r.url, 'status': r.status}))

    def goto(self, wait_profile=True):
        self.page.goto(self.base + '/')
        if wait_profile:  # the privacy line is written when the profile read has answered (or failed)
            self.page.wait_for_function("document.querySelector('.log__privacy-text') && document.querySelector('.log__privacy-text').textContent.length > 0", timeout=10000)
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
      return { dots, none, days, curve: !!document.querySelector('.curve'), start: !!document.querySelector('[data-testid=diary-start]') };
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
    pg.page.reload(); pg.page.wait_for_function("document.querySelector('.log__privacy-text')?.textContent.length > 0"); pg.settle(300)
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


SCEN = {k[2:]: v for k, v in globals().items() if k.startswith('s_')}

if __name__ == '__main__':
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    with sync_playwright() as pw:
        try:
            res = SCEN[sys.argv[1]](args, pw)
        except Exception as e:  # report, never hang
            res = {'driver_error': '%s: %s' % (type(e).__name__, e)}
    print('RESULT ' + json.dumps(res, ensure_ascii=False))
