"""Measure the approved sprites and write per-view equipment/ink attachment data."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
profiles = json.loads((ROOT / 'tools/body-types.json').read_text())
rigs = {}
for body in profiles:
    rigs[body] = {}
    for view in ('front', 'back'):
        im = Image.open(ROOT / f'assets/bodies/{body}-{view}-v8.png')
        p = im.load()
        left, top, right, bottom = im.getchannel('A').point(lambda a: 255 if a > 128 else 0).getbbox()
        height = bottom - top
        def dark(x, y):
            r, g, b, a = p[x, y]
            return a > 128 and max(r, g, b) < 120 and max(r, g, b) - min(r, g, b) < 45
        def skin(x, y):
            r, g, b, a = p[x, y]
            return a > 128 and r > 70 and r > g * 1.1 and g > b * 1.04
        def run(y, center=96):
            l = r = center
            while l > 0 and p[l - 1, y][3] > 128: l -= 1
            while r < 191 and p[r + 1, y][3] > 128: r += 1
            return l, r + 1
        waist_y = next(y for y in range(top + 85, 350) if sum(dark(x, y) for x in range(87, 105)) >= 14)
        wl, wr = run(waist_y)
        cx = round((wl + wr) / 2)
        waist_w = wr - wl
        below = [y for y in range(waist_y + 20, min(380, waist_y + 120)) if sum(dark(x, y) for x in range(60, 133)) < 12]
        hem = next(y for y in below if all(v in below for v in range(y, min(380, y + 5))))
        neck = min((run(y)[1] - run(y)[0], y) for y in range(top + 44, top + 73) if p[96, y][3] > 128)[1]
        shirt_y = neck + 8
        sl, sr = run(shirt_y + 20)
        cap = round(max(waist_w + 4, (sr - sl) * .78))
        top_rect = [cx - cap // 2, shirt_y, cap, waist_y - shirt_y + 4]
        pants_w = waist_w + 28
        bottom_rect = [cx - pants_w // 2, waist_y, pants_w, hem - waist_y + 2]
        hands, wraps = [], []
        for side in ('left', 'right'):
            xr = range(left, wl - 4) if side == 'left' else range(wr + 4, right)
            def arm_row(y):
                groups = []
                for x in xr:
                    if not skin(x, y): continue
                    if not groups or x - groups[-1][-1] > 4: groups.append([x])
                    else: groups[-1].append(x)
                return (groups[0] if side == 'left' else groups[-1]) if groups else []
            rows = {y: arm_row(y) for y in range(waist_y - 8, hem - 7)}
            # Keep the outer arm component; inner thigh pixels can begin above
            # the shorts' central hem and must never move the glove downward.
            hand_bottom = max(y for y, xs in rows.items() if len(xs) >= 3 and (min(xs) <= left + 18 if side == 'left' else max(xs) >= right - 19))
            ky = hand_bottom - 8
            wy = hand_bottom - 25
            wrist = rows[wy]
            palm = rows[ky]
            wx = round((min(wrist) + max(wrist)) / 2)
            kx = round((min(palm) + max(palm)) / 2)
            points = [(x, y) for y in range(ky - 7, hand_bottom) for x in rows.get(y, [])]
            palm_l, palm_r = min(x for x, y in points), max(x for x, y in points)
            w = palm_r - palm_l + 10
            h = hand_bottom - wy + 14
            hands.append({'wrist': [wx, wy], 'knuckles': [kx, ky], 'size': [w, h]})
            wraps.append([palm_l - 1, wy - 3, palm_r - palm_l + 3, hand_bottom - wy + 5])
        feet = []
        for x0, x1 in ((0, 96), (96, 192)):
            pts = [(x, y) for y in range(365, 391) for x in range(x0, x1) if p[x, y][3] > 128]
            fl, fr = min(x for x, y in pts), max(x for x, y in pts)
            boot_h = max(39, min(55, round(height * .14)))
            feet.append([fl - 2, 391 - boot_h, fr - fl + 5, boot_h])
        knee_y = round(hem + (feet[0][1] - hem) * .45)
        arm_h = min(45, round((waist_y - shirt_y) * .55))
        tattoos = {}
        for n, zone in enumerate(('leftArm', 'rightArm')):
            wx, wy = hands[n]['wrist']
            shoulder = top_rect[0] - 6 if n == 0 else top_rect[0] + top_rect[2] + 6
            ink_x = round((wx + shoulder) / 2)
            ink_w = max(9, min(20, round(hands[n]['size'][0] * .46)))
            tattoos[zone] = [ink_x - ink_w // 2, shirt_y + 30, ink_w, arm_h, .15 if n == 0 else -.15]
        if view == 'front':
            tattoos.update(chest=[cx - round(cap * .3), shirt_y + 22, round(cap * .6), 25], abdomen=[cx - round(waist_w * .3), waist_y - 35, round(waist_w * .6), 27], neck=[cx - 7, neck - 5, 14, 14])
        else:
            tattoos['back'] = [cx - round(cap * .32), shirt_y + 18, round(cap * .64), waist_y - shirt_y - 27]
        anchors = dict(cx=cx, topL=top_rect[0], topR=top_rect[0]+cap, waistL=wl, waistR=wr, shortL=bottom_rect[0], shortR=bottom_rect[0]+pants_w, waistY=waist_y,
                       left=hands[0]['knuckles'], right=hands[1]['knuckles'], head=[cx, top+25], headBox=[cx-29, top, 58, neck-top+5],
                       shoulderL=top_rect[0]-6, shoulderR=top_rect[0]+cap+6,
                       shoeL=[feet[0][0]+feet[0][2]//2, 382], shoeR=[feet[1][0]+feet[1][2]//2,382],
                       shirtY=shirt_y, crotchY=hem-15, ankleY=366, kneeY=knee_y, shinY=knee_y+15, mouthY=neck-9)
        rigs[body][view] = dict(top=top_rect, bottom=bottom_rect, hands=wraps, waist=[wl, waist_y+1, waist_w, 11], feet=feet,
                                gloves=hands, topFollowsBody=True, bottomFromBody=True, tattoos=tattoos, anchors=anchors,
                                feetCut=min(f[1]+round(f[3]*.4) for f in feet))
overrides = json.loads((ROOT / 'tools/body-rig-overrides.json').read_text())
for body, views in overrides.items():
    for view, override in views.items():
        for n, size in enumerate(override.get('gloveSizes', [])):
            rigs[body][view]['gloves'][n]['size'] = size
(ROOT / 'tools/body-rig.json').write_text(json.dumps(rigs, ensure_ascii=False, indent=2)+'\n')
for body, views in rigs.items():
    print(body, [(v, r['top'], [h['wrist'] for h in r['gloves']]) for v, r in views.items()])
