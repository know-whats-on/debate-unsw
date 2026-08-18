import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./client";
import type {
  ClassDoc,
  Comment,
  Course,
  Debate,
  JoinCode,
  Prompt,
  Reaction,
  Reflection,
  Round,
  Student,
  Team,
  Vote,
  VoteEvent,
  AnalyticsSummary,
} from "@/types";

function col<T extends DocumentData>(path: string, ...segments: string[]) {
  return collection(db(), path, ...segments) as CollectionReference<T>;
}

export const coursesCol = () => col<Course>("courses");
export const classesCol = () => col<ClassDoc>("classes");
export const debatesCol = () => col<Debate>("debates");
export const roundsCol = (debateId: string) =>
  col<Round>("debates", debateId, "rounds");
export const studentsCol = (debateId: string) =>
  col<Student>("debates", debateId, "students");
export const joinCodesCol = (debateId: string) =>
  col<JoinCode>("debates", debateId, "joinCodes");
export const teamsCol = (debateId: string) =>
  col<Team>("debates", debateId, "teams");
export const promptsCol = (debateId: string) =>
  col<Prompt>("debates", debateId, "prompts");
export const commentsCol = (debateId: string) =>
  col<Comment>("debates", debateId, "comments");
export const votesCol = (debateId: string) =>
  col<Vote>("debates", debateId, "votes");
export const voteEventsCol = (debateId: string) =>
  col<VoteEvent>("debates", debateId, "voteEvents");
export const reactionsCol = (debateId: string) =>
  col<Reaction>("debates", debateId, "reactions");
export const reflectionsCol = (debateId: string) =>
  col<Reflection>("debates", debateId, "reflections");
export const analyticsSummariesCol = (debateId: string) =>
  col<AnalyticsSummary>("debates", debateId, "analyticsSummaries");

export const debateDoc = (debateId: string) =>
  doc(db(), "debates", debateId) as DocumentReference<Debate>;
