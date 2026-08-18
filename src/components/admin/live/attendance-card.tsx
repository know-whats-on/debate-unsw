"use client";

import { useState } from "react";
import type { Student } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/dates";

export function AttendanceCard({ students }: { students: Student[] }) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const joined = students.filter((s) => s.joined);
  const pct = students.length === 0 ? 0 : (joined.length / students.length) * 100;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Attendance</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setRosterOpen(true)}>
          View roster
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold text-primary">
            {joined.length}
          </span>
          <span className="text-on-surface-variant">
            of {students.length} joined ({Math.round(pct)}%)
          </span>
        </div>
        <Progress value={pct} />
        <p className="text-xs text-on-surface-variant">
          {students.length - joined.length} not joined yet
        </p>
      </CardContent>

      <Dialog
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        title="Class roster"
        description={`${joined.length}/${students.length} students joined`}
        className="max-w-3xl"
      >
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-outline-variant/50">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="hidden px-3 py-2 md:table-cell">Email</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
                <th className="hidden px-3 py-2 sm:table-cell">Joined at</th>
              </tr>
            </thead>
            <tbody>
              {[...students]
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
                .map((s) => (
                  <tr key={s.id} className="border-t border-outline-variant/30">
                    <td className="px-3 py-2 font-medium text-on-surface">{s.fullName}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{s.universityStudentId}</td>
                    <td className="hidden px-3 py-2 text-on-surface-variant md:table-cell">{s.email}</td>
                    <td className="px-3 py-2 font-mono text-xs">{s.joinCode || "—"}</td>
                    <td className="px-3 py-2">
                      {s.joined ? (
                        <Badge tone="success">Joined</Badge>
                      ) : (
                        <Badge tone="neutral">Not joined</Badge>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-on-surface-variant sm:table-cell">
                      {formatDateTime(s.joinedAt)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </Card>
  );
}
