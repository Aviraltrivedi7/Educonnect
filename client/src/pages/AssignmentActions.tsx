import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export function StudentSubmissionAction({ assignmentId, currentBody }: { assignmentId: number; currentBody?: string | null }) {
  const [body, setBody] = useState(currentBody ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();
  const submit = trpc.assignments.submit.useMutation({
    onSuccess: () => { toast.success("Assignment submitted."); utils.assignments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Files must be 8 MB or smaller."); return; }
    setUploading(true);
    try {
      const base64 = (await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = reject; reader.readAsDataURL(file); }));
      const response = await fetch("/api/educonnect/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", base64, purpose: "submission" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Upload failed.");
      setAttachmentUrl(payload.url); toast.success("Attachment uploaded.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed."); } finally { setUploading(false); }
  };
  return <div className="mt-4 border-t border-[#edf0eb] pt-4"><Label htmlFor={`submission-${assignmentId}`} className="text-xs">Your response</Label><Textarea id={`submission-${assignmentId}`} value={body} onChange={event => setBody(event.target.value)} className="mt-2 min-h-20" placeholder="Write your response…" /><div className="mt-2 flex flex-wrap items-center gap-3"><label className="text-xs font-medium text-[#536159]">Attach file <input className="ml-2 text-xs" type="file" accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp" disabled={uploading} onChange={event => upload(event.target.files?.[0])} /></label>{attachmentUrl && <a className="text-xs font-semibold text-[#2f7452] underline" href={attachmentUrl} target="_blank" rel="noreferrer">View attachment</a>}</div><Button size="sm" className="mt-3 bg-[#18201f] text-white" disabled={body.trim().length < 1 || submit.isPending || uploading} onClick={() => submit.mutate({ assignmentId, body, attachmentUrl })}>{submit.isPending ? "Submitting…" : "Submit work"}</Button></div>;
}

export function TeacherGradingQueue() {
  const [courseId, setCourseId] = useState("");
  const [drafts, setDrafts] = useState<Record<number, { score: string; feedback: string }>>({});
  const utils = trpc.useUtils();
  const queue = trpc.assignments.submissions.useQuery({ courseId: Number(courseId) || 0 }, { enabled: Boolean(Number(courseId)) });
  const grade = trpc.assignments.grade.useMutation({
    onSuccess: () => { toast.success("Submission graded and learner notified."); utils.assignments.submissions.invalidate({ courseId: Number(courseId) }); utils.assignments.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const draft = (id: number) => drafts[id] ?? { score: "", feedback: "" };
  return <Card className="border-[#e0e6dd]"><CardHeader><CardTitle className="text-lg">Review submitted work</CardTitle><CardDescription>Enter the numeric course ID you manage to load submissions under server-enforced course permissions.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input inputMode="numeric" value={courseId} onChange={event => setCourseId(event.target.value)} placeholder="Course ID" /><Button variant="outline" onClick={() => queue.refetch()}>Load</Button></div>{queue.data?.map(row => <div key={row.submission.id} className="rounded-xl border border-[#edf0eb] p-4"><strong className="text-sm">{row.student.name || "Learner"} · {row.assignment.title}</strong><p className="mt-2 whitespace-pre-wrap text-sm text-[#66746b]">{row.submission.body || "No written response."}</p><div className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_auto]"><Input inputMode="numeric" value={draft(row.submission.id).score} onChange={event => setDrafts(current => ({ ...current, [row.submission.id]: { ...draft(row.submission.id), score: event.target.value } }))} placeholder="Score" /><Input value={draft(row.submission.id).feedback} onChange={event => setDrafts(current => ({ ...current, [row.submission.id]: { ...draft(row.submission.id), feedback: event.target.value } }))} placeholder="Feedback" /><Button size="sm" disabled={!draft(row.submission.id).score || grade.isPending} onClick={() => grade.mutate({ submissionId: row.submission.id, score: Number(draft(row.submission.id).score), feedback: draft(row.submission.id).feedback })}>Grade</Button></div></div>) || (Boolean(Number(courseId)) && !queue.isLoading ? <p className="text-sm text-[#718077]">No submissions are awaiting review in this course.</p> : null)}</CardContent></Card>;
}
