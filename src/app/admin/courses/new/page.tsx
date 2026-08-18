"use client";

import { useRouter } from "next/navigation";
import { CourseForm } from "@/components/admin/course-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCoursePage() {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Create course</CardTitle>
          <CardDescription>
            A course groups your classes and debates, e.g. INFS5704.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CourseForm onCreated={() => router.push("/admin/courses")} />
        </CardContent>
      </Card>
    </div>
  );
}
