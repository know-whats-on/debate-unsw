import type { StudentSession } from "@/types";

const KEY = "digitaljury.studentSession";

export function saveStudentSession(session: StudentSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function loadStudentSession(debateId?: string): StudentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StudentSession;
    if (debateId && session.debateId !== debateId) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearStudentSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
