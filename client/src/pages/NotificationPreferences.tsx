import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { BellRing, Check, ChevronDown, Clock3, Globe2, Mail, Settings2, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Preferences = {
  staffUpdatesEnabled: boolean;
  gradeUpdatesEnabled: boolean;
  assessmentUpdatesEnabled: boolean;
  learningRemindersEnabled: boolean;
  emailDeliveryEnabled: boolean;
  pushDeliveryEnabled: boolean;
  reminderEnabled: boolean;
  reminderTimeUtc: string;
  reminderTimezone: string;
  reminderWeekdaysOnly: boolean;
};

const defaults: Preferences = { staffUpdatesEnabled: true, gradeUpdatesEnabled: true, assessmentUpdatesEnabled: true, learningRemindersEnabled: true, emailDeliveryEnabled: false, pushDeliveryEnabled: false, reminderEnabled: false, reminderTimeUtc: "09:00", reminderTimezone: "UTC", reminderWeekdaysOnly: true };
const fallbackTimezones = ["UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Australia/Sydney"];

function getSupportedTimezones() {
  const international = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  return international.supportedValuesOf?.("timeZone") ?? fallbackTimezones;
}

function TimezonePicker({ value, deviceTimezone, onChange }: { value: string; deviceTimezone: string; onChange: (timezone: string) => void }) {
  const [open, setOpen] = useState(false);
  const timezones = useMemo(() => Array.from(new Set([deviceTimezone, value, ...getSupportedTimezones()])), [deviceTimezone, value]);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between border-[#d7e3d4] bg-white px-3 text-left text-sm font-normal text-[#1f2a23] hover:bg-[#f7faf5]"><span className="truncate">{value}{value === deviceTimezone ? " (your device)" : ""}</span><ChevronDown className="ml-2 size-4 shrink-0 text-[#68806e]" /></Button></PopoverTrigger><PopoverContent className="w-[min(22rem,calc(100vw-3rem))] p-0" align="start"><Command><CommandInput placeholder="Search city or timezone…" aria-label="Search timezone" /><CommandList><CommandEmpty>No matching timezone found.</CommandEmpty>{timezones.map(timezone => <CommandItem key={timezone} value={`${timezone} ${timezone.replaceAll("_", " ")}`} onSelect={() => { onChange(timezone); setOpen(false); }}><Check className={`size-4 ${timezone === value ? "opacity-100" : "opacity-0"}`} /><span className="truncate">{timezone}</span>{timezone === deviceTimezone ? <span className="ml-auto text-[10px] text-[#64816d]">device</span> : null}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>;
}

export default function NotificationPreferences() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Preferences>(defaults);
  const preferences = trpc.notifications.preferences.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!preferences.data) return;
    setValues({ staffUpdatesEnabled: preferences.data.staffUpdatesEnabled, gradeUpdatesEnabled: preferences.data.gradeUpdatesEnabled, assessmentUpdatesEnabled: preferences.data.assessmentUpdatesEnabled, learningRemindersEnabled: preferences.data.learningRemindersEnabled, emailDeliveryEnabled: preferences.data.emailDeliveryEnabled, pushDeliveryEnabled: preferences.data.pushDeliveryEnabled, reminderEnabled: preferences.data.reminderEnabled, reminderTimeUtc: preferences.data.reminderTimeUtc, reminderTimezone: preferences.data.reminderTimezone, reminderWeekdaysOnly: preferences.data.reminderWeekdaysOnly });
  }, [preferences.data]);
  const save = trpc.notifications.updatePreferences.useMutation({ onSuccess: () => { utils.notifications.preferences.invalidate(); utils.notifications.inbox.invalidate(); toast.success(values.reminderEnabled && values.learningRemindersEnabled ? "Preferences saved and reminder schedule updated." : "Notification preferences saved."); setOpen(false); }, onError: error => toast.error(error.message) });
  const controls: Array<{ key: keyof Pick<Preferences, "staffUpdatesEnabled" | "gradeUpdatesEnabled" | "assessmentUpdatesEnabled" | "learningRemindersEnabled">; title: string; description: string }> = [
    { key: "staffUpdatesEnabled", title: "Staff updates", description: "Teacher and administrator announcements." },
    { key: "gradeUpdatesEnabled", title: "Grade updates", description: "New assignment grades and feedback." },
    { key: "assessmentUpdatesEnabled", title: "Assessment feedback", description: "Reviewed quiz and exam feedback." },
    { key: "learningRemindersEnabled", title: "Learning reminders", description: "Allow scheduled study check-ins in your notification inbox." },
  ];
  const setValue = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setValues(current => ({ ...current, [key]: value }));
  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-[#4d7560] hover:bg-[#f1f8ef]"><Settings2 className="size-3.5" />Preferences</Button></DialogTrigger>
    <DialogContent className="max-h-[min(44rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Notification & reminder settings</DialogTitle><DialogDescription>Control your in-app alerts, save future delivery preferences, and schedule a personal learning check-in.</DialogDescription></DialogHeader>
      <section className="space-y-1 py-2">{controls.map(control => <div key={control.key} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-[#f7faf5]"><div><strong className="block text-sm">{control.title}</strong><p className="mt-1 text-xs leading-5 text-[#718077]">{control.description}</p></div><Switch checked={values[control.key]} onCheckedChange={checked => setValue(control.key, checked)} aria-label={control.title} /></div>)}</section>
      <section className="rounded-2xl border border-[#dfe9dd] bg-[#f8fbf7] p-4"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e4f1e1] text-[#357453]"><Mail className="size-4" /></span><div><strong className="block text-sm">Delivery preferences</strong><p className="mt-1 text-xs leading-5 text-[#718077]">These choices are saved for a future email or browser-push connection. Current reminders always appear in Educonnect.</p></div></div><div className="mt-3 space-y-2"><label className="flex cursor-pointer items-center justify-between rounded-xl bg-white px-3 py-2.5"><span className="flex items-center gap-2 text-sm"><Mail className="size-3.5 text-[#64816d]" />Email delivery</span><Switch checked={values.emailDeliveryEnabled} onCheckedChange={checked => setValue("emailDeliveryEnabled", checked)} aria-label="Save email delivery preference" /></label><label className="flex cursor-pointer items-center justify-between rounded-xl bg-white px-3 py-2.5"><span className="flex items-center gap-2 text-sm"><Smartphone className="size-3.5 text-[#64816d]" />Browser push delivery</span><Switch checked={values.pushDeliveryEnabled} onCheckedChange={checked => setValue("pushDeliveryEnabled", checked)} aria-label="Save browser push delivery preference" /></label></div></section>
      <section className={`rounded-2xl border p-4 transition-colors ${values.learningRemindersEnabled ? "border-[#e0e8dd] bg-white" : "border-[#edf0eb] bg-[#fafbfa] opacity-70"}`}><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e8eef9] text-[#426caa]"><BellRing className="size-4" /></span><div><strong className="block text-sm">Scheduled learning reminder</strong><p className="mt-1 text-xs leading-5 text-[#718077]">Receive one in-app study check-in at your selected local time.</p></div></div><Switch checked={values.reminderEnabled} disabled={!values.learningRemindersEnabled} onCheckedChange={checked => setValue("reminderEnabled", checked)} aria-label="Enable scheduled learning reminder" /></div>{values.reminderEnabled && values.learningRemindersEnabled ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium text-[#54655b]"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Local time</span><input type="time" step="900" value={values.reminderTimeUtc} onChange={event => setValue("reminderTimeUtc", event.target.value)} className="h-10 rounded-lg border border-[#d7e3d4] bg-white px-3 text-sm text-[#1f2a23] outline-none focus:ring-2 focus:ring-[#82a589]" /></label><label className="grid gap-1.5 text-xs font-medium text-[#54655b]"><span className="flex items-center gap-1.5"><Globe2 className="size-3.5" />Timezone</span><TimezonePicker value={values.reminderTimezone} deviceTimezone={deviceTimezone} onChange={timezone => setValue("reminderTimezone", timezone)} /></label><label className="grid gap-1.5 text-xs font-medium text-[#54655b] sm:col-span-2"><span>Cadence</span><select value={values.reminderWeekdaysOnly ? "weekdays" : "daily"} onChange={event => setValue("reminderWeekdaysOnly", event.target.value === "weekdays")} className="h-10 rounded-lg border border-[#d7e3d4] bg-white px-3 text-sm text-[#1f2a23] outline-none focus:ring-2 focus:ring-[#82a589]"><option value="weekdays">Weekdays only</option><option value="daily">Every day</option></select></label></div> : null}<p className="mt-3 text-[11px] leading-4 text-[#7a877f]">Search for a city or timezone. The reminder checks your saved local timezone, including daylight-saving changes, and can be changed or paused anytime.</p></section>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="bg-[#18201f] text-white" disabled={save.isPending || preferences.isLoading} onClick={() => save.mutate(values)}>{save.isPending ? "Saving…" : "Save settings"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
