#!/usr/bin/env python3
"""Composite phone, iPad and desktop recordings into Mark's standard 16:9 layout."""
import json, os, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).parent
W, H, FPS = 1920, 1080, 30
# Standard trio geometry from Mark's earlier Private Tickets videos
P = dict(x=94, y=100, w=296, h=640)
I = dict(x=476, y=100, w=445, h=640)
DK = dict(x=1001, y=176, w=832, h=520)
# Subtitle band sits clearly below the devices
BAND = dict(y=820, h=220)
GOLD = (212, 179, 122)
CREAM = (244, 241, 234)
DIM = (167, 158, 145)
BG_TOP = (12, 11, 9)
BG_BOT = (26, 23, 18)
BAND_BG = (8, 7, 6)

FONT_DIR = ROOT / "fonts"
XB = FONT_DIR / "OpenSauceSans-ExtraBold.ttf"
SB = FONT_DIR / "OpenSauceSans-SemiBold.ttf"
MONO = FONT_DIR / "IBMPlexMono-Bold.ttf"

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

def build_bg_and_frame():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        col = tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * k) for i in range(3))
        d.line([(0, y), (W, y)], fill=col)
    # vignette
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).ellipse([-280, -220, W + 280, H + 180], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(140))
    im = Image.composite(im, Image.new("RGB", (W, H), (4, 3, 2)), v)
    # subtitle band
    d = ImageDraw.Draw(im)
    d.rectangle((0, BAND["y"], W, H), fill=BAND_BG)
    d.line([(80, BAND["y"]), (W - 80, BAND["y"])], fill=(58, 52, 42), width=2)
    im.save(ROOT / "build" / "bg.png")

    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)

    def rr(box, r, fill):
        d.rounded_rectangle(box, r, fill=fill)

    def bezel(outer, screen, r_out, r_in, col=(22, 20, 17), edge=(90, 80, 64)):
        rr(outer, r_out, edge + (255,))
        o = outer
        rr((o[0] + 2, o[1] + 2, o[2] - 2, o[3] - 2), r_out - 2, col + (255,))
        m = Image.new("L", lay.size, 0)
        ImageDraw.Draw(m).rounded_rectangle(screen, r_in, fill=255)
        lay.paste((0, 0, 0, 0), (0, 0), m)

    # phone
    bezel((80, 86, 404, 754), (P["x"], P["y"], P["x"] + P["w"], P["y"] + P["h"]), 44, 32)
    rr((196, 93, 288, 106), 7, (8, 7, 6, 255))
    # ipad
    bezel((454, 78, 943, 762), (I["x"], I["y"], I["x"] + I["w"], I["y"] + I["h"]), 38, 18)
    # desktop window
    d.rounded_rectangle((993, 136, 1841, 704), 16, fill=(90, 80, 64, 255))
    d.rounded_rectangle((995, 138, 1839, 702), 14, fill=(28, 25, 21, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((1013 + i * 24, 149, 1027 + i * 24, 163), fill=c + (255,))
    d.rounded_rectangle((1100, 145, 1760, 167), 11, fill=(8, 7, 6, 255))
    d.text((1430, 156), "localhost:5174  ·  Private Tickets  ·  testnet",
           font=font(MONO, 14), fill=DIM + (255,), anchor="mm")
    m = Image.new("L", lay.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((DK["x"], DK["y"], DK["x"] + DK["w"], DK["y"] + DK["h"]), 8, fill=255)
    lay.paste((0, 0, 0, 0), (0, 0), m)

    def label(x, y, txt):
        d.text((x, y), txt, font=font(MONO, 20), fill=GOLD + (255,), anchor="mm")
    label(242, 58, "PHONE · 390×844")
    label(698, 58, "IPAD · 820×1180")
    label(1417, 108, "DESKTOP · 1440×900")
    d.text((W // 2, 28), "PRIVATE TICKETS  ·  NEAR TESTNET", font=font(MONO, 22),
           fill=GOLD + (255,), anchor="mm")
    lay.save(ROOT / "build" / "trio_frame.png")

def load_marks(name):
    return json.load(open(ROOT / "rec" / name / "marks.json"))

def build_timeline():
    """Map voice sections onto recording marks, padding for on-chain waits."""
    script = json.load(open(ROOT / "script.json"))
    voice = {k: dur(ROOT / "tts" / f"{k}.mp3") for k, _, _ in script}
    marks = {n: load_marks(n) for n in ("phone", "ipad", "desktop")}
    # Visual cues in the recording
    # hook: ready -> event_saved (plus a little of the form)
    # mint: mint_click -> mint_done + hold
    # owner: owner_click -> owner_shown + hold
    # transfer: transfer_click -> transfer_done + hold
    # admit: admit_click -> admit_shown + hold
    # deny: deny_click -> deny_shown + hold
    # close: deny_shown -> end
    mapping = {
        "hook": ("ready", "event_saved"),
        "mint": ("mint_click", "mint_done"),
        "owner": ("owner_click", "owner_shown"),
        "transfer": ("transfer_click", "transfer_done"),
        "admit": ("admit_click", "admit_shown"),
        "deny": ("deny_click", "deny_shown"),
        "close": ("deny_shown", "end"),
    }
    # Use desktop marks as the canonical visual length, but we'll cut each
    # device at its own marks (they should be close).
    M = marks["desktop"]
    segs = []
    t = 0.0
    HOLD = 2.0
    for k, _, sub in script:
        a, b = mapping[k]
        vis = max(0.4, M[b] - M[a])
        # Keep result visible after the wait; never shorter than the voice + small pad
        length = max(voice[k] + 0.35, vis + (HOLD if k != "close" else 0.4))
        # If the on-chain wait is long, keep it (real) but cap extreme dead air
        if length > 22 and k in ("mint", "transfer"):
            length = max(voice[k] + 6.0, 16.0)
        segs.append({
            "key": k,
            "start": t,
            "duration": length,
            "voice": voice[k],
            "sub": sub,
            "mark_a": a,
            "mark_b": b,
        })
        t += length
    return segs, marks

def write_voice(segs, total):
    parts = [s["key"] for s in segs]
    ins = " ".join(f'-i "{ROOT / "tts" / (k + ".mp3")}"' for k in parts)
    fl = ""
    for i, s in enumerate(segs):
        delay = int(round(s["start"] * 1000))
        fl += f"[{i}]adelay={delay}|{delay},apad=whole_dur={total:.3f}[a{i}];"
    fl += "".join(f"[a{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,atrim=0:{total:.3f},loudnorm=I=-16:LRA=11:TP=-1.5[v]"
    sh(f'ffmpeg -y -v error {ins} -filter_complex "{fl}" -map "[v]" -ar 48000 -ac 2 "{ROOT / "build" / "voice.wav"}"')

def write_subs(segs):
    # ASS subs, large cream text centered in the lower band
    # PlayRes 1920x1080; MarginV places the line in the band
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
        end = s["start"] + max(s["voice"] + 0.15, s["duration"] - 0.25)
        text = s["sub"].replace("\n", "\\N")
        lines.append(f"Dialogue: 0,{ts_ass(start)},{ts_ass(end)},Band,,0,0,0,,{text}\n")
    (ROOT / "build" / "subs.ass").write_text("".join(lines))
    # also srt for convenience
    def srt_ts(x):
        ms = int(round(x * 1000))
        return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
    srt = []
    for i, s in enumerate(segs, 1):
        start = s["start"]
        end = s["start"] + max(s["voice"] + 0.15, s["duration"] - 0.25)
        srt.append(f"{i}\n{srt_ts(start)} --> {srt_ts(end)}\n{s['sub']}\n")
    (ROOT / "demo-subs.srt" if False else ROOT / "private-tickets-near.srt").write_text("\n".join(srt) + "\n")

def render_visual(segs, marks, total):
    """For each section, speed the mark_a..mark_b span to fit, then freeze on the last frame."""
    # Build per-device filter input list
    # We'll render one ffmpeg command: for each device, concat trimmed/sped clips then overlay.
    # Simpler approach: render each section as a trio clip, then concat.

    os.makedirs(ROOT / "build" / "seg", exist_ok=True)
    for s in segs:
        k = s["key"]
        D = s["duration"]
        ins = []
        # inputs: 0=bg, 1=phone, 2=ipad, 3=desktop, 4=frame
        # For each device, take from mark_a, lasting (mark_b-mark_a), setpts to fit D
        # If vis < D, tpad clone (freeze). If vis > D, speed up slightly so the result still lands before the end.
        for n in ("phone", "ipad", "desktop"):
            M = marks[n]
            a = M[s["mark_a"]]
            b = M[s["mark_b"]]
            vis = max(0.4, b - a)
            # include a short tail after mark_b so the result is on screen
            tail = 0.35
            src = ROOT / "rec" / n / f"{n}.webm"
            ins.append(f'-ss {max(0, a):.3f} -t {vis + tail:.3f} -i "{src}"')
        inputs = f'-loop 1 -framerate {FPS} -t {D + 0.5:.3f} -i "{ROOT / "build" / "bg.png"}" ' + " ".join(ins) + f' -loop 1 -i "{ROOT / "build" / "trio_frame.png"}"'
        # After inputs: 0 bg, 1 phone, 2 ipad, 3 desktop, 4 frame
        def scale_pad(idx, box, vis):
            # Speed so vis maps to min(vis, D-0.8) leaving freeze room, or to D if vis is short
            if vis >= D:
                factor = vis / D  # >1 means speed up (setpts PTS/factor)
                return (f"[{idx}]fps={FPS},setpts=PTS/{factor:.5f},scale={box['w']}:{box['h']}:force_original_aspect_ratio=increase:flags=lanczos,"
                        f"crop={box['w']}:{box['h']},tpad=stop_mode=clone:stop_duration=2,trim=duration={D:.3f},setpts=PTS-STARTPTS[s{idx}];")
            else:
                return (f"[{idx}]fps={FPS},scale={box['w']}:{box['h']}:force_original_aspect_ratio=increase:flags=lanczos,"
                        f"crop={box['w']}:{box['h']},tpad=stop_mode=clone:stop_duration={D-vis+2:.3f},trim=duration={D:.3f},setpts=PTS-STARTPTS[s{idx}];")
        vis_ref = max(0.4, marks["desktop"][s["mark_b"]] - marks["desktop"][s["mark_a"]])
        fc = (
            scale_pad(1, P, max(0.4, marks["phone"][s["mark_b"]] - marks["phone"][s["mark_a"]]))
            + scale_pad(2, I, max(0.4, marks["ipad"][s["mark_b"]] - marks["ipad"][s["mark_a"]]))
            + scale_pad(3, DK, vis_ref)
            + f"[0][s1]overlay={P['x']}:{P['y']}:shortest=1[a];"
            + f"[a][s2]overlay={I['x']}:{I['y']}[b];"
            + f"[b][s3]overlay={DK['x']}:{DK['y']}[c];"
            + f"[c][4]overlay=0:0,format=yuv420p,trim=duration={D:.3f},setpts=PTS-STARTPTS[v]"
        )
        out = ROOT / "build" / "seg" / f"{k}.mp4"
        sh(f'ffmpeg -y -v error {inputs} -filter_complex "{fc}" -map "[v]" -an -c:v libx264 -preset medium -crf 18 -r {FPS} "{out}"')
        print("seg", k, "dur", round(dur(out), 2), "target", round(D, 2), flush=True)

    lst = ROOT / "build" / "list.txt"
    lst.write_text("".join(f"file '{(ROOT / 'build' / 'seg' / (s['key'] + '.mp4')).as_posix()}'\n" for s in segs))
    sh(f"ffmpeg -y -v error -f concat -safe 0 -i {lst} -c copy {ROOT / 'build' / 'video_noaudio.mp4'}")

def mux(total):
    video = ROOT / "build" / "video_noaudio.mp4"
    voice = ROOT / "build" / "voice.wav"
    subs = ROOT / "build" / "subs.ass"
    out = ROOT / "private-tickets-near.mp4"
    # fontsdir for ASS
    fontsdir = ROOT / "fonts"
    sh(
        f'ffmpeg -y -v error -i "{video}" -i "{voice}" '
        f'-vf "ass={subs}:fontsdir={fontsdir}" '
        f'-c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k '
        f'-shortest -movflags +faststart -t {total:.3f} "{out}"'
    )
    print("OUT", out, "dur", round(dur(out), 2), "size", out.stat().st_size, flush=True)

def main():
    os.makedirs(ROOT / "build", exist_ok=True)
    build_bg_and_frame()
    segs, marks = build_timeline()
    total = segs[-1]["start"] + segs[-1]["duration"]
    print("TIMELINE", [(s["key"], round(s["start"], 2), round(s["duration"], 2)) for s in segs], "TOTAL", round(total, 2))
    if total < 60 or total > 95:
        print("WARN duration outside 60-90s target:", total)
    write_voice(segs, total)
    write_subs(segs)
    json.dump(segs, open(ROOT / "build" / "timeline.json", "w"), indent=2)
    render_visual(segs, marks, total)
    mux(total)

if __name__ == "__main__":
    main()
