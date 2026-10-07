"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Candidate = {
  id: string; name: string; title: string | null; org: string | null; source_url: string; evidence: string;
  fit: number; reply_reason: number; recency: number; reachability: number; total: number; hook: string;
  email: string | null; channel: "email" | "linkedin_dm"; subject: string | null; body: string;
  used_evidence: string; used_assets: string[]; status: "suggested" | "contacted" | "replied";
};
type Costs = { agent37: number; monid: number; openai: number; openai_tokens: number };
type RunResult = { runId: string; goal: string; candidates: Candidate[]; costs: Costs; demoRedirect: string | null };
type Filters = { location: string; role: string; industry: string };
const NO_FILTERS: Filters = { location: "", role: "", industry: "" };
type Reply = { candidateId: string; name: string; from: string; subject: string; date: string | null; isNew: boolean };
type Asset = { type: string; title: string; one_liner: string; url: string | null };
type Profile = { name: string; background: string; assets: Asset[] };
const ASSET_TYPES = ["project", "achievement", "skill", "link"];
// Only filters grounded in what LinkedIn actually shows (no inferred age, race or other protected traits).
const ROLES = ["Founder / CEO", "Executive", "Manager / Lead", "Engineer / IC", "Researcher / Professor", "Investor"];
type StepId = "plan" | "search" | "filter" | "email" | "score" | "draft" | "save";
type StepState = { status: "start" | "done"; message: string; count?: number; items?: string[] };
type RunEvent =
  | ({ type: "step"; step: StepId } & StepState)
  | ({ type: "done" } & RunResult)
  | { type: "error"; message: string };

const STEPS: { id: StepId; label: string; unit: (n: number) => string }[] = [
  { id: "plan", label: "Plan queries", unit: (n) => `${n} queries` },
  { id: "search", label: "Search LinkedIn", unit: (n) => `${n} people` },
  { id: "filter", label: "Filter", unit: (n) => `${n} kept` },
  { id: "email", label: "Find emails", unit: (n) => `${n} found` },
  { id: "score", label: "Score", unit: (n) => `top ${n}` },
  { id: "draft", label: "Draft emails", unit: (n) => `${n} drafts` },
  { id: "save", label: "Save", unit: () => "saved" },
];

const EXAMPLES = [
  "AI agent founders in SF open to mentoring a student",
  "Edtech founders using AI for learning, for user interviews about my persuasion game",
  "Behavioral psychology researchers working on persuasion",
];

const money = (n: number) => `$${n.toFixed(2)}`;

// Adds the demo passcode (if the deploy sets APP_PASSCODE); asks once on 401 and remembers it in this browser.
async function api(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  let code = "";
  try { code = localStorage.getItem("reachr-passcode") ?? ""; } catch {}
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), "x-reachr-passcode": code } });
  if (res.status !== 401 || !retry) return res;
  const entered = window.prompt("Enter the Reachr demo passcode");
  if (!entered) return res;
  try { localStorage.setItem("reachr-passcode", entered); } catch {}
  return api(url, init, false);
}

