import asyncio, json, os, subprocess, sys, edge_tts
from pathlib import Path
V = "en-US-AndrewNeural"
ROOT = Path(__file__).parent
TTS = ROOT / "tts"
TTS.mkdir(exist_ok=True)

async def one(k, t):
    c = edge_tts.Communicate(t, V, rate="+6%", boundary="WordBoundary")
    words = []
    out = TTS / f"{k}.mp3"
    with open(out, "wb") as f:
        async for ch in c.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append([ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]])
    json.dump(words, open(TTS / f"{k}.json", "w"))
    d = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)
    ]))
    print(k, round(d, 2), "s", flush=True)
    return d

async def main():
    script = json.load(open(ROOT / "script.json"))
    total = 0
    for k, t, _ in script:
        for i in range(5):
            try:
                total += await one(k, t)
                break
            except Exception as e:
                print("retry", k, e, flush=True)
                await asyncio.sleep(2)
        else:
            sys.exit(f"failed {k}")
    print("TOTAL_VOICE", round(total, 2), flush=True)

asyncio.run(main())
