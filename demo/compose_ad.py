#!/usr/bin/env python3
"""Slide-format ad cut of the three-device NEAR demo.

Opens full-frame on the desktop recording for the hook and core flow,
slides through phone / iPad / computer, then ends on the trio with the URL.
No long holds. Existing footage only.
"""
import json, math, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).parent
W, H, FPS = 1920, 1080, 30
BAND = dict(y=820, h=220)
GOLD = (212, 179, 122)
CREAM = (244, 241, 234)
DIM = (167, 158, 145)
BG_TOP = (12, 11, 9)
BG_BOT = (26, 23, 18)
BAND_BG = (8, 7, 6)

# Hero desktop window — exact 1440:900 aspect, no crop, sits above the subtitle band
DW = dict(x=352, y=56, w=1216, h=760)
# Device-tour panels, centered above the band
PHONE_S = dict(x=785, y=56, w=351, h=760)   # 390x844
IPAD_S = dict(x=696, y=56, w=528, h=760)    # 820x1180
# Trio close (same geometry as the long demo)
P = dict(x=94, y=100, w=296, h=640)
I = dict(x=476, y=100, w=445, h=640)
DK = dict(x=1001, y=176, w=832, h=520)

FONT_DIR = ROOT / "fonts"
XB = FONT_DIR / "OpenSauceSans-ExtraBold.ttf"
SB = FONT_DIR / "OpenSauceSans-SemiBold.ttf"
MONO = FONT_DIR / "IBMPlexMono-Bold.ttf"
BUILD = ROOT / "build" / "ad"
TTS = ROOT / "tts-ad"
REC = ROOT / "rec"
SLIDE = 0.28  # smooth slide between panels, not gimmicky
TAIL = 0.45   # realtime result tail, under the 0.7s freeze limit
XFADE = 0.28


def font(path, size):
    return ImageFont.truetype(str(path), size)

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode:
        print(cmd)
        print(r.stderr[-4000:])
        sys.exit(1)
    return r.stdout

def dur(f):
    return float(sh(f'ffprobe -v error -show_entries format=duration -of csv=p=0 "{f}"'))

def ts_ass(x):
    h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def rr(d, box, r, fill):
    d.rounded_rectangle(box, r, fill=fill)


def build_bg():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
        d.line([(0, y), (W, y)], fill=col)
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).ellipse([-280, -220, W + 280, H + 180], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(140))
    im = Image.composite(im, Image.new("RGB", (W, H), (4, 3, 2)), v)
    d = ImageDraw.Draw(im)
    d.rectangle((0, BAND["y"], W, H), fill=BAND_BG)
    d.line([(80, BAND["y"]), (W - 80, BAND["y"])], fill=(58, 52, 42), width=2)
    im.save(BUILD / "bg.png")
    return im


