import { Badge, LiveBadge } from "@/components/ui/badge";
import type { DebateStatus } from "@/types";

const STATUS_LABEL: Record<DebateStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  live: "Live",
  paused: "Paused",
  ended: "Ended",
};

export function DebateStatusBadge({ status }: { status: DebateStatus }) {
  if (status === "live") return <LiveBadge />;
  const tone =
    status === "ready" ? "primary" : status === "paused" ? "warning" : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}
