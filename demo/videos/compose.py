#!/usr/bin/env python3
"""Compose a 1920x1080 demo: title card, then the simulator recording on the left with timed captions on the right.

usage: compose.py <spec.json>
spec: {"video": "raw.mov", "out": "demo.mp4", "title": "...", "subtitle": "...",
       "steps": [{"t": 0.0, "title": "...", "body": "..."}], "end": 42.0, "outro": "..."}
"""
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1920, 1080
BG = (7, 19, 39)
GREEN = (43, 238, 121)
TEXT = (236, 240, 245)
MUTED = (150, 163, 184)
AV = '/System/Library/Fonts/Avenir Next.ttc'
font = lambda size, idx: ImageFont.truetype(AV, size, index=idx)  # 0 bold, 2 demi, 5 medium, 7 regular

def wrap(draw, text, f, width):
    lines = []
    for para in text.split('\n'):
        words, line = para.split(), ''
        for w in words:
            trial = (line + ' ' + w).strip()
            if draw.textlength(trial, font=f) <= width: line = trial
            else: lines.append(line); line = w
        lines.append(line)
    return lines

def brand_row(img, y, x=120):
    ks = Image.open(os.path.join(HERE, 'ks-full.png')).convert('RGBA')
    ks = ks.resize((int(ks.width * 56 / ks.height), 56))
    img.alpha_composite(ks, (x, y))
    bark = Image.open(os.path.join(HERE, 'bark.png')).convert('RGBA').resize((56, 56))
    mask = Image.new('L', (56, 56), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, 55, 55), 12, fill=255)
    img.paste(bark, (x + ks.width + 48, y), mask)
    ImageDraw.Draw(img).text((x + ks.width + 48 + 72, y + 8), 'Bark by Second', font=font(30, 5), fill=MUTED)

def title_card(spec, path):
    img = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    brand_row(img, 120)
    d.text((120, 330), spec['title'], font=font(96, 0), fill=TEXT)
    y = 470
    for line in wrap(d, spec['subtitle'], font(44, 5), 1500):
        d.text((120, y), line, font=font(44, 5), fill=GREEN); y += 62
    d.text((120, H - 150), spec.get('footer', 'KaleidoPay · bitcoin++ Berlin 2026'), font=font(30, 7), fill=MUTED)
    img.convert('RGB').save(path)

PHONE = (210, 80, 652, 1040)  # x0, y0, x1, y1 of the scaled recording (1206x2622 at height 960)

def canvas(spec, path):
    img = Image.new('RGBA', (W, H), BG + (255,))
    brand_row(img, 110, 900)
    img.convert('RGB').save(path)

def bezel(path):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x0, y0, x1, y1 = PHONE
    corners = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(corners).rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), fill=BG + (255,))
    hole = Image.new('L', (W, H), 0)
    ImageDraw.Draw(hole).rounded_rectangle((x0, y0, x1, y1), 52, fill=255)
    alpha = Image.new('L', (W, H), 0)
    ImageDraw.Draw(alpha).rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), fill=255)
    alpha.paste(0, mask=hole)
    corners.putalpha(alpha)
    img.alpha_composite(corners)
    ImageDraw.Draw(img).rounded_rectangle((x0 - 7, y0 - 7, x1 + 7, y1 + 7), 58, outline=(48, 64, 92), width=7)
    img.save(path)

def caption(spec, i, path):
    step = spec['steps'][i]
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x, width = 900, 900
    n = len(spec['steps'])
    for k in range(n):  # progress dots
        cx = x + k * 34
        d.ellipse((cx, 250, cx + 14, 264), fill=GREEN if k <= i else (40, 56, 84))
    d.text((x, 300), f'{i + 1} / {n}', font=font(30, 2), fill=GREEN)
    y = 360
    for line in wrap(d, step['title'], font(64, 0), width):
        d.text((x, y), line, font=font(64, 0), fill=TEXT); y += 82
    y += 24
    for line in wrap(d, step.get('body', ''), font(38, 7), width):
        d.text((x, y), line, font=font(38, 7), fill=MUTED); y += 56
    if spec.get('note'):
        d.text((x, H - 120), spec['note'], font=font(28, 7), fill=MUTED)
    img.save(path)

def main():
    spec = json.load(open(sys.argv[1]))
    base = os.path.dirname(os.path.abspath(sys.argv[1]))
    work = os.path.join(base, 'build-' + os.path.splitext(os.path.basename(spec['out']))[0]); os.makedirs(work, exist_ok=True)
    title_card(spec, os.path.join(work, 'title.png'))
    canvas(spec, os.path.join(work, 'canvas.png'))
    bezel(os.path.join(work, 'bezel.png'))
    for i in range(len(spec['steps'])): caption(spec, i, os.path.join(work, f'cap{i}.png'))
    intro = spec.get('intro', 3.0)
    segs = spec.get('segments') or [[spec.get('start', 0), spec['end']]]
    total = sum(b - a for a, b in segs)
    starts = [s['t'] for s in spec['steps']] + [total]
    inputs = ['-loop', '1', '-t', str(intro), '-i', os.path.join(work, 'title.png'),
              '-loop', '1', '-t', f'{total:.2f}', '-i', os.path.join(work, 'canvas.png'),
              '-i', os.path.join(base, spec['video']),
              '-loop', '1', '-i', os.path.join(work, 'bezel.png')]
    for i in range(len(spec['steps'])): inputs += ['-loop', '1', '-i', os.path.join(work, f'cap{i}.png')]
    phone_h = PHONE[3] - PHONE[1]
    n = len(segs)
    f = [f'[2:v]fps=30,split={n}' + ''.join(f'[s{k}]' for k in range(n))]
    for k, (a, b) in enumerate(segs):
        f.append(f'[s{k}]trim=start={a}:end={b},setpts=PTS-STARTPTS[c{k}]')
    f.append(''.join(f'[c{k}]' for k in range(n)) + f'concat=n={n}:v=1:a=0,scale=-2:{phone_h},format=rgba[ph]')
    f.append(f'[1:v][ph]overlay=x={PHONE[0]}:y={PHONE[1]}:shortest=1[vp]')
    f.append('[vp][3:v]overlay=0:0:shortest=1[v0]')
    last = 'v0'
    for i in range(len(spec['steps'])):
        a, b = starts[i], starts[i + 1]
        f.append(f"[{last}][{4 + i}:v]overlay=0:0:enable='between(t,{a:.3f},{b - 0.04:.3f})':shortest=1[v{i + 1}]")
        last = f'v{i + 1}'
    f.append(f'[0:v]fps=30,format=yuv420p,setsar=1[t]')
    f.append(f'[{last}]fps=30,format=yuv420p,setsar=1[m]')
    f.append('[t][m]concat=n=2:v=1:a=0,fade=t=in:st=0:d=0.4[out]')
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(f), '-map', '[out]',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', os.path.join(base, spec['out'])]
    subprocess.run(cmd, check=True)
    print(os.path.join(base, spec['out']))

if __name__ == '__main__':
    main()
