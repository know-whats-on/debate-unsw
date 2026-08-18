"use client";

import { use, useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { debateDoc, studentsCol } from "@/lib/firebase/firestore";
import type { Debate, Student } from "@/types";
import { JoinCodeManager } from "@/components/setup/step-codes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function CodesPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);

  useEffect(() => {
    const unsub1 = onSnapshot(debateDoc(debateId), (snap) =>
      setDebate(snap.exists() ? { ...snap.data(), id: snap.id } : null)
    );
    const unsub2 = onSnapshot(studentsCol(debateId), (snap) =>
      setStudents(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [debateId]);

  if (!students) return <FullPageSpinner />;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Join codes{debate ? ` — ${debate.title}` : ""}</CardTitle>
          <CardDescription>
            Generate, regenerate and download the private join codes for this debate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinCodeManager debateId={debateId} students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
