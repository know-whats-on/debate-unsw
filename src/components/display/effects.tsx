"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/* ------------------------------------------------------------------
   Sound engine — synthesized with WebAudio so no assets are needed.
   Browsers only allow audio after a user gesture, so the display has a
   one-click 🔊 toggle (instructor clicks it once when setting up the
   projector).
------------------------------------------------------------------- */
export function useDisplaySound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      if (!on) ensureCtx();
      return !on;
    });
  }, [ensureCtx]);

  /** Thunder: filtered noise burst + low rumble. */
  const thunder = useCallback(() => {
    if (!enabled) return;
    const ctx = ensureCtx();
    const seconds = 1.4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();

    const rumble = ctx.createOscillator();
    rumble.type = "sine";
    rumble.frequency.setValueAtTime(52, ctx.currentTime);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.35, ctx.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    rumble.connect(rumbleGain).connect(ctx.destination);
    rumble.start();
    rumble.stop(ctx.currentTime + seconds);
  }, [enabled, ensureCtx]);

  const tone = useCallback(
    (freq: number, duration = 0.16, volume = 0.25, type: OscillatorType = "square") => {
      if (!enabled) return;
      const ctx = ensureCtx();
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [enabled, ensureCtx]
  );

  /** Countdown tick (higher pitch on the final second). */
  const tick = useCallback(
    (final = false) => tone(final ? 1320 : 880, final ? 0.5 : 0.14, 0.3),
    [tone]
  );

  /** Quick rising fanfare for round changes. */
  const fanfare = useCallback(() => {
    if (!enabled) return;
    [523, 659, 784, 1046].forEach((freq, i) =>
      setTimeout(() => tone(freq, 0.22, 0.28, "triangle"), i * 110)
    );
  }, [enabled, tone]);

  return { enabled, toggle, thunder, tick, fanfare };
}

/* ------------------------------------------------------------------
   Edge fire — flames creep around the screen edges when a round is in
   its final 10%. Coloured for the leading side, classic fire on a tie.
------------------------------------------------------------------- */
const FIRE_PALETTES = {
  for: ["#6063ee", "#8455ef", "#c0c1ff"],
  against: ["#dc2c4f", "#fc7426", "#fec828"],
  tie: ["#fc7426", "#fe9e20", "#fec828"],
} as const;

export function EdgeFire({ tone }: { tone: keyof typeof FIRE_PALETTES }) {
  const [a, b, c] = FIRE_PALETTES[tone];
  const layer = (gradient: string, className: string, duration: string, origin: string) => (
    <div
      aria-hidden
      className={cn("absolute animate-fire-flicker blur-xl", className)}
      style={{ background: gradient, animationDuration: duration, transformOrigin: origin }}
    />
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {layer(`linear-gradient(to top, ${a}cc, ${b}66, transparent)`, "inset-x-0 bottom-0 h-40", "0.38s", "bottom")}
      {layer(`linear-gradient(to top, ${c}99, transparent)`, "inset-x-0 bottom-0 h-24", "0.27s", "bottom")}
      {layer(`linear-gradient(to bottom, ${a}99, transparent)`, "inset-x-0 top-0 h-28", "0.44s", "top")}
      {layer(`linear-gradient(to right, ${b}aa, transparent)`, "inset-y-0 left-0 w-28", "0.31s", "left")}
      {layer(`linear-gradient(to left, ${b}aa, transparent)`, "inset-y-0 right-0 w-28", "0.35s", "right")}
    </div>
  );
}

/* ------------------------------------------------------------------
   Final-five countdown — giant flashing 5·4·3·2·1 in centre screen.
------------------------------------------------------------------- */
export function CountdownOverlay({ second }: { second: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <p
        key={second}
        className="animate-countdown-pop font-display text-[22rem] font-black leading-none text-accent-flame drop-shadow-[0_0_60px_rgba(252,116,38,0.8)]"
      >
        {second}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------
   Round splash — cinematic full-screen card when the phase changes.
------------------------------------------------------------------- */
export function RoundSplash({
  title,
  subtitle,
  splashKey,
}: {
  title: string;
  subtitle?: string;
  splashKey: number;
}) {
  return (
    <div key={splashKey} className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <div className="animate-splash rounded-3xl border-4 border-inverse-primary bg-surface/90 px-20 py-14 text-center shadow-overlay backdrop-blur-lg">
        <p className="font-display text-7xl font-black uppercase tracking-tight text-on-surface">
          {title}
        </p>
        {subtitle && (
          <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.3em] text-inverse-primary">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