export default function Home() {
  const [phase, setPhase] = useState<"idle" | "running" | "results" | "profile">("idle");
  const [me, setMe] = useState("");
  useEffect(() => {
    api("/api/profile").then((r) => r.json()).then((p: Profile) => setMe(p.name)).catch(() => {});
  }, []);
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<Partial<Record<StepId, StepState>>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [demoRedirect, setDemoRedirect] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  async function run(g: string) {
    const text = g.trim();
    if (!text) return;
    setGoal(text); setSteps({}); setError(null); setNotice(null); setPhase("running");
    try {
      const res = await api("/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: text, filters }),
      });
      if (!res.ok || !res.body) throw new Error(`Run failed (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const ev = JSON.parse(line.slice(6)) as RunEvent;
            if (ev.type === "step") {
              const { step, status, message, count, items } = ev;
              setSteps((s) => ({ ...s, [step]: { status, message, count, items: items ?? s[step]?.items } }));
            } else if (ev.type === "done") {
              finished = true;
              setResult(ev); setDemoRedirect(ev.demoRedirect); setPhase("results");
            } else if (ev.type === "error") {
              finished = true;
              setError(ev.message);
            }
          }
        }
      }
      if (!finished) setError("The run ended before finishing.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadLatest() {
    setNotice(null);
    try {
      const data = (await (await api("/api/runs/latest")).json()) as RunResult | { runId: null };
      if (!data.runId) return setNotice("No runs yet. Start one above.");
      const r = data as RunResult;
      setResult(r); setGoal(r.goal); setDemoRedirect(r.demoRedirect); setPhase("results");
    } catch {
      setNotice("Could not load the last run.");
    }
  }

  function reset() { setPhase("idle"); setError(null); }

  return (
    <div className="wrap">
      <header className="top">
        <button className="brand" onClick={reset} aria-label="Reachr, back to start">
          <span className="brand-mark" aria-hidden /> Reachr
        </button>
        <div className="top-right">
          {demoRedirect && <span className="demo-badge">Demo mode: all email goes to {demoRedirect}</span>}
          <button className="link-btn" onClick={() => setPhase("profile")} disabled={phase === "running"}>
            {me ? `Sending as ${me}` : "Your profile"} · Edit profile
          </button>
        </div>
      </header>

      {phase === "idle" && (
        <Landing goal={goal} setGoal={setGoal} filters={filters} setFilters={setFilters} onRun={run} onLoad={loadLatest} notice={notice} />
      )}
      {phase === "running" && (
        <Running goal={goal} steps={steps} error={error} onRetry={() => run(goal)} onBack={reset} />
      )}
      {phase === "results" && result && <Results result={result} onNew={reset} />}
      {phase === "profile" && <ProfileView onDone={reset} onSaved={setMe} />}
    </div>
  );
}

const HOW = [
  ["Find", "People with a recent post on your topic."],
  ["Explain", "The sourced reason each one would reply."],
  ["Draft", "An email from their work and yours. You approve it."],
] as const;

function Landing({ goal, setGoal, filters, setFilters, onRun, onLoad, notice }: {
  goal: string; setGoal: (g: string) => void; filters: Filters; setFilters: (f: Filters) => void;
  onRun: (g: string) => void; onLoad: () => void; notice: string | null;
}) {
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters({ ...filters, [k]: e.target.value });
  return (
    <>
      <div className="aurora" aria-hidden><i /><i /></div>
      <main className="hero">
        <p className="eyebrow"><span>Outreach agent</span> sourced, personal, approved by you</p>
        <h1 id="goal-label">Who do you want to <em>reach</em>, and why?</h1>
        <p className="sub">Reachr finds people with a real reason to reply, shows the source, and drafts an email that ties their work to yours.</p>
        <form className="compose" onSubmit={(e) => { e.preventDefault(); onRun(goal); }}>
          <div className="goal-box">
            <textarea
              aria-labelledby="goal-label"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onRun(goal); }}
              placeholder="e.g. PMs at fintech startups for user interviews about my budgeting app"
              rows={3}
            />
            <div className="goal-actions">
              <span className="hint">Nothing is sent until you approve it.</span>
              <button className="btn btn-primary" type="submit" disabled={!goal.trim()}>Run</button>
            </div>
          </div>
          <fieldset className="filters">
            <legend>Narrow it down <span>(optional)</span></legend>
            <div className="field">
              <label htmlFor="f-location">Location</label>
              <input id="f-location" value={filters.location} onChange={set("location")} placeholder="e.g. San Francisco" />
            </div>
            <div className="field">
              <label htmlFor="f-role">Role</label>
              <select id="f-role" value={filters.role} onChange={set("role")}>
                <option value="">Any role</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-industry">Industry</label>
              <input id="f-industry" value={filters.industry} onChange={set("industry")} placeholder="e.g. Edtech" />
            </div>
          </fieldset>
        </form>
        <div className="examples" aria-label="Example goals">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setGoal(ex)}>{ex}</button>
          ))}
        </div>
        <ol className="how">
          {HOW.map(([verb, text]) => <li key={verb}><b>{verb}</b><span>{text}</span></li>)}
        </ol>
        <div className="below">
          <button className="btn btn-ghost btn-sm" onClick={onLoad}>Load last run</button>
          {notice && <span role="status">{notice}</span>}
        </div>
      </main>
    </>
  );
}

function useTicker(target: number) {
  const [n, setN] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target; setN(target); return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const v = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      from.current = v; setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}

function Running({ goal, steps, error, onRetry, onBack }: {
  goal: string; steps: Partial<Record<StepId, StepState>>; error: string | null; onRetry: () => void; onBack: () => void;
}) {
  const doneCount = STEPS.filter((s) => steps[s.id]?.status === "done").length;
  const active = STEPS.find((s) => steps[s.id]?.status === "start");
  // The big number follows the funnel: found -> kept -> shortlisted -> drafted.
  const funnel = (["draft", "score", "filter", "search"] as const).find((id) => steps[id]?.status === "done");
  const labels = { search: "people found", filter: "worth contacting", score: "shortlisted", draft: "emails drafted" };
  const count = useTicker(funnel ? steps[funnel]?.count ?? 0 : 0);
  const queries = steps.plan?.items ?? [];

  return (
    <main className="run">
      <section className="stage" aria-hidden>
        <div className="orb">
          <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
          {!error && <><span className="ping" /><span className="ping" /><span className="ping" /></>}
          {["o1", "o2", "o3", "o4", "o5", "o6"].map((o, i) => (
            <span key={o} className={`orbit ${o}${i < doneCount ? " lit" : ""}`}><i /></span>
          ))}
          <span className="core" />
        </div>
        <div className="counter">
          <b className="mono">{funnel ? count : "..."}</b>
          <span>{funnel ? labels[funnel] : "Planning the search"}</span>
        </div>
      </section>

      <section>
        <p className="run-goal">Goal</p>
        <h1 className="run-title">{goal}</h1>
        <ol className="track" aria-live="polite">
          {STEPS.map((s) => {
            const st = steps[s.id];
            const cls = st?.status === "done" ? "done" : st?.status === "start" && !error ? "active" : "";
            return (
              <li key={s.id} className={cls}>
                <span className="dot" aria-hidden>{st?.status === "done" ? "✓" : ""}</span>
                <span className="step-name">
                  {s.label}
                  {st?.message && (cls === "active" || s.id === "plan") && <span className="step-msg">{st.message}</span>}
                  {s.id === "plan" && queries.length > 0 && (
                    <span className="queries">
                      {queries.map((q, i) => <span key={q} className="q" style={{ "--i": i } as CSSProperties}>{q}</span>)}
                    </span>
                  )}
                </span>
                {st?.status === "done" && st.count !== undefined && <span className="step-count mono">{s.unit(st.count)}</span>}
                {st?.status === "done" && s.id === "plan" && st.count === undefined && queries.length > 0 && (
                  <span className="step-count mono">{s.unit(queries.length)}</span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="sr-only" role="status">{active ? `${active.label} in progress` : ""}</p>
        {error && (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={onRetry}>Try again</button>
              <button className="btn btn-ghost btn-sm" onClick={onBack}>Change goal</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Results({ result, onNew }: { result: RunResult; onNew: () => void }) {
  const [replies, setReplies] = useState<Record<string, Reply>>({});
  const [news, setNews] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  // Polls the Gmail inbox (via /api/replies) every 30s while results are open.
  async function checkReplies() {
    setChecking(true);
    try {
      const r = await (await api("/api/replies")).json();
      const list: Reply[] = r.replies ?? [];
      setReplies(Object.fromEntries(list.map((x) => [x.candidateId, x])));
      const fresh = list.filter((x) => x.isNew).map((x) => x.name);
      if (fresh.length) setNews((n) => [...new Set([...n, ...fresh])]);
    } catch {} finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    checkReplies();
    const t = setInterval(checkReplies, 30_000);
    return () => clearInterval(t);
  }, []);
  const list = [...result.candidates].sort((a, b) => b.total - a.total).slice(0, 10);
  const { agent37, monid, openai } = result.costs;
  const hours = Math.round((list.length * 20) / 60);
  return (
    <main>
      <div className="results-head">
        <div>
          <p className="run-goal" style={{ margin: 0 }}>{list.length} people for</p>
          <h1>{result.goal}</h1>
        </div>
        <div className="results-actions">
          <button className="btn btn-ghost" onClick={checkReplies} disabled={checking}>{checking ? "Checking inbox..." : "Check replies"}</button>
          <button className="btn btn-ghost" onClick={onNew}>New search</button>
        </div>
      </div>
      {news.length > 0 && (
        <div className="reply-toast" role="status">
          <span className="reply-dot" aria-hidden /> <b>{news.join(", ")}</b> replied to you.
          <button className="link-btn" onClick={() => setNews([])}>Dismiss</button>
        </div>
      )}
      {list.length === 0 ? (
        <p className="empty">No one matched this goal. Try a broader goal or a different angle.</p>
      ) : (
        <div className="cards">
          {list.map((c, i) => <Card key={c.id} c={c} i={i} demo={!!result.demoRedirect} reply={replies[c.id]} />)}
        </div>
      )}
      <footer className="foot">
        <span>
          Run cost <b className="mono">{money(openai + agent37 + monid)}</b>
          <span className="cost-split mono">OpenAI {money(openai)} · Agent37 {money(agent37)} · Monid {money(monid)}</span>
        </span>
        <span>Saved <b>~{hours}h</b> ({list.length} people × 20 min)</span>
      </footer>
    </main>
  );
}

function Card({ c, i, demo, reply }: { c: Candidate; i: number; demo: boolean; reply?: Reply }) {
  const [subject, setSubject] = useState(c.subject ?? "");
  const [body, setBody] = useState(c.body);
  const [why, setWhy] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(c.status === "suggested" ? "idle" : "done");
  const [msg, setMsg] = useState<{ sentTo?: string; redirected?: boolean; error?: string; copied?: boolean }>({});
  const isEmail = c.channel === "email" && !!c.email;
  const role = [c.title, c.org].filter(Boolean).join(", ");

  async function send() {
    setState("busy");
    try {
      const r = await (await api("/api/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: c.id, subject: isEmail ? subject : `LinkedIn DM draft for ${c.name}`, body }),
      })).json();
      if (!r.ok) throw new Error(r.error || "Send failed");
      setMsg({ sentTo: r.sentTo, redirected: r.redirected }); setState("done");
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : String(e) }); setState("error");
    }
  }

  async function openLinkedIn() {
    // Clipboard + window.open must run inside the click gesture, before any await.
    const copy = navigator.clipboard?.writeText(body).then(() => true, () => false) ?? Promise.resolve(false);
    window.open(c.source_url, "_blank", "noopener,noreferrer");
    setState("busy");
    const copied = await copy;
    try { await api("/api/contacted", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: c.id }) }); } catch {}
    setMsg({ copied }); setState("done");
  }

  const done = state === "done";
  return (
    <article className={`card${done ? " is-done" : ""}`} style={{ "--i": i } as CSSProperties}>
      <div className="card-top">
        <div>
          <h2>{c.name}</h2>
          {role && <div className="role">{role}</div>}
        </div>
        <span className="score mono" aria-label={`Score ${c.total} out of 20`}>{c.total}<small>/20</small></span>
      </div>
      {(reply || c.status === "replied") && (
        <div className="reply-note">
          <span className="reply-dot" aria-hidden /> Replied
          {reply?.date && <> · {new Date(reply.date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>}
          {reply?.subject && <> · <span className="mono">{reply.subject}</span></>}
        </div>
      )}
      <p className="hook">{c.hook}</p>
      <div className="meta">
        <a href={c.source_url} target="_blank" rel="noopener noreferrer">Source</a>
        {isEmail ? <span className="mono">{c.email}</span> : <span className="pill li">LinkedIn DM</span>}
      </div>

      <div className="editor">
        {isEmail && (
          <div className="field">
            <label htmlFor={`s-${c.id}`}>Subject</label>
            <input id={`s-${c.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={done} />
          </div>
        )}
        <div className="field">
          <label htmlFor={`b-${c.id}`}>{isEmail ? "Email" : "LinkedIn message"}</label>
          <textarea id={`b-${c.id}`} value={body} onChange={(e) => setBody(e.target.value)} disabled={done} />
        </div>
      </div>

      {why && (
        <div className="why" id={`why-${c.id}`}>
          <div>
            <h3>From their post</h3>
            <blockquote>“{c.used_evidence}”</blockquote>
          </div>
          {c.used_assets?.length > 0 && (
            <div>
              <h3>From your profile</h3>
              <ul>{c.used_assets.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          <div className="breakdown mono">
            <span>Fit <b>{c.fit}</b></span><span>Reason to reply <b>{c.reply_reason}</b></span>
            <span>Recency <b>{c.recency}</b></span><span>Reachability <b>{c.reachability}</b></span>
          </div>
        </div>
      )}

      <div className="card-actions">
        <button className="link-btn" aria-expanded={why} aria-controls={`why-${c.id}`} onClick={() => setWhy(!why)}>
          {why ? "Hide why" : "Why this email"}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }} aria-live="polite">
          {state === "error" && <span className="status err">{msg.error}</span>}
          {done && isEmail && (
            <span className="status ok">
              {msg.sentTo ? `Sent to ${msg.sentTo}` : "Contacted"}
              {msg.redirected && <span className="demo-badge" style={{ marginLeft: 8 }}>demo redirect</span>}
            </span>
          )}
          {done && !isEmail && msg.sentTo && (
            <span className="status ok">Sent to {msg.sentTo}<span className="demo-badge" style={{ marginLeft: 8 }}>demo redirect</span></span>
          )}
          {done && !isEmail && !msg.sentTo && (
            <span className="status ok">{msg.copied ? "Copied. Paste it in LinkedIn." : msg.copied === false ? "Opened LinkedIn. Copy the message above." : "Contacted"}</span>
          )}
          {!done && (isEmail ? (
            <button className="btn btn-accent" onClick={send} disabled={state === "busy" || !body.trim() || !subject.trim()}>
              {state === "busy" ? "Sending..." : "Approve & send"}
            </button>
          ) : (
            <>
              {demo && (
                <button className="btn btn-ghost" onClick={send} disabled={state === "busy" || !body.trim()} title="Demo mode: sends this draft to the demo inbox">
                  {state === "busy" ? "Sending..." : "Approve & send to my inbox"}
                </button>
              )}
              <button className="btn btn-accent" onClick={openLinkedIn} disabled={state === "busy"}>Open in LinkedIn</button>
            </>
          ))}
        </div>
      </div>
    </article>
  );
}

// The user's own facts. Drafts may only use what is saved here, so this is where "about me" lives.
function ProfileView({ onDone, onSaved }: { onDone: () => void; onSaved: (name: string) => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    api("/api/profile").then((r) => r.json()).then((d: Profile) => setP(d)).catch(() => setState("error"));
  }, []);
  if (!p) return <main className="profile"><p className="sub">{state === "error" ? "Could not load your profile." : "Loading your profile..."}</p></main>;

  const edit = (next: Profile) => { setP(next); setState("idle"); };
  const setAsset = (i: number, k: keyof Asset) => (e: { target: { value: string } }) =>
    edit({ ...p, assets: p.assets.map((a, j) => (j === i ? { ...a, [k]: e.target.value } : a)) });

  async function save() {
    setState("saving");
    const r = await api("/api/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setState(r.ok ? "saved" : "error");
    if (r.ok && p) onSaved(p.name);
  }

  return (
    <main className="profile">
      <div className="results-head">
        <div>
          <p className="run-goal" style={{ margin: 0 }}>Your profile</p>
          <h1>What Reachr may say about you</h1>
        </div>
        <button className="btn btn-ghost" onClick={onDone}>Back</button>
      </div>
      <p className="sub">Emails only use the facts written here. Nothing else about you is ever made up.</p>

      <div className="field">
        <label htmlFor="p-name">Name</label>
        <input id="p-name" value={p.name} onChange={(e) => edit({ ...p, name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="p-bg">Background</label>
        <textarea id="p-bg" className="short" value={p.background} onChange={(e) => edit({ ...p, background: e.target.value })} />
      </div>

      <h2 className="profile-h">Projects, achievements and links</h2>
      {p.assets.map((a, i) => (
        <div className="asset" key={i}>
          <div className="asset-row">
            <div className="field">
              <label htmlFor={`a-${i}-type`}>Type</label>
              <select id={`a-${i}-type`} value={a.type} onChange={setAsset(i, "type")}>
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`a-${i}-title`}>Title</label>
              <input id={`a-${i}-title`} value={a.title} onChange={setAsset(i, "title")} placeholder="e.g. Srake" />
            </div>
            <button className="link-btn" onClick={() => edit({ ...p, assets: p.assets.filter((_, j) => j !== i) })}>Remove</button>
          </div>
          <div className="field">
            <label htmlFor={`a-${i}-line`}>One-liner</label>
            <input id={`a-${i}-line`} value={a.one_liner} onChange={setAsset(i, "one_liner")} placeholder="What it is and what you did" />
          </div>
          <div className="field">
            <label htmlFor={`a-${i}-url`}>Link (optional)</label>
            <input id={`a-${i}-url`} value={a.url ?? ""} onChange={setAsset(i, "url")} placeholder="https://" />
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => edit({ ...p, assets: [...p.assets, { type: "project", title: "", one_liner: "", url: null }] })}>
        + Add item
      </button>

      <div className="profile-actions" aria-live="polite">
        {state === "saved" && <span className="status ok">Saved. New drafts will use this.</span>}
        {state === "error" && <span className="status err">Could not save. Try again.</span>}
        <button className="btn btn-accent" onClick={save} disabled={state === "saving" || !p.name.trim()}>
          {state === "saving" ? "Saving..." : "Save profile"}
        </button>
      </div>
    </main>
  );
}
