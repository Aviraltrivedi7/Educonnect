import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function InviteManager() {
  const [role, setRole] = useState<"user" | "teacher" | "admin">("user");
  const [latestCode, setLatestCode] = useState("");
  const invites = trpc.workspace.invites.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.workspace.createInvite.useMutation({
    onSuccess: invite => { setLatestCode(invite.code); utils.workspace.invites.invalidate(); toast.success("One-time school invite created."); },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.workspace.revokeInvite.useMutation({
    onSuccess: () => { toast.success("Unused invite revoked."); utils.workspace.invites.invalidate(); utils.workspace.auditLogs.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(latestCode); toast.success("Invite code copied."); } catch { toast.error("Copy the code manually."); }
  };
  return <Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e2f1df] text-[#2f7452]"><UserPlus className="size-4" /></span><div><CardTitle>School membership</CardTitle><CardDescription>Generate a one-time code for a learner, teacher, or additional administrator. Codes expire after seven days and can be revoked while unused.</CardDescription></div></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><select aria-label="Invite role" className="h-9 rounded-md border border-[#ccd9cb] bg-white px-2 text-sm" value={role} onChange={event => setRole(event.target.value as "user" | "teacher" | "admin")}><option value="user">Student</option><option value="teacher">Teacher</option><option value="admin">Administrator</option></select><Button className="bg-[#18201f] text-white" disabled={create.isPending} onClick={() => create.mutate({ role })}>{create.isPending ? "Creating…" : "Create invite"}</Button></div>{latestCode && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f4f7f2] p-3"><code className="break-all text-sm font-semibold">{latestCode}</code><Button size="sm" variant="outline" onClick={copyCode}><Copy className="mr-1 size-3" />Copy</Button></div>}<div className="space-y-2">{invites.data?.length ? invites.data.slice(0, 5).map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0eb] py-2 last:border-0"><div><code className="text-xs">{invite.code}</code><span className="ml-2 text-xs text-[#718077]">Expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div><div className="flex items-center gap-2"><Badge variant="secondary">{invite.acceptedAt ? "Used" : invite.role}</Badge>{!invite.acceptedAt && <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate({ inviteId: invite.id })}>Revoke</Button>}</div></div>) : <p className="text-sm text-[#718077]">No school invites have been created.</p>}</div></CardContent></Card>;
}
