import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function JoinWorkspace({ onComplete, onLogout }: { onComplete: () => void; onLogout: () => void }) {
  const [code, setCode] = useState("");
  const accept = trpc.workspace.acceptInvite.useMutation({
    onSuccess: () => { toast.success("You have joined the school workspace."); onComplete(); },
    onError: error => toast.error(error.message),
  });
  return <div className="grid min-h-screen place-items-center bg-[#f7f5ef] p-5"><Card className="w-full max-w-lg border-[#dfe5db] bg-white"><CardHeader><span className="grid size-10 place-items-center rounded-xl bg-[#e2f1df] text-[#2f7452]"><KeyRound className="size-4" /></span><CardTitle className="mt-4">Join your school workspace</CardTitle><CardDescription>Ask a school administrator for a one-time membership code. Your role is assigned only by that invite.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="school-invite-code">Invite code</Label><Input id="school-invite-code" value={code} onChange={event => setCode(event.target.value)} placeholder="Paste invite code" /></div><Button className="w-full bg-[#18201f] text-white" disabled={code.trim().length < 12 || accept.isPending} onClick={() => accept.mutate({ code: code.trim() })}>{accept.isPending ? "Joining…" : "Join school"}</Button><Button className="w-full" variant="outline" onClick={onLogout}>Sign out</Button></CardContent></Card></div>;
}
