import Papa from "papaparse";

export interface ParsedStudent {
  firstName: string;
  lastName: string;
  universityStudentId: string;
  email: string;
}

export interface ParseResult {
  students: ParsedStudent[];
  errors: string[];
  warnings: string[];
}

/** Accepted header variants (PRD §8.5), matched case/space/underscore-insensitively. */
const HEADER_MAP: Record<string, keyof ParsedStudent> = {
  firstname: "firstName",
  lastname: "lastName",
  studentid: "universityStudentId",
  email: "email",
};

const REQUIRED_LABELS: Record<keyof ParsedStudent, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  universityStudentId: "Student ID",
  email: "Email",
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_-]/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseStudentsCsv(fileContents: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(fileContents, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  const warnings: string[] = [];

  if (result.errors.length > 0 && result.data.length === 0) {
    return {
      students: [],
      errors: ["We could not read that file as a CSV. Please check the format."],
      warnings,
    };
  }

  const headers = result.meta.fields ?? [];
  const headerToField = new Map<string, keyof ParsedStudent>();
  for (const header of headers) {
    const mapped = HEADER_MAP[normalizeHeader(header)];
    if (mapped) headerToField.set(header, mapped);
  }

  const foundFields = new Set(headerToField.values());
  for (const field of Object.keys(REQUIRED_LABELS) as (keyof ParsedStudent)[]) {
    if (!foundFields.has(field)) {
      errors.push(
        `Your CSV is missing the required column: ${REQUIRED_LABELS[field]}.`
      );
    }
  }
  if (errors.length > 0) return { students: [], errors, warnings };

  const students: ParsedStudent[] = [];
  const seenIds = new Map<string, number>();
  const seenEmails = new Map<string, number>();

  result.data.forEach((row, i) => {
    const rowNum = i + 2; // 1-based + header row
    const student: ParsedStudent = {
      firstName: "",
      lastName: "",
      universityStudentId: "",
      email: "",
    };
    for (const [header, field] of headerToField) {
      student[field] = (row[header] ?? "").trim();
    }

    const missing: string[] = [];
    if (!student.firstName) missing.push("first name");
    if (!student.lastName) missing.push("last name");
    if (!student.universityStudentId) missing.push("student ID");
    if (!student.email) missing.push("email");
    if (missing.length === 4) return; // fully empty row — skip silently
    if (missing.length > 0) {
      errors.push(`Row ${rowNum} is missing: ${missing.join(", ")}.`);
      return;
    }
    if (!EMAIL_RE.test(student.email)) {
      errors.push(`Row ${rowNum} has an invalid email: ${student.email}`);
      return;
    }

    const idKey = student.universityStudentId.toLowerCase();
    const emailKey = student.email.toLowerCase();
    if (seenIds.has(idKey)) {
      errors.push(
        `Duplicate student ID "${student.universityStudentId}" on rows ${seenIds.get(idKey)} and ${rowNum}.`
      );
      return;
    }
    if (seenEmails.has(emailKey)) {
      errors.push(
        `Duplicate email "${student.email}" on rows ${seenEmails.get(emailKey)} and ${rowNum}.`
      );
      return;
    }
    seenIds.set(idKey, rowNum);
    seenEmails.set(emailKey, rowNum);
    students.push(student);
  });

  if (students.length === 0 && errors.length === 0) {
    errors.push("We could not find any student rows in that CSV.");
  }

  return { students, errors, warnings };
}
