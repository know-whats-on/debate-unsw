"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { serverTimestamp, updateDoc } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import { debateDoc } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { StepShell, type StepProps } from "./shared";

function baseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant/50 bg-surface-container-low p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-on-surface">{label}</p>
        <p className="truncate text-sm text-on-surface-variant">{url}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function StepAccess({ debateId, debate, students, onBack }: StepProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const joinUrl = `${baseUrl()}/join/${debate.audienceJoinSlug}`;
  const displayUrl = `${baseUrl()}/display/${debateId}`;

  async function launch() {
    setBusy(true);
    await updateDoc(debateDoc(debateId), {
      status: "ready",
      updatedAt: serverTimestamp(),
    } as never);
    router.push(`/admin/debates/${debateId}/live`);
  }

  return (
    <StepShell
      title="Share & Invite"
      description="Give students the join link and code, put the display link on the projector, and you are ready to go live."
      onBack={onBack}
      hideNext
    >
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-3">
          <CopyRow label="Audience join link" url={joinUrl} />
          <CopyRow label="Public display link (projector)" url={displayUrl} />
          <div className="rounded-lg bg-primary/5 p-4 text-sm text-on-surface-variant">
            <p className="font-medium text-on-surface">How students join</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5">
              <li>Scan the QR code or open the join link</li>
              <li>Enter the personal join code from your CSV</li>
              <li>Vote, comment and react during the debate</li>
            </ol>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-outline-variant/50 bg-white p-4">
          <QRCodeSVG value={joinUrl} size={180} marginSize={1} />
          <p className="text-xs font-medium text-on-surface-variant">
            Scan to join
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-5 text-on-primary shadow-raised">
        <div>
          <p className="font-display text-lg font-bold">Ready to go live?</p>
          <p className="text-sm opacity-90">
            {students.length} students imported ·{" "}
            {students.filter((s) => s.joinCode).length} join codes generated
          </p>
        </div>
        <Button
          size="lg"
          onClick={launch}
          disabled={busy}
          className="bg-white text-primary hover:bg-primary-fixed"
        >
          {busy ? "Launching…" : "🚀 Launch Debate"}
        </Button>
      </div>
    </StepShell>
  );
}
