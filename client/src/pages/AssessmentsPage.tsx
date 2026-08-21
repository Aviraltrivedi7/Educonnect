import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AssessmentOutcomePanels from "./AssessmentOutcomePanels";

export default function AssessmentsPage({ role }: { role: string }) {
  const list = trpc.assessments.list.useQuery();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [examId, setExamId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const detail = trpc.assessments.detail.useQuery({ examId: selectedId ?? 0 }, { enabled: Boolean(selectedId) });
  const create = trpc.assessments.create.useMutation({ onSuccess: id => { toast.success(`Exam #${id} published.`); setTitle(""); utils.assessments.list.invalidate(); }, onError: error => toast.error(error.message) });
  const addQuestion = trpc.assessments.addQuestion.useMutation({ onSuccess: () => { toast.success("Question added."); setPrompt(""); setOptionA(""); setOptionB(""); }, onError: error => toast.error(error.message) });
  const submit = trpc.assessments.submit.useMutation({ onSuccess: result => { toast.success(`Attempt submitted: ${result.score}/${result.maxScore}`); utils.assessments.list.invalidate(); utils.assessments.results.invalidate(); }, onError: error => toast.error(error.message) });

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-semibold tracking-tight">Assessments</h1><p className="mt-2 text-sm text-[#69766e]">Author, complete, score, and review durable school assessment outcomes.</p></div>
    <AssessmentOutcomePanels role={role} />
    {role !== "user" && <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-[#e0e6dd]"><CardHeader><CardTitle className="text-lg">Publish assessment</CardTitle><CardDescription>Enter a managed course ID and an assessment title.</CardDescription></CardHeader><CardContent className="space-y-3"><Input inputMode="numeric" value={courseId} onChange={event => setCourseId(event.target.value)} placeholder="Course ID" /><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Assessment title" /><Button className="w-full bg-[#18201f] text-white" disabled={!Number(courseId) || title.length < 2 || create.isPending} onClick={() => create.mutate({ courseId: Number(courseId), title, durationMinutes: 30, publish: true })}>Publish assessment</Button></CardContent></Card>
      <Card className="border-[#e0e6dd]"><CardHeader><CardTitle className="text-lg">Add multiple-choice question</CardTitle><CardDescription>The first option is stored as the answer key for this streamlined authoring flow.</CardDescription></CardHeader><CardContent className="space-y-3"><Input inputMode="numeric" value={examId} onChange={event => setExamId(event.target.value)} placeholder="Assessment ID" /><Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Question" /><Input value={optionA} onChange={event => setOptionA(event.target.value)} placeholder="Option A (correct)" /><Input value={optionB} onChange={event => setOptionB(event.target.value)} placeholder="Option B" /><Button className="w-full bg-[#18201f] text-white" disabled={!Number(examId) || prompt.length < 2 || !optionA || !optionB || addQuestion.isPending} onClick={() => addQuestion.mutate({ examId: Number(examId), prompt, options: [optionA, optionB], answerKey: optionA, points: 1, position: 0 })}>Add question</Button></CardContent></Card>
    </div>}
    <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]"><div className="space-y-3">{list.isLoading ? <div className="flex items-center gap-2 text-sm text-[#718077]"><Loader2 className="size-4 animate-spin" />Loading assessments…</div> : list.data?.length ? list.data.map(row => <button key={row.exam.id} onClick={() => { setSelectedId(row.exam.id); setAnswers({}); }} className={`w-full rounded-xl border p-4 text-left ${selectedId === row.exam.id ? "border-[#18201f] bg-[#eef5ea]" : "border-[#e0e6dd] bg-white"}`}><div className="flex items-center justify-between"><Badge variant="secondary">{row.course.code}</Badge><Badge className={row.exam.status === "published" ? "bg-[#e2f1df] text-[#2f7452]" : "bg-[#f4ebda] text-[#977029]"}>{row.exam.status}</Badge></div><strong className="mt-3 block text-sm">{row.exam.title}</strong><span className="mt-1 block text-xs text-[#718077]">{row.exam.durationMinutes} minutes</span></button>) : <Card className="border-dashed border-[#ccd9cb]"><CardContent className="p-6 text-center"><ClipboardCheck className="mx-auto size-5 text-[#82a589]" /><strong className="mt-3 block text-sm">No assessments yet</strong></CardContent></Card>}</div>
      <Card className="border-[#e0e6dd]"><CardHeader><CardTitle>{selectedId ? "Assessment" : "Choose an assessment"}</CardTitle><CardDescription>{selectedId ? "Your answers remain in this browser until you submit the attempt." : "Select a published assessment from the list."}</CardDescription></CardHeader><CardContent>{selectedId && detail.data ? <div className="space-y-5">{detail.data.questions.length ? detail.data.questions.map(question => <fieldset key={question.id} className="rounded-xl border border-[#edf0eb] p-4"><legend className="px-1 text-sm font-semibold">{question.prompt} <span className="text-xs font-normal text-[#718077]">({question.points} point{question.points === 1 ? "" : "s"})</span></legend><div className="mt-3 space-y-2">{question.options?.map(option => <label key={option} className="flex items-center gap-2 text-sm"><input type="radio" name={`question-${question.id}`} checked={answers[String(question.id)] === option} onChange={() => setAnswers(current => ({ ...current, [String(question.id)]: option }))} />{option}</label>)}</div></fieldset>) : <p className="text-sm text-[#718077]">This assessment has no questions yet.</p>}{role === "user" && detail.data.questions.length > 0 && <Button className="bg-[#18201f] text-white" disabled={Object.keys(answers).length !== detail.data.questions.length || submit.isPending} onClick={() => submit.mutate({ examId: selectedId, answers })}>{submit.isPending ? "Submitting…" : "Submit attempt"}</Button>}</div> : selectedId ? <div className="flex items-center gap-2 text-sm text-[#718077]"><Loader2 className="size-4 animate-spin" />Loading questions…</div> : <div className="grid min-h-52 place-items-center text-center"><div><CheckCircle2 className="mx-auto size-6 text-[#82a589]" /><p className="mt-3 text-sm text-[#718077]">Assessment details are protected by enrollment and role checks.</p></div></div>}</CardContent></Card>
    </div>
  </div>;
}
