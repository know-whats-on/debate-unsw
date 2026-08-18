/**
 * Firestore document models (PRD §7).
 * `TS` is structural so the same types work with both the client SDK
 * (firebase/firestore) and the Admin SDK (firebase-admin/firestore).
 */
export interface TS {
  toDate(): Date;
  toMillis(): number;
}

export type DebateStatus = "draft" | "ready" | "live" | "paused" | "ended";
export type RoundStatus = "not_started" | "live" | "paused" | "completed";
export type Side = "for" | "against";
export type CommentSide = "for" | "against" | "neutral";
export type CommentStatus = "visible" | "hidden" | "flagged";
export type DebatePhase = "round" | "break";
export type PromptType = "private_reflection_prompt" | "public_guiding_question";
export type ReactionType =
  | "heart"
  | "clap"
  | "fire"
  | "mind_blown"
  | "agree"
  | "laugh"
  | "curious"
  | "hundred";

export const REACTION_EMOJI: Record<ReactionType, string> = {
  heart: "❤️",
  clap: "👏",
  fire: "🔥",
  mind_blown: "🤯",
  agree: "👍",
  laugh: "😂",
  curious: "🤔",
  hundred: "💯",
};

export interface UserDoc {
  id: string;
  email: string;
  displayName: string;
  role: "instructor";
  createdAt: TS;
  updatedAt: TS;
}

export interface Course {
  id: string;
  instructorId: string;
  courseCode: string;
  courseName?: string;
  term?: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface ClassDoc {
  id: string;
  courseId: string;
  instructorId: string;
  className: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  timezone: string;
  createdAt: TS;
  updatedAt: TS;
}

export interface Announcement {
  text: string;
  sentAt: TS;
}

export interface Debate {
  id: string;
  courseId: string;
  classId: string;
  instructorId: string;

  title: string;
  description?: string;

  forLabel: string;
  againstLabel: string;

  status: DebateStatus;

  currentRoundIndex: number;
  currentPhase: DebatePhase;
  currentRoundStartedAt?: TS;
  currentRoundPausedAt?: TS;
  totalPausedMs: number;

  audienceJoinSlug: string;
  displaySlug: string;

  /* ---------------------------------------------------------------
     Effective (live) participation settings. Firestore rules and every
     client read these fields, so they are always the *computed* result
     of `settingsDefaults` overlaid with the current round's overrides.
     Written only by src/lib/debate/settings.ts — never edited directly.
  ---------------------------------------------------------------- */
  votingEnabled: boolean;
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  reflectionsEnabled: boolean;
  publicCommentsEnabled: boolean;
  /** Students must post in a round before they can read that round's feed. */
  commentsGatedUntilPosted?: boolean;
  /** Every comment posts anonymously, regardless of student choice. */
  forceAnonymousComments?: boolean;

  /** The instructor's debate-wide baseline. Absent on legacy debates. */
  settingsDefaults?: RoundSettings;

  /** Auto-advance to the next phase when the timer expires (debate-wide). */
  autoStartRounds: boolean;
  /** When false, a new round's clock is armed at full duration but frozen. */
  timerStartsWithRound?: boolean;

  /** Per-round participation limits. Absent or 0 means unlimited. */
  maxVotesPerRound?: number;
  maxLikesPerRound?: number;

  announcement?: Announcement;

  setupStep?: number;

