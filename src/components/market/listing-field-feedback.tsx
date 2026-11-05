import type { ListingFieldIssue } from "@/lib/listing-quality";

/** Place concise feedback directly beneath the field that needs attention. */
export function ListingFieldFeedback({
  id,
  issue,
  visible = true,
}: {
  id: string;
  issue?: ListingFieldIssue;
  visible?: boolean;
}) {
  if (!issue || !visible) return null;
  return (
    <p
      id={id}
      role={issue.severity === "error" ? "alert" : "status"}
      className={`mt-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${
        issue.severity === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
      }`}
    >
      {issue.message}
    </p>
  );
}
