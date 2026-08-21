import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Bot, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function AiReviewQueue() {
  const pending = trpc.ai.pending.useQuery();
  const utils = trpc.useUtils();
  const review = trpc.ai.review.useMutation({
    onSuccess: result => { toast.success(`AI draft ${result.reviewStatus}.`); utils.ai.pending.invalidate(); utils.workspace.auditLogs.invalidate(); },
    onError: error => toast.error(error.message),
  });
  return <Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fde6e0] text-[#d95040]"><Bot className="size-4" /></span><div><CardTitle>AI review queue</CardTitle><CardDescription>Low-risk study-plan drafts remain unavailable to learners until an administrator accepts or rejects them.</CardDescription></div></div></CardHeader><CardContent className="space-y-4">{pending.data?.length ? pending.data.map(item => <div key={item.run.id} className="rounded-xl border border-[#edf0eb] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.requester.name || "Learner"}</strong><Badge variant="secondary">{item.run.feature}</Badge><span className="text-xs text-[#718077]">{new Date(item.run.createdAt).toLocaleString()}</span></div><p className="mt-2 text-sm leading-6 text-[#58665e]">Request: {item.run.inputSummary}</p></div><div className="flex gap-2"><Button size="sm" className="bg-[#18201f] text-white" disabled={review.isPending} onClick={() => review.mutate({ runId: item.run.id, decision: "accepted" })}><Check className="mr-1 size-4" />Accept</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ runId: item.run.id, decision: "rejected" })}><X className="mr-1 size-4" />Reject</Button></div></div><details className="mt-3 rounded-lg bg-[#f4f7f2] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#536159]">Review generated draft</summary><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#59685f]">{item.run.outputSummary || "No generated output stored."}</pre></details></div>) : <p className="text-sm text-[#718077]">No AI drafts are awaiting review.</p>}</CardContent></Card>;
}
