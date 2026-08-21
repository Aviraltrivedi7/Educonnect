import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function NotificationComposer({ role }: { role: string }) {
  const members = trpc.workspace.members.useQuery(undefined, { enabled: role !== "user" });
  const sent = trpc.notifications.sent.useQuery(undefined, { enabled: role !== "user" });
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.notifications.create.useMutation({
    onSuccess: () => { setRecipientId(""); setTitle(""); setBody(""); utils.notifications.list.invalidate(); utils.notifications.sent.invalidate(); toast.success("Notification sent."); },
    onError: error => toast.error(error.message),
  });
  if (role === "user") return null;
  return <Card className="border-[#e0e6dd]"><CardHeader><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fde6e0] text-[#d95040]"><BellRing className="size-4" /></span><div><CardTitle className="text-lg">Send school notification</CardTitle><CardDescription>Recipients must already be members of the active school. Read state is shown for updates you created.</CardDescription></div></div></CardHeader><CardContent className="space-y-3"><select aria-label="Notification recipient" className="h-9 w-full rounded-md border border-[#ccd9cb] bg-white px-2 text-sm" value={recipientId} onChange={event => setRecipientId(event.target.value)}><option value="">Choose recipient</option>{members.data?.map(member => <option key={member.id} value={member.id}>{member.name || member.email || `User ${member.id}`} · {member.role}</option>)}</select><Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Notification title" /><Textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Update for the recipient" /><Button className="w-full bg-[#18201f] text-white" disabled={!Number(recipientId) || title.length < 2 || body.length < 2 || create.isPending} onClick={() => create.mutate({ recipientId: Number(recipientId), title, body })}>{create.isPending ? "Sending…" : "Send notification"}</Button><div className="border-t border-[#edf0eb] pt-4"><strong className="text-xs font-semibold uppercase tracking-[.12em] text-[#6a776e]">Sent updates</strong><div className="mt-2 space-y-2">{sent.data?.length ? sent.data.slice(0, 5).map(row => <div key={row.notification.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f4f7f2] px-3 py-2 text-xs"><div><strong>{row.notification.title}</strong><span className="ml-2 text-[#718077]">to {row.recipient.name || row.recipient.email || `User ${row.recipient.id}`}</span></div><Badge variant="secondary">{row.notification.readAt ? "Read" : "Unread"}</Badge></div>) : <p className="text-xs text-[#718077]">Updates you send will appear here with recipient read state.</p>}</div></div></CardContent></Card>;
}
