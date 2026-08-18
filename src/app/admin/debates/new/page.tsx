"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { debatesCol, roundsCol } from "@/lib/firebase/firestore";
import { DEFAULT_ROUNDS } from "@/lib/debate/defaults";
import { generateSlug } from "@/lib/debate/slug";
import { FullPageSpinner } from "@/components/ui/spinner";

/** Creates a draft debate with default rounds, then opens the setup wizard. */
export default function NewDebatePage() {
  const { user } = useAuth();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;

    (async () => {
      const ref = await addDoc(debatesCol(), {
        courseId: "",
        classId: "",
        instructorId: user.uid,
        title: "",
        forLabel: "For",
        againstLabel: "Against",
        status: "draft",
        currentRoundIndex: 0,
        currentPhase: "round",
        totalPausedMs: 0,
        audienceJoinSlug: generateSlug(),
        displaySlug: generateSlug(),
        votingEnabled: true,
        commentsEnabled: true,
        reactionsEnabled: true,
        reflectionsEnabled: true,
        publicCommentsEnabled: true,
        commentsGatedUntilPosted: false,
        forceAnonymousComments: false,
        settingsDefaults: {
          votingEnabled: true,
          commentsEnabled: true,
          reactionsEnabled: true,
          publicCommentsEnabled: true,
          commentsGatedUntilPosted: false,
          forceAnonymousComments: false,
        },
        autoStartRounds: true,
        timerStartsWithRound: true,
        maxVotesPerRound: 0,
        maxLikesPerRound: 0,
        setupStep: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as never);

      await Promise.all(
        DEFAULT_ROUNDS.map((round, index) =>
          setDoc(doc(roundsCol(ref.id)), {
            debateId: ref.id,
            index,
            title: round.title,
            durationSeconds: round.durationSeconds,
            breakAfterEnabled: round.breakAfterEnabled,
            breakDurationSeconds: round.breakDurationSeconds,
            status: "not_started",
          } as never)
        )
      );

      router.replace(`/admin/debates/${ref.id}/setup`);
    })();
  }, [user, router]);

  return <FullPageSpinner label="Creating your debate…" />;
}
