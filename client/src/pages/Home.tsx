import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { BookOpen, BrainCircuit, CalendarDays, ChevronRight, GraduationCap, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

const capabilities = [
  { icon: BookOpen, title: "Learning that remembers", body: "Courses, lessons, progress, work and reflection live in one durable workspace." },
  { icon: UsersRound, title: "Teaching with clarity", body: "Teachers publish learning, review submissions and keep learners moving." },
  { icon: ShieldCheck, title: "Governance by design", body: "Roles, audit records, reports and backup requests are designed into the system." },
];

export default function Home() {
  const [, navigate] = useLocation();
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#18201f]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
        <button className="flex items-center gap-3 text-left" onClick={() => navigate("/")} aria-label="Educonnect home">
          <span className="grid size-9 place-items-center rounded-xl bg-[#18201f] text-[#e0f4dd]"><GraduationCap className="size-5" /></span>
          <span><strong className="block text-sm tracking-tight">Educonnect</strong><small className="block text-[10px] uppercase tracking-[0.17em] text-[#68736d]">Learning operations</small></span>
        </button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="hidden text-[#44534d] sm:inline-flex" onClick={() => navigate("/app")}>Open workspace</Button>
          <Button className="bg-[#f2634f] text-white hover:bg-[#d95040]" onClick={() => startLogin()}>Sign in</Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.15fr_.85fr] lg:px-10 lg:pb-32 lg:pt-24">
        <div className="max-w-3xl">
          <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-[#d95040]"><span className="h-px w-8 bg-[#f2634f]" />Connected learning, accountable operations</p>
          <h1 className="font-serif text-5xl leading-[.95] tracking-[-.045em] text-[#18201f] sm:text-7xl">Make every learning action <em className="font-normal text-[#f2634f]">count.</em></h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#4c5a54]">Educonnect brings students, teachers and administrators into one secure, role-aware workspace for learning delivery, teaching operations and school governance.</p>
          <div className="mt-10 flex flex-wrap items-center gap-4"><Button size="lg" className="bg-[#18201f] px-6 text-white hover:bg-[#2a3531]" onClick={() => startLogin()}>Continue with secure sign-in <ChevronRight className="ml-2 size-4" /></Button><button className="text-sm font-semibold text-[#44534d] underline decoration-[#9cad9d] underline-offset-4" onClick={() => navigate("/app")}>Explore the workspace</button></div>
          <div className="mt-16 grid max-w-xl grid-cols-3 gap-7 border-t border-[#d9dfd4] pt-7"><div><strong className="block text-2xl font-semibold">3</strong><span className="text-xs text-[#68736d]">role-aware spaces</span></div><div><strong className="block text-2xl font-semibold">1</strong><span className="text-xs text-[#68736d]">durable learning record</span></div><div><strong className="block text-2xl font-semibold">0</strong><span className="text-xs text-[#68736d]">mock save actions</span></div></div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#18201f] p-7 text-[#f5f8ef] shadow-[16px_16px_0_#dce8d7] sm:p-10">
          <div className="absolute right-0 top-0 size-44 rounded-full bg-[#f2634f] opacity-90 blur-3xl" /><div className="absolute bottom-0 left-0 size-48 rounded-full bg-[#82ba9e] opacity-20 blur-3xl" />
          <div className="relative"><div className="mb-11 flex items-center justify-between"><span className="rounded-full border border-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.14em]">Live product surface</span><Sparkles className="size-5 text-[#b9e8bd]" /></div><p className="text-sm leading-6 text-[#bfcac1]">Everything starts with a trusted identity, then moves through the system with permissions, state and a trace.</p><div className="mt-10 space-y-4">{["A student completes a lesson", "A teacher publishes an assignment", "An administrator reviews the audit trail"].map((line, index) => <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4" key={line}><span className="grid size-8 place-items-center rounded-full bg-[#b9e8bd] text-xs font-bold text-[#18201f]">0{index + 1}</span><span className="text-sm font-medium">{line}</span></div>)}</div><div className="mt-10 rounded-2xl bg-[#f7f5ef] p-5 text-[#18201f]"><div className="flex items-center gap-3"><BrainCircuit className="size-5 text-[#d95040]" /><div><strong className="block text-sm">AI requests stay reviewable</strong><span className="text-xs text-[#607068]">Prompt version and human-review status are recorded.</span></div></div></div></div>
        </div>
      </section>
      <section className="border-y border-[#d9dfd4] bg-[#edf3e9]"><div className="mx-auto grid max-w-7xl gap-px px-6 py-8 md:grid-cols-3 lg:px-10">{capabilities.map(capability => <article className="p-6" key={capability.title}><capability.icon className="mb-8 size-6 text-[#d95040]" /><h2 className="text-xl font-semibold tracking-tight">{capability.title}</h2><p className="mt-3 text-sm leading-6 text-[#5b6a62]">{capability.body}</p></article>)}</div></section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-[#68736d] lg:px-10"><span>Educonnect platform workspace</span><div className="flex gap-5"><button onClick={() => navigate("/app")}>Workspace</button><button onClick={() => startLogin()}>Secure sign-in</button></div></footer>
    </main>
  );
}
