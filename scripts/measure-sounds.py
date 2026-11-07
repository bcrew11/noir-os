# Spectral balance of rendered navigation sounds (first "move" hit of each preview WAV).
# Usage: node scripts/render-sounds.mjs out/ && python3 scripts/measure-sounds.py out/
import sys, wave, struct, glob
import numpy as np
# Analyse the first (move) sound: a window that starts in silence before the hit and ends after it
# has fully decayed, with no tapering window (the sound already starts and ends at zero).
for f in sorted(glob.glob(sys.argv[1] + '/*.wav')):
    w = wave.open(f); n = w.getnframes(); sr = w.getframerate()
    a = np.array(struct.unpack('<%dh' % n, w.readframes(n)))[int(0.03*sr):int(0.30*sr)] / 32768
    spec = np.abs(np.fft.rfft(a))**2; fr = np.fft.rfftfreq(len(a), 1/sr); tot = spec.sum()
    pct = lambda lo, hi: float(spec[(fr >= lo) & (fr < hi)].sum() / tot * 100)
    cen = float((spec * fr).sum() / tot)
    print(f"{f.split('/')[-1]:28s} <250Hz={pct(0,250):5.1f}%  250-1k={pct(250,1000):5.1f}%  1-4k={pct(1000,4000):5.1f}%  >4k={pct(4000,99999):4.1f}%  centre={cen:5.0f}Hz")
