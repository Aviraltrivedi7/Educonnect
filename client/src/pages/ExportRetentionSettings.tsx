import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArchiveX, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const retentionOptions = [
  { value: 0, label: "Keep archived exports indefinitely" },
  { value: 7, label: "Delete after 7 days" },
  { value: 30, label: "Delete after 30 days" },
  { value: 60, label: "Delete after 60 days" },
  { value: 90, label: "Delete after 90 days" },
  { value: 180, label: "Delete after 180 days" },
] as const;

export default function ExportRetentionSettings() {
  const utils = trpc.useUtils();
  const policy = trpc.workspace.studentTrendExportRetention.useQuery();
  const [days, setDays] = useState<number>(30);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { if (policy.data) { setDays(policy.data.retentionDays); setEnabled(policy.data.enabled); } }, [policy.data]);
  const update = trpc.workspace.updateStudentTrendExportRetention.useMutation({ onSuccess: () => { utils.workspace.studentTrendExportRetention.invalidate(); toast.success("Archive retention policy saved."); }, onError: error => toast.error(error.message) });
  const save = () => update.mutate({ enabled: enabled && days > 0, retentionDays: days as 0 | 7 | 30 | 60 | 90 | 180 });
  return <Card className="border-[#e0e6dd] bg-white"><CardHeader className="border-b border-[#edf0eb] pb-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f8eadf] text-[#b76839]"><ArchiveX className="size-4" /></span><div><CardTitle className="text-lg">Archived export retention</CardTitle><CardDescription>Choose how long archived reports stay recoverable before daily cleanup removes their history and file reference.</CardDescription></div></div></CardHeader><CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-end"><label className="flex-1"><span className="mb-1 block text-xs font-medium text-[#5c6c62]">Retention window</span><select value={days} onChange={event => { const next = Number(event.target.value); setDays(next); if (!next) setEnabled(false); }} className="h-9 w-full rounded-lg border border-[#dce6da] bg-white px-2 text-sm">{retentionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dce6da] bg-[#f8fbf7] px-3 text-xs text-[#4c6656]"><input type="checkbox" checked={enabled} disabled={!days} onChange={event => setEnabled(event.target.checked)} />Run daily cleanup</label><button type="button" disabled={update.isPending || policy.isLoading} onClick={save} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#e4f1e1] px-3 text-xs font-semibold text-[#2f6f4a] disabled:opacity-50"><Clock3 className="size-3.5" />{update.isPending ? "Saving…" : "Save retention"}</button></CardContent></Card>;
}