  createdAt: TS;
  updatedAt: TS;
  endedAt?: TS;
}

/**
 * Settings that can be set debate-wide and overridden per round.
 * Deliberately excludes `reflectionsEnabled` (prompts unlock retroactively,
 * so a per-round "off" would block earlier rounds' submissions) and
 * `autoStartRounds` (it is read during round N to decide whether to leave
 * round N, so a per-round value reads backwards to instructors).
 */
export interface RoundSettings {
  votingEnabled: boolean;
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  publicCommentsEnabled: boolean;
  commentsGatedUntilPosted: boolean;
  forceAnonymousComments: boolean;
}

export interface Round {
  id: string;
  debateId: string;
  index: number;
  title: string;
  durationSeconds: number;
  breakAfterEnabled: boolean;
  breakDurationSeconds?: number;
  /** Overrides for this round; a missing key inherits the debate default. */
  settings?: Partial<RoundSettings>;
  status: RoundStatus;
  startedAt?: TS;
  endedAt?: TS;
}

export interface Student {
  id: string;
  debateId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  universityStudentId: string;
  email: string;
  joinCode: string;
  joined: boolean;
  joinedAt?: TS;
  assignedTeamId?: string;
  assignedSide?: Side | "audience";
  createdAt: TS;
  updatedAt: TS;
}

export interface JoinCode {
  joinCode: string;
  debateId: string;
  studentDocId: string;
  used: boolean;
  joinedAt?: TS;
  createdAt: TS;
}

export interface Team {
  id: string;
  debateId: string;
  name: string;
  side: Side;
  memberStudentIds: string[];
  createdAt: TS;
  updatedAt: TS;
}

export interface Prompt {
  id: string;
  debateId: string;
  type: PromptType;
  text: string;
  roundIndex?: number;
  activeDuringRound?: boolean;
  order: number;
  createdAt: TS;
}

export interface Comment {
  id: string;
  debateId: string;
  roundId?: string;
  roundIndex: number;
  studentDocId: string;
  studentName: string;
  universityStudentId: string;
  email: string;
  side: CommentSide;
  text: string;
  /**
   * Posted anonymously. `studentName` is still stored (the instructor must
   * always be able to attribute it) — this only hides the author from other
   * students in the app.
   */
  anonymous?: boolean;
  /** Set when this comment replies to another comment. */
  replyToCommentId?: string;
  replyToName?: string;
  replyToExcerpt?: string;
  likeCount: number;
  likedByStudentDocIds: string[];
  status: CommentStatus;
  createdAt: TS;
  updatedAt: TS;
}

export interface Vote {
  debateId: string;
  studentDocId: string;
  studentName: string;
  universityStudentId: string;
  side: Side;
  /** The round of the most recent cast — resets `votesThisRound` on change. */
  roundIndex: number;
  /** Casts used in `roundIndex`, for the per-round vote allowance. */
  votesThisRound?: number;
  createdAt: TS;
  updatedAt: TS;
}

export interface VoteEvent {
  debateId: string;
  studentDocId: string;
  side: Side;
  roundIndex: number;
  createdAt: TS;
}

export interface Reaction {
  id: string;
  debateId: string;
  studentDocId: string;
  studentName: string;
  type: ReactionType;
  roundIndex: number;
  createdAt: TS;
}

export interface Reflection {
  debateId: string;
  studentDocId: string;
  studentName: string;
  universityStudentId: string;
  email: string;
  text: string;
  promptText: string;
  /** Set for per-round prompt responses (doc id: `{studentDocId}__{promptId}`). */
  promptId?: string;
  roundIndex?: number;
  submittedAt: TS;
  updatedAt: TS;
}

export interface AnalyticsSummary {
  debateId: string;
  model: "claude";
  summary: string;
  keyThemes: string[];
  highEngagementMoments: {
    roundIndex: number;
    title: string;
    description: string;
  }[];
  suggestedInstructorNotes: string[];
  /** Actionable changes for the instructor's next session (not data caveats). */
  recommendations: string[];
  limitations: string[];
  createdAt: TS;
}

/** Student session stored in localStorage after a successful join. */
export interface StudentSession {
  debateId: string;
  studentDocId: string;
  joinCode: string;
  fullName: string;
}

export const ANONYMOUS_NAME = "Anonymous";

/**
 * How a comment's author is shown to students and on the public display.
 * The instructor's views deliberately do NOT use this — they always show
 * the real name so participation can still be attributed.
 */
export function commentAuthorName(comment: Pick<Comment, "studentName" | "anonymous">): string {
  return comment.anonymous ? ANONYMOUS_NAME : publicName(comment.studentName);
}

/** Public-safe display name: "Emma L." */
export function publicName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
