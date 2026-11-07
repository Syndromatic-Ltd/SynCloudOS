"""Compare real Portfolio captures at matching viewports and gesture states."""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageEnhance

root = Path(__file__).resolve().parent
output = root / "comparison"
output.mkdir(exist_ok=True)
rows = []
for before in sorted((root / "before").glob("*/*.png")):
    case, name = before.parent.name, before.name
    after = root / "after" / case / name
    if not after.exists():
        continue
    first, second = Image.open(before).convert("RGB"), Image.open(after).convert("RGB")
    difference = ImageChops.difference(first, second)
    red, green, blue = difference.split()
    mask = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    changed = first.width * first.height - mask.histogram()[0]
    bbox = difference.getbbox()
    path = output / case
    path.mkdir(exist_ok=True)
    ImageEnhance.Contrast(difference).enhance(4).save(path / name)
    pair = Image.new("RGB", (first.width * 2, first.height))
    pair.paste(first, (0, 0))
    pair.paste(second, (first.width, 0))
    pair.save(path / f"side-by-side-{name}")
    classification = "identical"
    if changed:
        if case.startswith("phone-") and name.startswith("05-edge-backward"):
            classification = "leading-edge-now-turns"
        elif "reduce" in case and "held" in name:
            classification = "reduced-blend-rounding"
        else:
            classification = "moving-sample-time"
    rows.append({"case": case, "frame": name, "width": first.width, "height": first.height,
                 "changedPixels": changed, "percent": changed * 100 / (first.width * first.height),
                 "bbox": bbox, "maxChannelDelta": max(high for low, high in difference.getextrema()),
                 "classification": classification,
                 "static": "settled" in name or name == "01-open.png"})

(output / "pixels.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
html = """<!doctype html><meta charset="utf-8"><title>Portfolio page curl comparison</title>
<style>body{background:#202020;color:#eee;font:15px system-ui;margin:20px}select{font:inherit;padding:6px;margin:4px}section{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;background:white}figure{margin:0}figcaption{padding:8px 0}pre{white-space:pre-wrap}a{color:#acf}</style>
<h1>Portfolio page curl: before / after</h1><p>DPR 1. Same viewport, appearance, motion preference and input trajectory. Moving-frame pixel deltas include timing; use held drags for geometry. Click an image for full size.</p>
<label>Case <select id="cases"></select></label><label>Frame <select id="frames"></select></label><pre id="metrics"></pre>
<section><figure><figcaption>Before</figcaption><a id="ba"><img id="before"></a></figure><figure><figcaption>After</figcaption><a id="aa"><img id="after"></a></figure></section>
<details><summary>Pixel difference (contrast x4)</summary><img id="diff"></details>
<script>const rows=DATA;const cases=document.querySelector('#cases'),frames=document.querySelector('#frames');for(const c of [...new Set(rows.map(r=>r.case))])cases.add(new Option(c,c));function updateFrames(){frames.replaceChildren();for(const r of rows.filter(r=>r.case===cases.value))frames.add(new Option(r.frame,r.frame));show()}function show(){const r=rows.find(r=>r.case===cases.value&&r.frame===frames.value);if(!r)return;document.querySelector('#metrics').textContent=JSON.stringify(r,null,2);for(const phase of ['before','after']){const url=`../${phase}/${r.case}/${r.frame}`;document.querySelector('#'+phase).src=url;document.querySelector(phase==='before'?'#ba':'#aa').href=url}document.querySelector('#diff').src=`${r.case}/${r.frame}`}cases.onchange=updateFrames;frames.onchange=show;updateFrames();</script>""".replace("DATA", json.dumps(rows))
(output / "index.html").write_text(html, encoding="utf-8")
static = [row for row in rows if row["static"]]
print(json.dumps({"frames": len(rows), "staticFrames": len(static), "identicalStatic": sum(row["changedPixels"] == 0 for row in static),
                  "staticDifferences": [row for row in static if row["changedPixels"]]}, indent=2))
