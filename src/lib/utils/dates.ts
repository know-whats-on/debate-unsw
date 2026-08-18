import type { TS } from "@/types";

export function timeAgo(ts: TS | undefined | null): string {
  if (!ts) return "";
  const seconds = Math.max(0, (Date.now() - ts.toMillis()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1m ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDateTime(ts: TS | undefined | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
