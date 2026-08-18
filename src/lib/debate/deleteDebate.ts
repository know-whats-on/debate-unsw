import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { debateDoc } from "@/lib/firebase/firestore";

const SUBCOLLECTIONS = [
  "rounds",
  "students",
  "joinCodes",
  "teams",
  "prompts",
  "comments",
  "votes",
  "voteEvents",
  "reactions",
  "reflections",
  "analyticsSummaries",
];

/** Deletes a debate and all of its subcollections (instructor only). */
export async function deleteDebateDeep(debateId: string) {
  for (const sub of SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db(), "debates", debateId, sub));
    for (let start = 0; start < snap.docs.length; start += 400) {
      const batch = writeBatch(db());
      snap.docs.slice(start, start + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(debateDoc(debateId));
}

/** Deletes a course document (debates referencing it keep working). */
export async function deleteCourse(courseId: string) {
  await deleteDoc(doc(db(), "courses", courseId));
}

export async function deleteClass(classId: string) {
  await deleteDoc(doc(db(), "classes", classId));
}
