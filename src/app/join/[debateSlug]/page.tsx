"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getDocs, limit, query, where } from "firebase/firestore";
import { debatesCol } from "@/lib/firebase/firestore";
import { saveStudentSession } from "@/lib/session";
import { normalizeJoinCode } from "@/lib/debate/joinCodes";
import type { Debate } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/logo";

const ERROR_COPY: Record<string, string> = {
  invalid_code:
    "We could not find that join code for this debate. Please check the code your instructor shared.",
  debate_not_found: "We could not find this debate. Please check the link.",
  debate_not_ready:
    "This debate is not open yet. Your instructor will let you know when to join.",
  debate_ended: "This debate has already ended.",
  network:
    "We could not reach Digital Jury. Please check your connection and try again.",
  service_busy:
    "Digital Jury has hit its daily database limit. Please tell your instructor — joining will work again once the limit is lifted.",
  server_error: "Something went wrong on our side. Please try again.",
};

export default function JoinPage({
  params,
}: {
  params: Promise<{ debateSlug: string }>;
}) {
  const { debateSlug } = use(params);
  const router = useRouter();
  const [debate, setDebate] = useState<Debate | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getDocs(
      query(debatesCol(), where("audienceJoinSlug", "==", debateSlug), limit(1))
    )
      .then((snap) =>
        setDebate(
          snap.empty ? null : { ...snap.docs[0].data(), id: snap.docs[0].id }
        )
      )
      .catch(() => setDebate(null));
  }, [debateSlug]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (normalized.length !== 6) {
      setError("Join codes are 6 characters, like 7XK2MP.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/join/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: debateSlug, code: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERROR_COPY[data.error] ?? ERROR_COPY.server_error);
        setBusy(false);
        return;
      }
      saveStudentSession(data);
      router.replace(`/audience/${data.debateId}`);
    } catch {
      setError(ERROR_COPY.network);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-surface px-4 py-10">
      <Logo className="text-2xl" />

      <div className="mt-8 w-full max-w-md">
        {debate === null ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 font-display font-semibold text-on-surface">
                Debate not found
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {ERROR_COPY.debate_not_found}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">
                You’re invited to debate
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold text-on-surface">
                {debate === undefined ? "Loading…" : debate.title}
              </h1>
            </div>

            <Card className="shadow-raised">
              <CardContent className="p-6">
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <div>
                    <Label htmlFor="joinCode">Your join code</Label>
                    <Input
                      id="joinCode"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      maxLength={6}
                      placeholder="7XK2MP"
                      className="h-14 text-center font-mono text-2xl font-bold tracking-[0.4em]"
                      value={code}
                      onChange={(e) =>
                        setCode(normalizeJoinCode(e.target.value))
                      }
                    />
                  </div>
                  {error && (
                    <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                      {error}
                    </p>
                  )}
                  <Button type="submit" size="lg" disabled={busy || debate === undefined}>
                    {busy ? "Joining…" : "Join the debate"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="mt-6 text-center text-xs leading-relaxed text-on-surface-variant">
              Your join code identifies you to your instructor. Your comments
              may appear on the public debate screen using your first name and
              last initial. Your reflection stays private to your instructor.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
