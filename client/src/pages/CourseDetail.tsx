import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function CourseDetail({ role, courseId, onBack }: { role: string; courseId: number; onBack: () => void }) {
  const detail = trpc.courses.detail.useQuery({ courseId });
  const utils = trpc.useUtils();
  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonModuleId, setLessonModuleId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [studentId, setStudentId] = useState("");
  const [resumeSeconds, setResumeSeconds] = useState<Record<number, string>>({});
  const [resourceUploading, setResourceUploading] = useState(false);
  const createModule = trpc.courses.createModule.useMutation({
    onSuccess: () => { toast.success("Module added."); setModuleTitle(""); utils.courses.detail.invalidate({ courseId }); },
    onError: error => toast.error(error.message),
  });
  const createLesson = trpc.courses.createLesson.useMutation({
    onSuccess: () => { toast.success("Published lesson added."); setLessonTitle(""); setLessonContent(""); utils.courses.detail.invalidate({ courseId }); },
    onError: error => toast.error(error.message),
  });
  const progress = trpc.courses.progress.useMutation({
    onSuccess: () => { toast.success("Lesson progress saved."); utils.courses.detail.invalidate({ courseId }); },
    onError: error => toast.error(error.message),
  });
  const publishCourse = trpc.courses.publish.useMutation({
    onSuccess: () => { toast.success("Course published."); utils.courses.detail.invalidate({ courseId }); utils.courses.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const enroll = trpc.courses.enroll.useMutation({
    onSuccess: () => { toast.success("Learner enrolled."); setStudentId(""); },
    onError: error => toast.error(error.message),
  });
  const uploadResource = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Resources must be 8 MB or smaller."); return; }
    setResourceUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await fetch("/api/educonnect/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", base64, purpose: "lesson" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Resource upload failed.");
      setResourceUrl(payload.url); toast.success("Lesson resource uploaded.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Resource upload failed."); } finally { setResourceUploading(false); }
  };

  if (detail.isLoading) return <div className="grid min-h-64 place-items-center text-sm text-[#62706a]"><Loader2 className="mr-2 size-4 animate-spin" />Loading course…</div>;
  if (detail.error || !detail.data) return <Card><CardContent className="p-6"><Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 size-4" />Back to courses</Button><p className="mt-4 text-sm text-destructive">This course could not be loaded.</p></CardContent></Card>;
  const completedIds = new Set(detail.data.progress.filter(item => item.completed).map(item => item.lessonId));
  const progressByLesson = new Map(detail.data.progress.map(item => [item.lessonId, item]));
  const modules = detail.data.modules;
  return <div className="space-y-6">
    <button className="flex items-center gap-2 text-sm font-semibold text-[#536159]" onClick={onBack}><ArrowLeft className="size-4" />All courses</button>
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><Badge variant="secondary">{detail.data.course.code}</Badge><h1 className="mt-3 text-3xl font-semibold tracking-tight">{detail.data.course.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#69766e]">{detail.data.course.description || "No description has been added."}</p></div>{role !== "user" && detail.data.course.status !== "published" && <Button className="bg-[#18201f] text-white" disabled={publishCourse.isPending} onClick={() => publishCourse.mutate({ courseId })}>Publish course</Button>}</div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><div className="space-y-4">{modules.length ? modules.map(module => <Card key={module.id} className="border-[#e0e6dd]"><CardHeader><CardTitle className="text-lg">{module.title}</CardTitle><CardDescription>Module ID {module.id} · {module.lessons.length} lesson{module.lessons.length === 1 ? "" : "s"}</CardDescription></CardHeader><CardContent className="space-y-2">{module.lessons.length ? module.lessons.map(lesson => <div key={lesson.id} className="flex flex-col justify-between gap-3 rounded-xl border border-[#edf0eb] p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><PlayCircle className="size-4 text-[#d95040]" /><strong className="text-sm">{lesson.title}</strong>{completedIds.has(lesson.id) && <Badge className="bg-[#e2f1df] text-[#2f7452]"><CheckCircle2 className="mr-1 size-3" />Complete</Badge>}</div><p className="mt-2 text-xs leading-5 text-[#6b786f]">{lesson.content || "No lesson text has been added."} · {lesson.durationMinutes} min</p>{lesson.resourceUrl && <a className="mt-1 inline-block text-xs font-semibold text-[#2f7452] underline" href={lesson.resourceUrl} target="_blank" rel="noreferrer">Open lesson resource</a>}</div>{role === "user" && <div className="flex flex-wrap items-center gap-2"><Input className="h-8 w-28" inputMode="numeric" value={resumeSeconds[lesson.id] ?? String(progressByLesson.get(lesson.id)?.resumeSecond ?? 0)} onChange={event => setResumeSeconds(current => ({ ...current, [lesson.id]: event.target.value }))} aria-label={`Resume seconds for ${lesson.title}`} /><Button size="sm" variant="outline" disabled={progress.isPending} onClick={() => progress.mutate({ lessonId: lesson.id, resumeSecond: Number(resumeSeconds[lesson.id] ?? progressByLesson.get(lesson.id)?.resumeSecond ?? 0), completed: false })}>Save position</Button><Button size="sm" variant="outline" disabled={progress.isPending} onClick={() => progress.mutate({ lessonId: lesson.id, resumeSecond: Number(resumeSeconds[lesson.id] ?? 0), completed: true })}>{completedIds.has(lesson.id) ? "Completed" : "Mark complete"}</Button></div>}</div>) : <p className="text-sm text-[#718077]">No lessons in this module.</p>}</CardContent></Card>) : <Card className="border-dashed border-[#ccd9cb] bg-[#fbfcf9]"><CardContent className="p-7 text-center"><BookOpen className="mx-auto size-6 text-[#82a589]" /><strong className="mt-3 block">No modules yet</strong><p className="mt-2 text-sm text-[#718077]">A teacher can create the first module from the authoring panel.</p></CardContent></Card>}</div>
      {role !== "user" && <Card className="border-[#e0e6dd]"><CardHeader><CardTitle>Author learning content</CardTitle><CardDescription>These writes are authorized server-side and publishing is explicit.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label>Enroll learner</Label><div className="flex gap-2"><Input value={studentId} onChange={event => setStudentId(event.target.value)} inputMode="numeric" placeholder="Learner user ID" /><Button disabled={!Number(studentId) || enroll.isPending} onClick={() => enroll.mutate({ courseId, studentId: Number(studentId) })}>Enroll</Button></div></div><div className="space-y-2 border-t border-[#edf0eb] pt-5"><Label>New module</Label><div className="flex gap-2"><Input value={moduleTitle} onChange={event => setModuleTitle(event.target.value)} placeholder="Module title" /><Button disabled={moduleTitle.length < 2 || createModule.isPending} onClick={() => createModule.mutate({ courseId, title: moduleTitle, position: modules.length })}>Add</Button></div></div><div className="space-y-3 border-t border-[#edf0eb] pt-5"><Label>Published lesson</Label><Input value={lessonModuleId} onChange={event => setLessonModuleId(event.target.value)} inputMode="numeric" placeholder="Module ID" /><Input value={lessonTitle} onChange={event => setLessonTitle(event.target.value)} placeholder="Lesson title" /><Textarea value={lessonContent} onChange={event => setLessonContent(event.target.value)} placeholder="Lesson content" /><Input value={resourceUrl} onChange={event => setResourceUrl(event.target.value)} placeholder="Resource URL (optional)" /><label className="text-xs font-medium text-[#536159]">Or upload resource <input className="ml-2 text-xs" type="file" accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp" disabled={resourceUploading} onChange={event => uploadResource(event.target.files?.[0])} /></label>{resourceUrl && <a className="text-xs font-semibold text-[#2f7452] underline" href={resourceUrl} target="_blank" rel="noreferrer">Resource ready</a>}<Button className="w-full bg-[#18201f] text-white" disabled={!Number(lessonModuleId) || lessonTitle.length < 2 || createLesson.isPending || resourceUploading} onClick={() => createLesson.mutate({ moduleId: Number(lessonModuleId), title: lessonTitle, content: lessonContent || undefined, resourceUrl: resourceUrl || undefined, durationMinutes: 15, position: 0, publish: true })}>Publish lesson</Button></div></CardContent></Card>}
    </div>
  </div>;
}
