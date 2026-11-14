"""fe-engineer #4 r2 self-check: each mood's pose, running part animations, glow timing, pivots, reduced motion.
Usage: python3 -I selfcheck.py <out dir>   (own server on 127.0.0.1:4318)"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(sys.argv[1]); BASE = "http://127.0.0.1:4318/"
LINES = [("pleasant-high", "今天考试过了，好开心！"), ("pleasant-low", "现在感觉很放松"),
         ("unpleasant-high", "明天面试，好紧张"), ("unpleasant-low", "可是晚上和朋友吵架了，有点难过。"),
         ("neutral", "嗯，我在上课")]
PIVOTS = {"neutral": {"tail": (290,262), "ear-left": (160,145.2), "ear-right": (240,145.2)},
          "pleasant-high": {"tail": (288,220), "arm-left": (122,192), "arm-right": (278,192)},
          "pleasant-low": {"tail": (270,300)},
          "unpleasant-low": {"ear-left": (130.15,193.9), "ear-right": (269.85,193.9)}}
ANIMS = """() => { const c = document.querySelector('[data-testid=companion]');
  return document.getAnimations().filter(a => c.contains(a.effect.target) && a.playState === 'running')
    .map(a => (a.effect.target.id || a.effect.target.className.baseVal || a.effect.target.className) + ':' + (a.animationName || a.transitionProperty)); }"""
PIVOT_JS = """([mood, parts]) => { const r = {};
  for (const [part, [x, y]] of Object.entries(parts)) {
    const el = document.getElementById(mood + '--' + part); if (!el) { r[part] = 'missing'; continue; }
    const svg = el.ownerSVGElement, p = svg.createSVGPoint(); p.x = x; p.y = y;
    const a = p.matrixTransform(el.getScreenCTM()), b = p.matrixTransform(el.parentNode.getScreenCTM());
    r[part] = +Math.hypot(a.x - b.x, a.y - b.y).toFixed(3); }
  return r; }"""

def state(pg):
    return pg.evaluate("""() => { const c = document.querySelector('[data-testid=companion]');
      return {mood: c.dataset.mood, name: c.getAttribute('aria-label'), caption: document.querySelector('.companion__caption').textContent,
              layers: c.querySelectorAll('.companion__layer').length, glow: getComputedStyle(c).backgroundColor}; }""")

def send(pg, line):
    pg.fill("[data-testid=fake-input]", line)
    pg.press("[data-testid=fake-input]", "Enter")
    at_send = pg.evaluate("document.querySelector('[data-testid=companion]').dataset.mood")
    pg.wait_for_function("document.querySelector('[data-testid=reply]') && document.querySelectorAll('.turn').length > 0")
    return at_send

def run(pw, name, w, h, reduce):
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce" if reduce else "no-preference")
    pg = ctx.new_page(); hosts = set(); errors = []
    pg.on("request", lambda r: hosts.add(r.url.split('/')[2]))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(BASE); pg.wait_for_timeout(800)
    res = {"open": state(pg) | {"running": pg.evaluate(ANIMS)}}
    pg.locator(".stage").screenshot(path=str(OUT / f"neutral-open@{name}.png"))
    prev = "neutral"
    for mood, line in LINES:
        replies = pg.locator("[data-testid=reply]").count()
        pg.fill("[data-testid=fake-input]", line); pg.press("[data-testid=fake-input]", "Enter")
        at_send = pg.evaluate("document.querySelector('[data-testid=companion]').dataset.mood")
        pg.wait_for_function("(t) => { const r = document.querySelector('[data-testid=reply]'); return r && r.textContent && document.querySelector('[data-testid=companion]').dataset.mood !== undefined && document.querySelectorAll('.turn').length >= t; }", arg=0)
        pg.wait_for_function("(m) => document.querySelector('[data-testid=companion]').dataset.mood === m", arg=mood, timeout=3000)
        glow_t0 = state(pg)["glow"]; pg.wait_for_timeout(300); glow_300 = state(pg)["glow"]
        pg.wait_for_timeout(500)   # 800 ms after the swap: crossfade and glow settled
        r = state(pg) | {"mood_at_send": at_send, "prev": prev, "glow_t0": glow_t0, "glow_300ms": glow_300,
                         "running": sorted(pg.evaluate(ANIMS))}
        if mood in PIVOTS and not reduce:
            r["pivot_drift_px"] = [pg.evaluate(PIVOT_JS, [mood, PIVOTS[mood]]) for _ in range(4) if not pg.wait_for_timeout(170)]
        pg.wait_for_timeout(400)
        pg.locator(".stage").screenshot(path=str(OUT / f"{mood}@{name}.png"))
        if not reduce:
            pg.wait_for_timeout(450); pg.locator(".stage").screenshot(path=str(OUT / f"{mood}@{name}-t2.png"))
        res[mood] = r; prev = mood
    res["hosts"] = sorted(hosts); res["console_errors"] = errors
    b.close(); return res

with sync_playwright() as pw:
    out = {"laptop": run(pw, "laptop", 1440, 900, False), "phone": run(pw, "phone", 390, 844, False),
           "laptop-reduce": run(pw, "laptop-reduce", 1440, 900, True)}
(OUT / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
for k, v in out.items():
    print("==", k, "hosts", v["hosts"], "errors", v["console_errors"])
    for m in ["open"] + [l[0] for l in LINES]:
        s = v[m]; print(f"  {m:16} mood={s['mood']:15} at_send={s.get('mood_at_send','-'):15} layers={s['layers']} glow={s['glow']} "
                        f"glow@0/300ms={s.get('glow_t0','-')}/{s.get('glow_300ms','-')} running={len(s['running'])}")
        if s["running"]: print("     ", ", ".join(s["running"]))
        if "pivot_drift_px" in s: print("      pivot drift px:", s["pivot_drift_px"])
