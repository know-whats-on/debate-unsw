"use client";

import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { debateDoc, roundsCol } from "@/lib/firebase/firestore";
import type { Debate, Round } from "@/types";

/** Realtime debate document + ordered rounds. `debate === null` means not found. */
export function useDebate(debateId: string) {
  const [debate, setDebate] = useState<Debate | null | undefined>(undefined);
  const [rounds, setRounds] = useState<Round[]>([]);

  useEffect(() => {
    const unsub1 = onSnapshot(
      debateDoc(debateId),
      (snap) => setDebate(snap.exists() ? { ...snap.data(), id: snap.id } : null),
      () => setDebate(null)
    );
    const unsub2 = onSnapshot(
      query(roundsCol(debateId), orderBy("index")),
      (snap) => setRounds(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      () => setRounds([])
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [debateId]);

  return { debate, rounds, loading: debate === undefined };
}
