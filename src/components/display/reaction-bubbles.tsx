"use client";

import { useEffect, useRef, useState } from "react";
import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { reactionsCol } from "@/lib/firebase/firestore";
import { REACTION_EMOJI, type ReactionType } from "@/types";

interface Bubble {
  id: string;
  type: ReactionType;
  left: number; // vw percent
  size: number; // rem
  duration: number; // s
}

const MAX_BUBBLES = 20;
const WINDOW_MS = 15_000;

/** Floating reaction bubbles for the public display (PRD §11.5). */
export function ReactionBubbles({ debateId }: { debateId: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [storm, setStorm] = useState(false);
  const seen = useRef(new Set<string>());
  const mounted = useRef(Date.now());
  const recentTimes = useRef<number[]>([]);
  const stormCooldownUntil = useRef(0);

  useEffect(() => {
    return onSnapshot(
      query(reactionsCol(debateId), orderBy("createdAt", "desc"), limit(30)),
      (snap) => {
        const fresh: Bubble[] = [];
        for (const d of snap.docs) {
          if (seen.current.has(d.id)) continue;
          const data = d.data();
          const at = data.createdAt?.toMillis?.() ?? 0;
          // Only animate reactions that happened after this screen loaded
          // and within the recency window.
          if (at < mounted.current - 2000 || Date.now() - at > WINDOW_MS) {
            seen.current.add(d.id);
            continue;
          }
          seen.current.add(d.id);
          fresh.push({
            id: d.id,
            type: data.type,
            left: 8 + Math.random() * 84,
            size: 2 + Math.random() * 1.5,
            duration: 3.2 + Math.random() * 1.6,
          });
        }
        if (fresh.length > 0) {
          setBubbles((prev) => [...prev, ...fresh].slice(-MAX_BUBBLES));
          // Trim the seen set occasionally
          if (seen.current.size > 500) {
            seen.current = new Set([...seen.current].slice(-200));
          }
          // Reaction storm: 10+ reactions inside 8 seconds sets the room off
          const now = Date.now();
          recentTimes.current = [
            ...recentTimes.current.filter((t) => now - t < 8000),
            ...fresh.map(() => now),
          ];
          if (
            recentTimes.current.length >= 10 &&
            now > stormCooldownUntil.current
          ) {
            stormCooldownUntil.current = now + 20_000;
            setStorm(true);
            setTimeout(() => setStorm(false), 4000);
          }
        }
      }
    );
  }, [debateId]);

  // Remove bubbles after their animation ends
  useEffect(() => {
    if (bubbles.length === 0) return;
    const t = setTimeout(() => {
      setBubbles((prev) => prev.slice(Math.ceil(prev.length / 3)));
    }, 2500);
    return () => clearTimeout(t);
  }, [bubbles]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="absolute bottom-0 animate-reaction-float"
          style={{
            left: `${b.left}vw`,
            fontSize: `${b.size}rem`,
            animationDuration: `${b.duration}s`,
          }}
        >
          {REACTION_EMOJI[b.type]}
        </span>
      ))}
      {storm && (
        <div className="absolute inset-0 flex items-start justify-center pt-24">
          <p className="animate-shift-banner rounded-full bg-accent-flame px-10 py-4 font-display text-4xl font-black uppercase tracking-wide text-white shadow-overlay">
            🔥 The room is erupting! 🔥
          </p>
        </div>
      )}
    </div>
  );
}
