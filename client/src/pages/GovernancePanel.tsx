import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { DatabaseBackup, FileDown, ShieldCheck, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import AiReviewQueue from "./AiReviewQueue";
import InviteManager from "./InviteManager";

const roleLabel = (role: string) => role === "user" ? "Student" : role === "teacher" ? "Teacher" : "Administrator";

export default function GovernancePanel() {
  const users = trpc.workspace.users.useQuery();
  const logs = trpc.workspace.auditLogs.useQuery();
  const backups = trpc.governance.backups.useQuery();
  const exports = trpc.governance.exports.useQuery();
  const utils = trpc.useUtils();
  const setRole = trpc.workspace.setRole.useMutation({
    onSuccess: () => { toast.success("Role updated."); utils.workspace.users.invalidate(); utils.workspace.auditLogs.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const requestBackup = trpc.governance.requestBackup.useMutation({
    onSuccess: result => { toast.success(`Backup #${result.id} is ready.`); utils.governance.backups.invalidate(); utils.workspace.auditLogs.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const requestExport = trpc.governance.requestExport.useMutation({
    onSuccess: result => { toast.success(`Report export #${result.id} is ready.`); utils.governance.exports.invalidate(); utils.workspace.auditLogs.invalidate(); },
    onError: error => toast.error(error.message),
  });
  return <div className="space-y-6">
    <div><Badge className="bg-[#e2f1df] text-[#2f7452] hover:bg-[#e2f1df]">Administrator</Badge><h1 className="mt-3 text-3xl font-semibold tracking-tight">Governance centre</h1><p className="mt-2 text-sm text-[#69766e]">Manage identities, generate controlled artifacts, and inspect the school’s recorded actions.</p></div>
    <div className="grid gap-4 lg:grid-cols-2"><Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e2f1df] text-[#2f7452]"><DatabaseBackup className="size-4" /></span><div><CardTitle>Backup artifacts</CardTitle><CardDescription>Each backup is a school-scoped JSON snapshot generated into managed storage.</CardDescription></div></div></CardHeader><CardContent><Button className="bg-[#18201f] text-white" disabled={requestBackup.isPending} onClick={() => requestBackup.mutate()}>{requestBackup.isPending ? "Generating…" : "Generate backup"}</Button><div className="mt-5 space-y-2">{backups.data?.length ? backups.data.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f4f7f2] px-3 py-2 text-sm"><span>Backup #{job.id}</span><div className="flex items-center gap-2"><Badge variant="secondary">{job.status}</Badge>{job.url && <a className="text-xs font-semibold text-[#2f7452] underline" href={job.url}>Download</a>}</div></div>) : <p className="text-sm text-[#718077]">No backups have been generated.</p>}</div></CardContent></Card><Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fde6e0] text-[#d95040]"><FileDown className="size-4" /></span><div><CardTitle>Report exports</CardTitle><CardDescription>Generate a school system report; completed artifacts are retained in managed storage.</CardDescription></div></div></CardHeader><CardContent><Button variant="outline" className="border-[#ccd9cb]" disabled={requestExport.isPending} onClick={() => requestExport.mutate({ type: "system", filterSnapshot: {} })}>{requestExport.isPending ? "Generating…" : "Generate system report"}</Button><div className="mt-5 space-y-2">{exports.data?.length ? exports.data.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fdf7f4] px-3 py-2 text-sm"><span className="capitalize">{item.type} export #{item.id}</span><div className="flex items-center gap-2"><Badge variant="secondary">{item.status}</Badge>{item.url && <a className="text-xs font-semibold text-[#d95040] underline" href={item.url}>Download</a>}</div></div>) : <p className="text-sm text-[#718077]">No reports have been generated.</p>}</div></CardContent></Card></div>
    <Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#edf1ec] text-[#32453b]"><UserRoundCog className="size-4" /></span><div><CardTitle>School identities</CardTitle><CardDescription>Role changes are server-authorized and become part of the audit trace.</CardDescription></div></div></CardHeader><CardContent className="space-y-3">{users.data?.length ? users.data.map(user => <div key={user.id} className="flex flex-col gap-3 border-b border-[#edf0eb] py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="block text-sm">{user.name || "Unnamed user"}</strong><span className="text-xs text-[#6d7971]">ID {user.id} · {user.email || user.openId}</span></div><div className="flex items-center gap-2"><Badge variant="secondary">{roleLabel(user.role)}</Badge><select aria-label={`Change role for ${user.name || user.id}`} className="h-8 rounded-md border border-[#ccd9cb] bg-white px-2 text-xs" value={user.role} onChange={event => setRole.mutate({ userId: user.id, role: event.target.value as "user" | "teacher" | "admin" })} disabled={setRole.isPending}><option value="user">Student</option><option value="teacher">Teacher</option><option value="admin">Administrator</option></select></div></div>) : <p className="text-sm text-[#718077]">No school members recorded yet.</p>}</CardContent></Card>
    <AiReviewQueue />
    <InviteManager />
    <Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#edf1ec] text-[#32453b]"><ShieldCheck className="size-4" /></span><div><CardTitle>Audit trace</CardTitle><CardDescription>The latest 50 governance and workflow events in the active school.</CardDescription></div></div></CardHeader><CardContent className="space-y-3">{logs.data?.length ? logs.data.map(log => <div className="flex flex-col justify-between gap-1 border-b border-[#edf0eb] py-3 text-sm md:flex-row" key={log.id}><div><strong>{log.action}</strong><span className="ml-2 text-[#718077]">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</span></div><span className="text-xs text-[#718077]">{new Date(log.createdAt).toLocaleString()}</span></div>) : <p className="text-sm text-[#718077]">Activity will appear here after school actions are performed.</p>}</CardContent></Card>
  </div>;
}
