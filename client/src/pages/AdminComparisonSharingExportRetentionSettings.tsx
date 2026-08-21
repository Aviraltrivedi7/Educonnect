import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Clock3, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type RetentionDays = 30 | 60 | 90 | 180 | 365;

export default function AdminComparisonSharingExportRetentionSettings() {
  const utils = trpc.useUtils();
  const policy = trpc.workspace.comparisonSharingExportRetention.useQuery();
  const runs = trpc.workspace.comparisonSharingExportRetentionRuns.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState<RetentionDays>(90);
  useEffect(() => { if (policy.data) { setEnabled(policy.data.enabled); setRetentionDays(policy.data.retentionDays as RetentionDays); } }, [policy.data]);
  const save = trpc.workspace.updateComparisonSharingExportRetention.useMutation({
    onSuccess: result => { utils.workspace.comparisonSharingExportRetention.invalidate(); utils.workspace.comparisonSharingExportRetentionRuns.invalidate(); toast.success(result.enabled ? "Scheduled CSV retention is enabled." : "CSV retention is paused."); },
    onError: error => toast.error(error.message),
  });
  const latestRun = runs.data?.[0];
  return <Card className="border-[#eadfcd] bg-[linear-gradient(135deg,#fffaf5_0%,#ffffff_76%)]"><CardHeader className="border-b border-[#eee4d7]"><div className="flex items-start justify-between gap-3"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#fff0df] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#9b6540]"><Trash2 className="size-3" />Storage lifecycle</div><CardTitle className="text-lg">Sharing-audit CSV retention</CardTitle><CardDescription>Automatically remove completed comparison-sharing CSV report records and storage-key references after a school-managed retention window.</CardDescription></div><span className="grid size-10 place-items-center rounded-2xl bg-[#ffeddc] text-[#a36740]"><Clock3 className="size-5" /></span></div></CardHeader><CardContent className="space-y-4 pt-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efdfce] bg-white/80 p-3"><div><strong className="text-sm text-[#7d5437]">Scheduled cleanup</strong><p className="mt-1 text-xs leading-5 text-[#92745f]">Runs daily at 04:00 UTC. Activation is available after this release is published.</p></div><Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable scheduled sharing audit CSV retention" /></div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"><div><strong className="block text-xs text-[#76533b]">Keep completed reports for</strong><p className="mt-1 text-[11px] text-[#947660]">Expired records disappear from download history and their storage-key references are released.</p></div><Select value={String(retentionDays)} onValueChange={value => setRetentionDays(Number(value) as RetentionDays)}><SelectTrigger className="border-[#ead7c3] bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 days</SelectItem><SelectItem value="60">60 days</SelectItem><SelectItem value="90">90 days</SelectItem><SelectItem value="180">180 days</SelectItem><SelectItem value="365">1 year</SelectItem></SelectContent></Select></div>{latestRun ? <div className="flex items-start gap-2 rounded-xl bg-[#fff4e9] p-3 text-xs text-[#8b674f]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#a86e47]" /><span>Last cleanup: {new Date(latestRun.completedAt ?? latestRun.startedAt).toLocaleString()} · {latestRun.deletedCount} report{latestRun.deletedCount === 1 ? "" : "s"} released.</span></div> : <div className="rounded-xl bg-[#fff8f0] p-3 text-xs text-[#977a63]">No cleanup run yet. Once enabled in production, the first daily run will be recorded here.</div>}<div className="flex items-center justify-between gap-3"><Badge className={enabled ? "bg-[#e9f4ea] text-[#3f7651]" : "bg-[#fff0df] text-[#9b6540]"}>{enabled ? `Enabled · ${retentionDays} days` : "Paused"}</Badge><Button disabled={save.isPending} className="bg-[#965f3b] text-white hover:bg-[#7d4f31]" onClick={() => save.mutate({ enabled, retentionDays })}>{save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Clock3 className="mr-2 size-4" />}Save retention rules</Button></div></CardContent></Card>;
}