def build_desktop_frame(label="COMPUTER"):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    sx, sy, sw, sh = DW["x"], DW["y"], DW["w"], DW["h"]
    # window chrome
    chrome_h = 34
    outer = (sx - 8, sy - chrome_h - 2, sx + sw + 8, sy + sh + 8)
    d.rounded_rectangle(outer, 16, fill=(90, 80, 64, 255))
    d.rounded_rectangle((outer[0] + 2, outer[1] + 2, outer[2] - 2, outer[3] - 2), 14, fill=(28, 25, 21, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((sx + 8 + i * 24, sy - chrome_h + 8, sx + 22 + i * 24, sy - chrome_h + 22), fill=c + (255,))
    d.rounded_rectangle((sx + 90, sy - chrome_h + 7, sx + sw - 16, sy - 8), 10, fill=(8, 7, 6, 255))
    d.text((sx + sw // 2 + 40, sy - chrome_h + 17), "near-private-tickets.netlify.app  ·  testnet",
           font=font(MONO, 16), fill=DIM + (255,), anchor="mm")
    # punch hole for the screen
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((sx, sy, sx + sw, sy + sh), 8, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)
    if label:
        d.text((W // 2, 18), label, font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    # top title is drawn on chrome; for hero we also want a film title
    path = BUILD / "frame-desktop.png"
    lay.save(path)
    # hero variant without COMPUTER label (cleaner for the core flow)
    return path


def build_desktop_hero_frame():
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    sx, sy, sw, sh = DW["x"], DW["y"], DW["w"], DW["h"]
    chrome_h = 34
    outer = (sx - 8, sy - chrome_h - 2, sx + sw + 8, sy + sh + 8)
    d.rounded_rectangle(outer, 16, fill=(90, 80, 64, 255))
    d.rounded_rectangle((outer[0] + 2, outer[1] + 2, outer[2] - 2, outer[3] - 2), 14, fill=(28, 25, 21, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((sx + 8 + i * 24, sy - chrome_h + 8, sx + 22 + i * 24, sy - chrome_h + 22), fill=c + (255,))
    d.rounded_rectangle((sx + 90, sy - chrome_h + 7, sx + sw - 16, sy - 8), 10, fill=(8, 7, 6, 255))
    d.text((sx + sw // 2 + 40, sy - chrome_h + 17), "near-private-tickets.netlify.app  ·  testnet",
           font=font(MONO, 16), fill=DIM + (255,), anchor="mm")
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((sx, sy, sx + sw, sy + sh), 8, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)
    d.text((W // 2, 14), "PRIVATE TICKETS  ·  NEAR TESTNET", font=font(MONO, 20),
           fill=GOLD + (255,), anchor="mm")
    path = BUILD / "frame-desktop-hero.png"
    lay.save(path)
    return path


def build_phone_frame():
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    s = PHONE_S
    bezel = 14
    outer = (s["x"] - bezel, s["y"] - bezel - 6, s["x"] + s["w"] + bezel, s["y"] + s["h"] + bezel + 6)
    d.rounded_rectangle(outer, 44, fill=(90, 80, 64, 255))
    d.rounded_rectangle((outer[0] + 2, outer[1] + 2, outer[2] - 2, outer[3] - 2), 42, fill=(22, 20, 17, 255))
    # notch
    d.rounded_rectangle((s["x"] + s["w"] // 2 - 46, s["y"] - 2, s["x"] + s["w"] // 2 + 46, s["y"] + 10), 7, fill=(8, 7, 6, 255))
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]), 32, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)
    d.text((W // 2, 18), "PHONE", font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    path = BUILD / "frame-phone.png"
    lay.save(path)
    return path


def build_ipad_frame():
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    s = IPAD_S
    bezel = 16
    outer = (s["x"] - bezel, s["y"] - bezel, s["x"] + s["w"] + bezel, s["y"] + s["h"] + bezel)
    d.rounded_rectangle(outer, 32, fill=(90, 80, 64, 255))
    d.rounded_rectangle((outer[0] + 2, outer[1] + 2, outer[2] - 2, outer[3] - 2), 30, fill=(22, 20, 17, 255))
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((s["x"], s["y"], s["x"] + s["w"], s["y"] + s["h"]), 16, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)
    d.text((W // 2, 18), "IPAD", font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    path = BUILD / "frame-ipad.png"
    lay.save(path)
    return path


def build_trio_frame():
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)

    def bezel(outer, screen, r_out, r_in, col=(22, 20, 17), edge=(90, 80, 64)):
        rr(d, outer, r_out, edge + (255,))
        o = outer
        rr(d, (o[0] + 2, o[1] + 2, o[2] - 2, o[3] - 2), r_out - 2, col + (255,))
        m = Image.new("L", lay.size, 0)
        ImageDraw.Draw(m).rounded_rectangle(screen, r_in, fill=255)
        lay.paste((0, 0, 0, 0), (0, 0), m)

    bezel((80, 86, 404, 754), (P["x"], P["y"], P["x"] + P["w"], P["y"] + P["h"]), 44, 32)
    rr(d, (196, 93, 288, 106), 7, (8, 7, 6, 255))
    bezel((454, 78, 943, 762), (I["x"], I["y"], I["x"] + I["w"], I["y"] + I["h"]), 38, 18)
    d.rounded_rectangle((993, 136, 1841, 704), 16, fill=(90, 80, 64, 255))
    d.rounded_rectangle((995, 138, 1839, 702), 14, fill=(28, 25, 21, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((1013 + i * 24, 149, 1027 + i * 24, 163), fill=c + (255,))
    d.rounded_rectangle((1100, 145, 1760, 167), 11, fill=(8, 7, 6, 255))
    d.text((1430, 156), "near-private-tickets.netlify.app  ·  testnet",
           font=font(MONO, 14), fill=DIM + (255,), anchor="mm")
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((DK["x"], DK["y"], DK["x"] + DK["w"], DK["y"] + DK["h"]), 8, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)

    d.text((242, 58), "PHONE", font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    d.text((698, 58), "IPAD", font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    d.text((1417, 108), "COMPUTER", font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    d.text((W // 2, 28), "PRIVATE TICKETS  ·  NEAR TESTNET", font=font(MONO, 22),
           fill=GOLD + (255,), anchor="mm")
    path = BUILD / "frame-trio.png"
    lay.save(path)
    return path


def load_marks():
    return {n: json.load(open(REC / n / "marks.json")) for n in ("phone", "ipad", "desktop")}


def build_timeline():
    script = json.load(open(ROOT / "script-ad.json"))
    voice = {k: dur(TTS / f"{k}.mp3") for k, _, _ in script}
    segs = []
    t = 0.0
    gap = 0.06  # tiny breath, not a pause
    for k, _, sub in script:
        length = voice[k] + (0.80 if k == "close" else gap)
        segs.append({
            "key": k,
            "start": t,
            "duration": length,
            "voice": voice[k],
            "sub": sub,
        })
        t += length
    return segs, voice


# Source windows on the desktop (hero) recording, plus tour/close clips per device.
# Times are in the raw webm. We speed-ramp long waits and keep a short live tail on the result.
# Each shot is (device, mark, start_offset, end_offset).
# Windows are tight action/result slices — loading waits are cut, not ramped.
HERO_SHOTS = {
    "hook": [("desktop", "ready", -0.55, None, "event_saved", 0.3)],
    # Fill cap/royalty and click, then jump to the minted ticket on the Ticket tab
    "mint": [
        ("desktop", "mint_fields", -0.05, None, "mint_click", 0.35),
        ("desktop", "mint_done", -1.05, None, "mint_done", 0.45),
    ],
    "overcap": [
        ("desktop", "overcap_click", -0.25, None, "overcap_click", 0.4),
        ("desktop", "overcap_shown", -0.1, None, "overcap_shown", 0.7),
    ],
    "resale": [
        ("desktop", "list_click", -0.2, None, "list_click", 0.35),
        ("desktop", "list_done", -0.15, None, "list_done", 0.55),
        ("desktop", "buy_click", -0.12, None, "buy_click", 0.3),
        ("desktop", "buy_done", -0.15, None, "buy_done", 0.7),
    ],
    "door": [
        ("desktop", "admit_click", -0.15, None, "admit_click", 0.3),
        ("desktop", "admit_shown", -0.12, None, "admit_shown", 0.65),
        ("desktop", "deny_click", -0.12, None, "deny_click", 0.28),
        ("desktop", "deny_shown", -0.12, None, "deny_shown", 0.7),
    ],
    "souvenir": [
        ("desktop", "checkin_click", -0.15, None, "checkin_click", 0.35),
        ("desktop", "checkin_done", -0.15, None, "checkin_done", 0.7),
        ("desktop", "souvenir_shown", -0.9, None, "souvenir_shown", 0.5),
    ],
}

# Device tour uses the souvenir / end state, which already shows the result
TOUR_MARK = {
    "phone": ("souvenir_shown", "end"),
    "ipad": ("souvenir_shown", "end"),
    "desktop": ("souvenir_shown", "end"),
}


def extract_ramped(src, t0, t1, dest_dur, tail, out):
    """Speed the wait so the result lands, then play a short live tail. Never freeze."""
    vis = max(0.2, t1 - t0)
    # Don't run into the following action; tail is real motion after the result
    src_len = vis + tail
    # If the requested window is almost dest_dur, play near 1x
    if src_len <= dest_dur + 0.05:
        # Slightly slow living footage to fill, still moving (min speed ~0.75x)
        factor = max(0.75, src_len / dest_dur)
        sh(
            f'ffmpeg -y -v error -ss {max(0, t0):.3f} -t {src_len:.3f} -i "{src}" '
            f'-vf "fps={FPS},setpts=PTS/{factor:.5f},trim=duration={dest_dur:.3f},setpts=PTS-STARTPTS" '
            f'-an -c:v libx264 -preset veryfast -crf 18 -r {FPS} "{out}"'
        )
        return
    # Fast-forward the wait, then 1x on the result tail
    live = min(tail, max(0.35, dest_dur * 0.22), dest_dur - 0.4)
    fast_out = dest_dur - live
    fast_src = vis  # up to the result mark
    factor = fast_src / fast_out
    mid = BUILD / "tmp" / (Path(out).stem + "_fast.mp4")
    tailp = BUILD / "tmp" / (Path(out).stem + "_tail.mp4")
    sh(
        f'ffmpeg -y -v error -ss {max(0, t0):.3f} -t {fast_src:.3f} -i "{src}" '
        f'-vf "fps={FPS},setpts=PTS/{factor:.5f},trim=duration={fast_out:.3f},setpts=PTS-STARTPTS" '
        f'-an -c:v libx264 -preset veryfast -crf 18 -r {FPS} "{mid}"'
    )
    sh(
        f'ffmpeg -y -v error -ss {t1:.3f} -t {live + 0.05:.3f} -i "{src}" '
        f'-vf "fps={FPS},trim=duration={live:.3f},setpts=PTS-STARTPTS" '
        f'-an -c:v libx264 -preset veryfast -crf 18 -r {FPS} "{tailp}"'
    )
    lst = BUILD / "tmp" / (Path(out).stem + "_list.txt")
    lst.write_text(f"file '{mid.as_posix()}'\nfile '{tailp.as_posix()}'\n")
    sh(f'ffmpeg -y -v error -f concat -safe 0 -i "{lst}" -c copy "{out}"')


def overlay_device(src_clip, box, frame_png, out, duration, zoom=True):
    """Scale a device recording into box and composite with bg + frame.

    Clone-pad the source first, then push in for the full beat, so a short
    clip never ends by repeating a frozen composited frame. scale eval=frame
    is used because zoompan can stall on video input.
    """
    bg = BUILD / "bg.png"
    w, h = box["w"], box["h"]
    # Pad before the push-in so t keeps advancing on the last source frame.
    pad = (
        f"fps={FPS},tpad=stop_mode=clone:stop_duration={duration + 0.5:.3f},"
        f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos"
    )
    zoom_vf = (
        f"{pad},"
        f"scale=w='iw*(1+0.035*t)':h='ih*(1+0.035*t)':eval=frame:flags=bilinear,"
        f"crop={w}:{h}:'(iw-ow)/2':'(ih-oh)*0.58',"
        f"trim=duration={duration:.3f},setpts=PTS-STARTPTS"
    )
    still_vf = (
        f"{pad},"
        f"crop={w}:{h},"
        f"trim=duration={duration:.3f},setpts=PTS-STARTPTS"
    )
    sc = zoom_vf if zoom else still_vf
    sh(
        f'ffmpeg -y -v error -loop 1 -framerate {FPS} -t {duration + 0.25:.3f} -i "{bg}" '
        f'-i "{src_clip}" -loop 1 -t {duration + 0.25:.3f} -i "{frame_png}" '
        f'-filter_complex "'
        f'[1]{sc}[sc];'
        f'[0][sc]overlay={box["x"]}:{box["y"]}:eof_action=endall:shortest=1[a];'
        f'[a][2]overlay=0:0:eof_action=endall:shortest=1,'
        f'format=yuv420p,trim=duration={duration:.3f},setpts=PTS-STARTPTS[v]" '
        f'-map "[v]" -an -c:v libx264 -preset medium -crf 18 -r {FPS} -t {duration:.3f} "{out}"'
    )


def concat_hard(clips, out):
    lst = BUILD / "tmp" / (Path(out).stem + "_cat.txt")
    lst.write_text("".join(f"file '{Path(c).as_posix()}'\n" for c in clips))
    sh(f'ffmpeg -y -v error -f concat -safe 0 -i "{lst}" -c copy "{out}"')


def concat_xfade(clips, out, t=XFADE):
    """Slide-left between clips. Output duration = sum(durs) - (n-1)*t."""
    if len(clips) == 1:
        sh(f'ffmpeg -y -v error -i "{clips[0]}" -c copy "{out}"')
        return
    inputs = " ".join(f'-i "{c}"' for c in clips)
    durs = [dur(c) for c in clips]
    # offset for xfade n is sum(prev visible) - already consumed overlaps
    fc = []
    last = "[0]"
    acc = durs[0]
    for i in range(1, len(clips)):
        offset = acc - t
        nxt = f"[xf{i}]" if i < len(clips) - 1 else "[v]"
        fc.append(f"{last}[{i}]xfade=transition=slideleft:duration={t:.3f}:offset={offset:.3f}{nxt}")
        last = nxt
        acc = acc + durs[i] - t
    fl = ";".join(fc)
    sh(
        f'ffmpeg -y -v error {inputs} -filter_complex "{fl}" -map "[v]" '
        f'-an -c:v libx264 -preset medium -crf 18 -r {FPS} "{out}"'
    )


def shot_times(marks, shot):
    dev, a, aoff, _none, b, boff = shot
    M = marks[dev]
    t0 = max(0, M[a] + aoff)
    t1 = M[b] + boff
    if t1 <= t0 + 0.18:
        t1 = t0 + 0.18
    return dev, t0, t1


def render_hero_segment(seg, marks, out):
    shots = HERO_SHOTS[seg["key"]]
    D = seg["duration"]
    # Results get more time than the click that precedes them
    shares = {
        "hook": [1.0],
        "mint": [0.38, 0.62],
        "overcap": [0.28, 0.72],
        "resale": [0.12, 0.26, 0.12, 0.50],
        "door": [0.12, 0.38, 0.12, 0.38],
        "souvenir": [0.16, 0.36, 0.48],
    }[seg["key"]]
    shares = [s * D for s in shares]

    # Snap shares to whole frames so concatenated duration matches D exactly.
    fr = [int(round(s * FPS)) for s in shares]
    fr[-1] += int(round(D * FPS)) - sum(fr)
    shares = [f / FPS for f in fr]

    parts = []
    for i, shot in enumerate(shots):
        dev, t0, t1 = shot_times(marks, shot)
        clip = BUILD / "tmp" / f"{seg['key']}_{i}_{dev}.mp4"
        extract_ramped(REC / dev / f"{dev}.webm", t0, t1, shares[i], max(0.12, min(0.4, t1 - t0)), clip)
        framed = BUILD / "tmp" / f"{seg['key']}_{i}_framed.mp4"
        # Zoom per shot so a long beat never pushes the payout/error off the frame.
        overlay_device(clip, DW, BUILD / "frame-desktop-hero.png", framed, shares[i], zoom=True)
        parts.append(framed)
    if len(parts) == 1:
        sh(f'ffmpeg -y -v error -i "{parts[0]}" -c copy "{out}"')
    else:
        concat_hard(parts, out)


def render_tour_panel(dev, marks, duration, out):
    M = marks[dev]
    # Badges are arriving just before souvenir_shown; a 2.5s hold starts after it. Stay in the living window.
    shown = M["souvenir_shown"]
    t0 = max(M["checkin_done"] + 0.4, shown - 1.15)
    t1 = shown + 0.55
    clip = BUILD / "tmp" / f"tour_{dev}_raw.mp4"
    extract_ramped(REC / dev / f"{dev}.webm", t0, t1, duration, tail=max(0.25, t1 - shown), out=clip)
    box = {"phone": PHONE_S, "ipad": IPAD_S, "desktop": DW}[dev]
    frame = {
        "phone": BUILD / "frame-phone.png",
        "ipad": BUILD / "frame-ipad.png",
        "desktop": BUILD / "frame-desktop.png",
    }[dev]
    overlay_device(clip, box, frame, out, duration, zoom=True)


def render_trio(marks, duration, out):
    """All three devices on the Built on NEAR footer, with a slow push-in so the frame is never frozen."""
    # Grab a short living slice at the footer (just after the scroll jump), then a slow zoom fills the close.
    stills = []
    for dev in ("phone", "ipad", "desktop"):
        M = marks[dev]
        # Footer appears ~2.2s before end; take one frame from 0.3s after that jump
        t = min(M["end"] - 0.4, M["souvenir_shown"] + 2.85)
        png = BUILD / "tmp" / f"trio_{dev}_end.png"
        sh(f'ffmpeg -y -v error -ss {t:.3f} -i "{REC / dev / (dev + ".webm")}" -frames:v 1 "{png}"')
        stills.append(png)
    # Compose a still trio frame, then push in ~6% over the close
    still = BUILD / "tmp" / "trio_still.png"
    bg = Image.open(BUILD / "bg.png").convert("RGBA")
    frame = Image.open(BUILD / "frame-trio.png").convert("RGBA")
    for png, box in zip(stills, (P, I, DK)):
        im = Image.open(png).convert("RGB")
        im = im.resize((box["w"], box["h"]), Image.Resampling.LANCZOS)
        bg.paste(im, (box["x"], box["y"]))
    bg = Image.alpha_composite(bg, frame).convert("RGB")
    bg.save(still)
    # Push in on the device area only; keep the subtitle band locked in place.
    band_y = BAND["y"]
    band_h = H - band_y
    sh(
        f'ffmpeg -y -v error -loop 1 -framerate {FPS} -i "{still}" -vf "'
        f'split[all][base];'
        f'[all]fps={FPS},crop={W}:{band_y}:0:0,'
        f"scale=w='iw*(1+0.02*t)':h='ih*(1+0.02*t)':eval=frame:flags=bilinear,"
        f"crop={W}:{band_y}:'(iw-ow)/2':0,setsar=1[z];"
        f'[base]fps={FPS},crop={W}:{band_h}:0:{band_y},setsar=1[b];'
        f'[z][b]vstack,format=yuv420p,trim=duration={duration:.3f},setpts=PTS-STARTPTS" '
        f'-an -c:v libx264 -preset medium -crf 18 -r {FPS} -t {duration:.3f} "{out}"'
    )


def write_voice(segs, total):
    parts = [s["key"] for s in segs]
    ins = " ".join(f'-i "{TTS / (k + ".mp3")}"' for k in parts)
    fl = ""
    for i, s in enumerate(segs):
        delay = int(round(s["start"] * 1000))
        fl += f"[{i}]adelay={delay}|{delay},apad=whole_dur={total:.3f}[a{i}];"
    fl += "".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,atrim=0:{total:.3f},loudnorm=I=-16:LRA=11:TP=-1.5[v]"
    sh(f'ffmpeg -y -v error {ins} -filter_complex "{fl}" -map "[v]" -ar 48000 -ac 2 "{BUILD / "voice.wav"}"')


def write_subs(segs):
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Band,Open Sauce Sans,48,&H00EAF1F4,&H00EAF1F4,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,0,2,80,80,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for s in segs:
        start = s["start"]
        # Track the spoken line, don't linger into the next beat.
        # Hold the close URL through the end card / ring-out.
        if s["key"] == "close":
            end = s["start"] + s["duration"]
        else:
            end = min(s["start"] + s["voice"] + 0.12, s["start"] + s["duration"])
        text = s["sub"].replace("\n", "\\N")
        lines.append(f"Dialogue: 0,{ts_ass(start)},{ts_ass(end)},Band,,0,0,0,,{text}\n")
    (BUILD / "subs.ass").write_text("".join(lines))

    def srt_ts(x):
        ms = int(round(x * 1000))
        return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
    srt = []
    for i, s in enumerate(segs, 1):
        start = s["start"]
        if s["key"] == "close":
            end = s["start"] + s["duration"]
        else:
            end = min(s["start"] + s["voice"] + 0.12, s["start"] + s["duration"])
        srt.append(f"{i}\n{srt_ts(start)} --> {srt_ts(end)}\n{s['sub']}\n")
    (ROOT / "private-tickets-near-ad.srt").write_text("\n".join(srt) + "\n")


def maybe_music(total, voice_wav, out_wav):
    """Generate a quiet, original bed and duck it under the voice. Skip if it fails."""
    try:
        import numpy as np
        sr = 48000
        n = int(total * sr) + sr
        t = np.arange(n) / sr
        # Soft two-note pulse in a minor color, very low, plus a muted tick
        bpm = 88
        beat = 60.0 / bpm
        # A2 and E3 sine beds
        pad = 0.04 * np.sin(2 * np.pi * 110 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * (1 / 8) * t))
        pad += 0.03 * np.sin(2 * np.pi * 164.81 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * (1 / 10) * t + 1))
        # gentle pulse
        env = 0.5 + 0.5 * np.sin(2 * np.pi * (1 / beat) * t - np.pi / 2)
        env = np.clip(env, 0.15, 1.0) ** 2
        tick = np.zeros_like(t)
        # soft low tom every beat
        for i, bt in enumerate(np.arange(0, total + 1, beat)):
            s = int(bt * sr)
            if s >= n:
                break
            l = int(0.12 * sr)
            tt = np.arange(l) / sr
            tone = np.sin(2 * np.pi * (68 if i % 4 else 55) * tt) * np.exp(-tt * 18)
            e = s + l
            if e > n:
                tone = tone[: n - s]
                e = n
            tick[s:e] += 0.05 * tone
        bed = (pad * env + tick) * 0.45
        # fade in/out
        fi = int(0.4 * sr); fo = int(1.0 * sr)
        bed[:fi] *= np.linspace(0, 1, fi)
        bed[-fo:] *= np.linspace(1, 0, fo)
        bed = np.clip(bed, -0.6, 0.6)
        stereo = np.column_stack([bed, bed])
        raw = BUILD / "tmp" / "bed.f32"
        stereo.astype("<f4").tofile(raw)
        bed_wav = BUILD / "tmp" / "bed.wav"
        sh(
            f'ffmpeg -y -v error -f f32le -ar {sr} -ac 2 -i "{raw}" '
            f'-af "lowpass=f=2500,volume=-22dB,loudnorm=I=-30:LRA=8:TP=-3" -ar 48000 -ac 2 "{bed_wav}"'
        )
        # Duck the bed under the voice
        mixed = BUILD / "tmp" / "voice_bed.wav"
        sh(
            f'ffmpeg -y -v error -i "{voice_wav}" -i "{bed_wav}" -filter_complex '
            f'"[1][0]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=250:makeup=1[bed];'
            f'[0][bed]amix=inputs=2:weights=1 0.35:normalize=0,alimiter=limit=0.95[a]" '
            f'-map "[a]" -ar 48000 -ac 2 "{mixed}"'
        )
        # keep if durations are sane
        if abs(dur(mixed) - dur(voice_wav)) < 0.5:
            sh(f'ffmpeg -y -v error -i "{mixed}" -c copy "{out_wav}"')
            print("MUSIC mixed under voice", flush=True)
            return True
    except Exception as e:
        print("MUSIC skipped:", e, flush=True)
    return False


def mux(video, audio, total):
    subs = BUILD / "subs.ass"
    out = ROOT / "private-tickets-near-ad.mp4"
    fontsdir = ROOT / "fonts"
    sh(
        f'ffmpeg -y -v error -i "{video}" -i "{audio}" '
        f'-vf "ass={subs}:fontsdir={fontsdir}" '
        f'-c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k '
        f'-shortest -movflags +faststart -t {total:.3f} "{out}"'
    )
    print("OUT", out, "dur", round(dur(out), 2), "size", out.stat().st_size, flush=True)
    return out


def freezedetect(path):
    r = subprocess.run(
        f'ffmpeg -hide_banner -i "{path}" -vf "freezedetect=n=0.003:d=0.7" -map 0:v -f null -',
        shell=True, capture_output=True, text=True,
    )
    lines = [ln for ln in (r.stderr or "").splitlines() if "freeze" in ln.lower()]
    print("FREEZEDETECT", len(lines), "lines", flush=True)
    for ln in lines:
        print(" ", ln, flush=True)
    return lines


def main():
    os.makedirs(BUILD / "seg", exist_ok=True)
    os.makedirs(BUILD / "tmp", exist_ok=True)
    build_bg()
    build_desktop_hero_frame()
    build_desktop_frame()
    build_phone_frame()
    build_ipad_frame()
    build_trio_frame()
    marks = load_marks()
    segs, voice = build_timeline()
    print("TIMELINE", [(s["key"], round(s["start"], 2), round(s["duration"], 2), round(s["voice"], 2)) for s in segs],
          "VOICE", round(sum(s["voice"] for s in segs), 2),
          "SUM", round(segs[-1]["start"] + segs[-1]["duration"], 2), flush=True)

    # Render core hero segments (hard cuts)
    core_keys = ["hook", "mint", "overcap", "resale", "door", "souvenir"]
    core_clips = []
    for s in segs:
        if s["key"] not in core_keys:
            continue
        out = BUILD / "seg" / f"{s['key']}.mp4"
        render_hero_segment(s, marks, out)
        print("seg", s["key"], "dur", round(dur(out), 2), "target", round(s["duration"], 2), flush=True)
        core_clips.append(out)
    core = BUILD / "seg" / "core.mp4"
    concat_hard(core_clips, core)

    # Device tour: three equal panels covering the devices line, then trio close
    dev_seg = next(s for s in segs if s["key"] == "devices")
    close_seg = next(s for s in segs if s["key"] == "close")
    # Add XFADE overlap so after slides, unique duration still matches the voice
    panel = (dev_seg["duration"] + 2 * XFADE) / 3
    tour_clips = []
    for dev in ("phone", "ipad", "desktop"):
        out = BUILD / "seg" / f"tour_{dev}.mp4"
        render_tour_panel(dev, marks, panel, out)
        print("tour", dev, "dur", round(dur(out), 2), "target", round(panel, 2), flush=True)
        tour_clips.append(out)
    tour = BUILD / "seg" / "tour.mp4"
    concat_xfade(tour_clips, tour, XFADE)
    print("tour assembled", round(dur(tour), 2), flush=True)

    close = BUILD / "seg" / "close.mp4"
    render_trio(marks, close_seg["duration"] + XFADE, close)
    print("close", round(dur(close), 2), flush=True)

    # Slide from the desktop hero into the tour, then into the trio
    tail = BUILD / "seg" / "tail.mp4"
    concat_xfade([core, tour, close], tail, XFADE)
    print("picture", round(dur(tail), 2), flush=True)

    total = dur(tail)
    # Keep voice starts on the original (pre-xfade) timeline of the first 6,
    # then devices at the moment the tour begins (end of core - XFADE),
    # close at the moment the trio begins.
    core_d = dur(core)
    tour_d = dur(tour)
    # Rebuild voice start times to match the xfade picture
    t = 0.0
    for s in segs:
        if s["key"] in core_keys:
            s["start"] = t
            t += s["duration"]
    # After hard concat, core duration may differ by a frame; use measured
    # Tour starts sliding in at core_d - XFADE
    dev_seg["start"] = max(0, core_d - XFADE)
    close_seg["start"] = dev_seg["start"] + tour_d - XFADE
    # Don't let close start after the picture ends
    picture_end = total
    print("VOICE_STARTS", {s["key"]: round(s["start"], 3) for s in segs}, "PICTURE", round(total, 2), flush=True)

    write_voice(segs, total)
    write_subs(segs)
    json.dump(segs, open(BUILD / "timeline.json", "w"), indent=2)
    audio = BUILD / "voice.wav"
    mixed = BUILD / "mix.wav"
    if maybe_music(total, audio, mixed):
        audio = mixed
    out = mux(tail, audio, total)
    lines = freezedetect(out)
    long_freezes = [ln for ln in lines if "freeze_duration" in ln]
    # parse durations
    bad = []
    for ln in long_freezes:
        # freeze_duration: 1.23
        try:
            val = float(ln.split("freeze_duration:")[-1].strip())
            if val > 0.7 + 0.02:
                bad.append(val)
        except Exception:
            bad.append(ln)
    if bad:
        print("WARN freezes over 0.7s:", bad, flush=True)
    else:
        print("FREEZE_OK no holds over 0.7s", flush=True)
    if total < 35 or total > 50:
        print("WARN duration outside 35-50s:", total, flush=True)


if __name__ == "__main__":
    main()
