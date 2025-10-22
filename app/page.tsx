"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  HelpCircle,
  Plus,
  X,
  Play,
  Download,
  History,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
} from "lucide-react";

type EvidenceItem = { id: string; text: string; source?: string };
type CounterItem = { id: string; text: string };

type Resonance = { clarity: number; tension: number; openness: number };

type Toggles = { resonanceForecaster: boolean; depthIntegrityScan: boolean; witnessMode: boolean };

type Weights = {
  contradiction: number;
  time: number;
  identity: number;
  logic: number;
  resonanceInfluence: number;
  evidenceBonusMax: number;
  evidenceBonusPer: number;
  assumptionPenaltyPer: number;
  assumptionPenaltyThreshold: number;
};

type Contribs = {
  contradiction: number;
  time: number;
  identity: number;
  logic: number;
  evidenceBonus: number;
  assumptionPenalty: number;
  resonanceNudge: number;
  baseBeforeResonance: number;
  finalDepth: number;
};

type ProbeResult = {
  depth: number;
  coherence: { contradiction: number; time: number; identity: number; logic: number };
  contribs: Contribs;
  notes: string[];
  why: string[];
  audit: {
    evidenceCount: number;
    counterCount: number;
    assumptionCount: number;
    absolutes: string[];
    vaguePronouns: number;
    timeRefs: string[];
    hasExplicitMonth: boolean;
    hasYear: boolean;
  };
  rigor: { level: "Light" | "Medium" | "High"; guidance: string[] };
  status: "△∅" | "⟁~" | "OK";
};

type Probe = {
  id: string;
  createdAt: string;
  claim: string;
  context: string;
  subject: string;
  stakes: number;
  evidence: EvidenceItem[];
  counters: CounterItem[];
  assumptions: string[];
  timeRefs: string[];
  resonance: Resonance;
  toggles: Toggles;
  result?: ProbeResult;
  loops: Probe[];
};

const LS_KEY = "ref-truth-engine-probes";
const LS_WEIGHTS = "ref-truth-engine-weights";

function newId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (error) {
    console.error("UUID generation failed, using fallback", error);
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `id-${Date.now().toString(36)}-${rand}`;
}

const ABSOLUTES = ["always", "never", "everyone", "no one", "all", "none"];
const RELATIVE_TIME = [
  "today",
  "yesterday",
  "tomorrow",
  "last week",
  "last month",
  "last year",
  "this week",
  "this month",
  "this year",
  "recently",
  "soon",
];

function monthWords(): string[] {
  return [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan ",
    "feb ",
    "mar ",
    "apr ",
    "jun ",
    "jul ",
    "aug ",
    "sep ",
    "oct ",
    "nov ",
    "dec ",
  ];
}

function extractTimeRefs(text: string): string[] {
  const refs: string[] = [];
  const lower = (text || "").toLowerCase();
  [...RELATIVE_TIME, ...monthWords()].forEach((token) => {
    if (lower.includes(token)) refs.push(token);
  });
  const yearMatches = lower.match(/\b(19|20)\d{2}\b/g) || [];
  return Array.from(new Set([...(refs || []), ...yearMatches]));
}

function scoreContradiction(evidence: EvidenceItem[], counters: CounterItem[]): number {
  const e = (evidence || []).filter((item) => (item?.text || "").trim()).length;
  const c = (counters || []).filter((item) => (item?.text || "").trim()).length;
  if (e + c === 0) return 40;
  const ratio = e / (e + c);
  return Math.round(100 * ratio);
}

function scoreTime(timeRefs: string[], context: string, claim: string): number {
  const hasRelative = (timeRefs || []).some((token) => RELATIVE_TIME.includes(token));
  const hasExplicitMonth = (timeRefs || []).some((token) => monthWords().includes(token));
  const hasYear = /\b(19|20)\d{2}\b/.test(`${context || ""} ${claim || ""}`);
  let base = 70;
  if (hasRelative && !hasExplicitMonth && !hasYear) base -= 25;
  if (!hasRelative && (hasExplicitMonth || hasYear)) base += 10;
  return Math.max(0, Math.min(100, base));
}

function scoreIdentity(subject: string, claim: string): number {
  const hasSubject = (subject || "").trim().length > 0;
  const vagueCount = ((claim || "").match(/\b(they|people|everyone|no one|we)\b/gi) || []).length;
  let base = hasSubject ? 85 : 55;
  base -= Math.min(30, vagueCount * 10);
  return Math.max(0, Math.min(100, base));
}

function scoreLogic(claim: string, assumptions: string[]): number {
  const lower = (claim || "").toLowerCase();
  const absolutes = ABSOLUTES.reduce((acc, word) => acc + (lower.includes(word) ? 1 : 0), 0);
  let base = 90 - absolutes * 15 - Math.max(0, (assumptions || []).length - 2) * 8;
  return Math.max(0, Math.min(100, base));
}

function normalizeWeights(weights: Weights) {
  const sum = (weights.contradiction || 0) + (weights.time || 0) + (weights.identity || 0) + (weights.logic || 0);
  const k = sum === 0 ? 1 : 1 / sum;
  return {
    ...weights,
    contradiction: (weights.contradiction || 0) * k,
    time: (weights.time || 0) * k,
    identity: (weights.identity || 0) * k,
    logic: (weights.logic || 0) * k,
  };
}

function computeDepth(
  coherence: ProbeResult["coherence"],
  evidenceCount: number,
  assumptionsCount: number,
  toggles: Toggles,
  resonance: Resonance | undefined,
  weights: Weights
): Contribs {
  const normalized = normalizeWeights(weights);
  const base =
    (coherence.contradiction || 0) * normalized.contradiction +
    (coherence.time || 0) * normalized.time +
    (coherence.identity || 0) * normalized.identity +
    (coherence.logic || 0) * normalized.logic;
  const evidenceBonus = Math.min(
    normalized.evidenceBonusMax,
    Math.max(0, (evidenceCount - 1) * normalized.evidenceBonusPer)
  );
  const assumptionPenalty = Math.max(0, assumptionsCount - normalized.assumptionPenaltyThreshold) * normalized.assumptionPenaltyPer;
  let beforeResonance = base + evidenceBonus - assumptionPenalty;
  let resonanceNudge = 0;
  if (toggles?.resonanceForecaster && resonance) {
    const mod = ((resonance.clarity || 0) + (resonance.openness || 0) - (resonance.tension || 0)) / 3;
    resonanceNudge = (normalized.resonanceInfluence / 100) * (mod - beforeResonance);
  }
  const finalDepth = Math.round(Math.max(0, Math.min(100, beforeResonance + resonanceNudge)));
  return {
    contradiction: Math.round((coherence.contradiction || 0) * normalized.contradiction),
    time: Math.round((coherence.time || 0) * normalized.time),
    identity: Math.round((coherence.identity || 0) * normalized.identity),
    logic: Math.round((coherence.logic || 0) * normalized.logic),
    evidenceBonus: Math.round(evidenceBonus),
    assumptionPenalty: Math.round(assumptionPenalty),
    resonanceNudge: Math.round(resonanceNudge),
    baseBeforeResonance: Math.round(beforeResonance),
    finalDepth,
  };
}

function statusFromDepth(depth: number, toggles: Toggles): ProbeResult["status"] {
  if (depth < 50) return "△∅";
  if (depth >= 50 && depth < 80) return toggles?.depthIntegrityScan ? "⟁~" : "OK";
  return "OK";
}

function download(filename: string, text: string) {
  if (typeof document === "undefined") return;
  const element = document.createElement("a");
  const file = new Blob([text], { type: "application/json" });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function pctColor(value: number): string {
  if (value < 50) return "bg-red-500";
  if (value < 70) return "bg-amber-500";
  if (value < 85) return "bg-blue-500";
  return "bg-emerald-500";
}

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as T) : initial;
      return parsed;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* no-op */
    }
  }, [key, state]);

  return [state, setState] as const;
}

function ensureArray<T>(val: T[] | undefined | null): T[] {
  return Array.isArray(val) ? val : [];
}

function sanitizeProbe(probe: any): Probe {
  return {
    id: typeof probe?.id === "string" ? probe.id : newId(),
    createdAt: typeof probe?.createdAt === "string" ? probe.createdAt : new Date().toISOString(),
    claim: typeof probe?.claim === "string" ? probe.claim : "",
    context: typeof probe?.context === "string" ? probe.context : "",
    subject: typeof probe?.subject === "string" ? probe.subject : "",
    stakes: typeof probe?.stakes === "number" ? probe.stakes : 40,
    evidence: ensureArray<EvidenceItem>(probe?.evidence),
    counters: ensureArray<CounterItem>(probe?.counters),
    assumptions: ensureArray<string>(probe?.assumptions),
    timeRefs: ensureArray<string>(probe?.timeRefs),
    resonance:
      probe?.resonance && typeof probe.resonance === "object"
        ? {
            clarity: Number.isFinite(probe.resonance.clarity) ? probe.resonance.clarity : 50,
            tension: Number.isFinite(probe.resonance.tension) ? probe.resonance.tension : 50,
            openness: Number.isFinite(probe.resonance.openness) ? probe.resonance.openness : 50,
          }
        : { clarity: 50, tension: 50, openness: 50 },
    toggles:
      probe?.toggles && typeof probe.toggles === "object"
        ? {
            resonanceForecaster: !!probe.toggles.resonanceForecaster,
            depthIntegrityScan: !!probe.toggles.depthIntegrityScan,
            witnessMode: !!probe.toggles.witnessMode,
          }
        : { resonanceForecaster: true, depthIntegrityScan: true, witnessMode: true },
    result: probe?.result,
    loops: ensureArray<Probe>(probe?.loops).map(sanitizeProbe),
  };
}

const defaultWeights: Weights = {
  contradiction: 0.3,
  time: 0.2,
  identity: 0.25,
  logic: 0.25,
  resonanceInfluence: 15,
  evidenceBonusMax: 10,
  evidenceBonusPer: 4,
  assumptionPenaltyPer: 4,
  assumptionPenaltyThreshold: 3,
};

const starterProbe: Probe = {
  id: newId(),
  createdAt: new Date().toISOString(),
  claim: "People are burning out more than ever.",
  context:
    "Observed in conversations and media; seems higher since 2023. Want to understand if it's broadly true or my bubble.",
  subject: "Jeremy (observer)",
  stakes: 60,
  evidence: [{ id: newId(), text: "3 friends recently reported burnout at work", source: "personal" }],
  counters: [{ id: newId(), text: "Might be selection bias in my circle" }],
  assumptions: ["My interactions are representative"],
  timeRefs: ["since 2023"],
  resonance: { clarity: 65, tension: 55, openness: 70 },
  toggles: { resonanceForecaster: true, depthIntegrityScan: true, witnessMode: true },
  loops: [],
};

export default function Component() {
  const [rawProbes, setRawProbes] = useLocalStorage<any>(LS_KEY, []);
  const probes: Probe[] = (Array.isArray(rawProbes) ? rawProbes : []).map(sanitizeProbe);
  const [weights, setWeights] = useLocalStorage<Weights>(LS_WEIGHTS, defaultWeights);
  const [autoRecalc, setAutoRecalc] = useState(false);
  const [activeId, setActiveId] = useState<string>(probes[0]?.id || "");

  useEffect(() => {
    if (!Array.isArray(rawProbes) || rawProbes.length === 0) {
      const seed = [starterProbe];
      setRawProbes(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(() => probes.find((probe) => probe.id === activeId) || probes[0], [probes, activeId]);
  useEffect(() => {
    if (!active && probes[0]) setActiveId(probes[0].id);
  }, [active, probes]);

  function writeProbes(next: Probe[]) {
    setRawProbes(next);
  }

  function updateActive(partial: Partial<Probe>) {
    if (!active) return;
    const next = probes.map((probe) => (probe.id === active.id ? { ...probe, ...partial } : probe));
    writeProbes(next);
  }

  useEffect(() => {
    if (autoRecalc && active) runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  function addEvidence() {
    if (!active) return;
    updateActive({ evidence: [...ensureArray(active.evidence), { id: newId(), text: "", source: "" }] });
  }

  function addCounter() {
    if (!active) return;
    updateActive({ counters: [...ensureArray(active.counters), { id: newId(), text: "" }] });
  }

  function addAssumption() {
    if (!active) return;
    updateActive({ assumptions: [...ensureArray(active.assumptions), ""] });
  }

  function runScan() {
    if (!active) return;
    const timeRefs = Array.from(
      new Set([...extractTimeRefs(active.claim), ...extractTimeRefs(active.context)])
    );
    const contradiction = scoreContradiction(active.evidence, active.counters);
    const time = scoreTime(timeRefs, active.context, active.claim);
    const identity = scoreIdentity(active.subject, active.claim);
    const logic = scoreLogic(active.claim, (active.assumptions || []).filter(Boolean));
    const coherence = { contradiction, time, identity, logic };

    const evidenceCount = ensureArray(active.evidence).filter((item) => (item.text || "").trim()).length;
    const counterCount = ensureArray(active.counters).filter((item) => (item.text || "").trim()).length;
    const assumptionCount = ensureArray(active.assumptions).filter(Boolean).length;
    const absolutes = ABSOLUTES.filter((word) => (active.claim || "").toLowerCase().includes(word));
    const vaguePronouns = ((active.claim || "").match(/\b(they|people|everyone|no one|we)\b/gi) || []).length;

    const contribs = computeDepth(
      coherence,
      evidenceCount,
      assumptionCount,
      active.toggles,
      active.resonance,
      weights
    );

    const why: string[] = [];
    why.push(`Evidence vs counters: ${evidenceCount} vs ${counterCount} → contradiction score ${contradiction}.`);
    if (time < 70) {
      why.push(
        `Time grounding is weak (${time}). Found ${
          timeRefs.length ? `refs: ${timeRefs.join(", ")}` : "no explicit refs"
        }. Add months/years or exact dates.`
      );
    } else {
      why.push(`Time grounding is acceptable (${time}).`);
    }
    if (!(active.subject || "").trim()) {
      why.push("Subject is vague. Name the agent responsible for the claim (you, a team, a population).");
    } else {
      why.push(`Identity clarity: subject "${active.subject}" → score ${identity}.`);
    }
    if (absolutes.length) {
      why.push(
        `Logic penalty for absolutes: ${absolutes.join(", ")}. Consider quantifiers (e.g., "often", "in my sample").`
      );
    }
    if (assumptionCount > weights.assumptionPenaltyThreshold) {
      why.push(
        `Too many assumptions (${assumptionCount}). Convert some into questions and collect data to replace them.`
      );
    }

    const notes: string[] = [];
    if (coherence.time < 60) notes.push("Time is fuzzy. Replace relative words with dates (e.g., 'since 2025-06').");
    if (coherence.logic < 70) notes.push("Watch absolutist terms or unsupported jumps. Rephrase as testable claims.");
    if (coherence.contradiction < 60) notes.push("Collect stronger evidence or address counters more directly.");
    if (assumptionCount > weights.assumptionPenaltyThreshold)
      notes.push("Too many assumptions. Convert some into questions and go gather data.");

    const depth = contribs.finalDepth;
    const status = statusFromDepth(depth, active.toggles);

    const rigorLevel = active.stakes < 34 ? "Light" : active.stakes < 67 ? "Medium" : "High";
    const guidance: string[] = [];
    if (rigorLevel === "Light") guidance.push("2+ concrete pieces of evidence, 1 counterexample, date at least month+year.");
    if (rigorLevel === "Medium") guidance.push("3–5 sources (mix personal + external), explicit dates, run 1 falsification test.");
    if (rigorLevel === "High")
      guidance.push(
        "5+ sources incl. base rates, opposing sources, precise dating, pre-register what would change your mind."
      );

    updateActive({
      timeRefs,
      result: {
        depth,
        coherence,
        contribs,
        notes,
        why,
        audit: {
          evidenceCount,
          counterCount,
          assumptionCount,
          absolutes,
          vaguePronouns,
          timeRefs,
          hasExplicitMonth: timeRefs.some((token) => monthWords().includes((token || "").toLowerCase())),
          hasYear: /\b(19|20)\d{2}\b/.test(`${active.context || ""} ${active.claim || ""}`),
        },
        rigor: { level: rigorLevel as ProbeResult["rigor"]["level"], guidance },
        status,
      },
    });
  }

  function newProbe() {
    const probe: Probe = {
      id: newId(),
      createdAt: new Date().toISOString(),
      claim: "",
      context: "",
      subject: "",
      stakes: 40,
      evidence: [],
      counters: [],
      assumptions: [],
      timeRefs: [],
      resonance: { clarity: 50, tension: 50, openness: 50 },
      toggles: { resonanceForecaster: true, depthIntegrityScan: true, witnessMode: true },
      loops: [],
    };
    const next = [probe, ...probes];
    writeProbes(next);
    setActiveId(probe.id);
  }

  function cloneAsLoop() {
    if (!active) return;
    const refined: Probe = { ...active, id: newId(), createdAt: new Date().toISOString(), loops: [] };
    const next = probes.map((probe) =>
      probe.id === active.id ? { ...probe, loops: [refined, ...ensureArray(probe.loops)] } : probe
    );
    writeProbes(next);
  }

  function exportJSON() {
    if (!active) return;
    const payload = JSON.stringify(active, null, 2);
    download(`ref-truth-probe-${active.id}.json`, payload);
  }

  function saveTitleFromClaim(claim: string) {
    if (!claim) return "Untitled";
    const trimmed = claim.length > 42 ? `${claim.slice(0, 42)}…` : claim;
    return trimmed;
  }

  const normalizedWeights = useMemo(() => normalizeWeights(weights), [weights]);

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-bold">REF Truth Engine — Working Page</h1>
        <p className="mb-4 text-sm text-slate-600">No probes found (storage may be empty). Start a fresh one.</p>
        <Button onClick={newProbe}>
          <Plus className="mr-2 h-4 w-4" />
          New Probe
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            REF Truth Engine <span className="text-slate-500">— Working Page</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter a claim → add evidence & counters → run scans → iterate loops. Keep what survives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={newProbe}>
            <Plus className="mr-2 h-4 w-4" />
            New Probe
          </Button>
          <Button variant="outline" onClick={cloneAsLoop}>
            <History className="mr-2 h-4 w-4" />
            Save as Loop
          </Button>
          <Button onClick={exportJSON}>
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
          <Button onClick={runScan} className="bg-indigo-600 hover:bg-indigo-700">
            <Play className="mr-2 h-4 w-4" />
            Run Scan
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> Claim & Context
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-3">
                  <label className="text-xs text-slate-500">Claim</label>
                  <Input
                    placeholder="State a single, testable claim…"
                    value={active.claim}
                    onChange={(event) => updateActive({ claim: event.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Subject</label>
                  <Input
                    placeholder="Who is the 'I' / entity?"
                    value={active.subject}
                    onChange={(event) => updateActive({ subject: event.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Context</label>
                <Textarea
                  placeholder="Relevant details, scope, where this shows up…"
                  value={active.context}
                  onChange={(event) => updateActive({ context: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <SectionTitle
                    icon={Sparkles}
                    title="Stakes"
                    hint="How consequential is this claim to decisions/identity?"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <Slider value={[active.stakes]} onValueChange={([value]) => updateActive({ stakes: value })} />
                    <Pill>{active.stakes}</Pill>
                  </div>
                </div>
                <div>
                  <SectionTitle
                    icon={HelpCircle}
                    title="Assumptions"
                    hint="Implicit beliefs the claim depends on. Try converting some into questions."
                  />
                  <div className="mt-2 space-y-2">
                    {ensureArray(active.assumptions).map((assumption, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={assumption}
                          onChange={(event) => {
                            const next = [...ensureArray(active.assumptions)];
                            next[index] = event.target.value;
                            updateActive({ assumptions: next });
                          }}
                          placeholder="Assumption…"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const next = ensureArray(active.assumptions).filter((_, itemIndex) => itemIndex !== index);
                            updateActive({ assumptions: next });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addAssumption}>
                      <Plus className="mr-1 h-4 w-4" /> Add assumption
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="evidence" className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="counters">Counters</TabsTrigger>
              <TabsTrigger value="resonance">Resonance</TabsTrigger>
            </TabsList>
            <TabsContent value="evidence">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ensureArray(active.evidence).map((evidence) => (
                    <div key={evidence.id} className="grid grid-cols-1 items-center gap-2 md:grid-cols-12">
                      <Input
                        className="md:col-span-8"
                        placeholder="Evidence item…"
                        value={evidence.text}
                        onChange={(event) => {
                          const next = ensureArray(active.evidence).map((item) =>
                            item.id === evidence.id ? { ...item, text: event.target.value } : item
                          );
                          updateActive({ evidence: next });
                        }}
                      />
                      <Input
                        className="md:col-span-3"
                        placeholder="Source (link/notes)"
                        value={evidence.source || ""}
                        onChange={(event) => {
                          const next = ensureArray(active.evidence).map((item) =>
                            item.id === evidence.id ? { ...item, source: event.target.value } : item
                          );
                          updateActive({ evidence: next });
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updateActive({ evidence: ensureArray(active.evidence).filter((item) => item.id !== evidence.id) })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={addEvidence}>
                    <Plus className="mr-1 h-4 w-4" /> Add evidence
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="counters">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Counters / Alternatives</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ensureArray(active.counters).map((counter) => (
                    <div key={counter.id} className="flex items-center gap-2">
                      <Input
                        placeholder="Counter-argument or disconfirming example…"
                        value={counter.text}
                        onChange={(event) => {
                          const next = ensureArray(active.counters).map((item) =>
                            item.id === counter.id ? { ...item, text: event.target.value } : item
                          );
                          updateActive({ counters: next });
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          updateActive({ counters: ensureArray(active.counters).filter((item) => item.id !== counter.id) })
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={addCounter}>
                    <Plus className="mr-1 h-4 w-4" /> Add counter
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="resonance">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resonance (Somatic read)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {([
                    ["clarity", "Sense of lucidity / clean seeing"],
                    ["tension", "Knots, defensiveness, contraction"],
                    ["openness", "Willingness to be changed by evidence"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <SectionTitle icon={Sparkles} title={key} hint={label} />
                      <div className="mt-2 flex items-center gap-3">
                        <Slider
                          value={[active.resonance[key as keyof Resonance] as number]}
                          onValueChange={([value]) =>
                            updateActive({
                              resonance: { ...active.resonance, [key]: value } as Resonance,
                            })
                          }
                        />
                        <Pill>{active.resonance[key as keyof Resonance] as number}</Pill>
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 grid grid-cols-3 items-center gap-4 md:col-span-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.toggles.resonanceForecaster}
                        onCheckedChange={(value) =>
                          updateActive({ toggles: { ...active.toggles, resonanceForecaster: value } })
                        }
                      />
                      <span className="text-sm">Resonance Forecaster</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.toggles.depthIntegrityScan}
                        onCheckedChange={(value) =>
                          updateActive({ toggles: { ...active.toggles, depthIntegrityScan: value } })
                        }
                      />
                      <span className="text-sm">Depth Integrity Scan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={active.toggles.witnessMode}
                        onCheckedChange={(value) =>
                          updateActive({ toggles: { ...active.toggles, witnessMode: value } })
                        }
                      />
                      <span className="text-sm">Witness Mode</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Scores & Status
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-slate-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Contradiction: evidence vs counters. Time: specificity & dating. Identity: clear subject. Logic:
                      avoids absolutism & hidden leaps. Depth blends them; Resonance (optional) nudges after base.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">Status</div>
                <div className="text-base font-semibold">
                  {active.result?.status ? (
                    <span>
                      {active.result.status === "△∅" && "△∅ Shallow"}
                      {active.result.status === "⟁~" && "⟁~ Resonant"}
                      {active.result.status === "OK" && "OK Strong"}
                    </span>
                  ) : (
                    <span className="text-slate-400">(Run scan)</span>
                  )}
                </div>
              </div>
              <ScoreBar label="Depth" value={active.result?.depth ?? 0} />
              <Separator />
              <ScoreBar label="Contradiction" value={active.result?.coherence?.contradiction ?? 0} />
              <ScoreBar label="Time" value={active.result?.coherence?.time ?? 0} />
              <ScoreBar label="Identity" value={active.result?.coherence?.identity ?? 0} />
              <ScoreBar label="Logic" value={active.result?.coherence?.logic ?? 0} />

              {active.result && (
                <div className="mt-3 space-y-2 rounded-lg bg-slate-100/60 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this score</div>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
                    {(active.result?.why ?? []).map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="rounded border bg-white p-2">
                      <div className="mb-1 text-[10px] text-slate-500">Contributions (pts)</div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <div>Contradiction</div>
                        <div className="text-right">{active.result?.contribs?.contradiction ?? 0}</div>
                        <div>Time</div>
                        <div className="text-right">{active.result?.contribs?.time ?? 0}</div>
                        <div>Identity</div>
                        <div className="text-right">{active.result?.contribs?.identity ?? 0}</div>
                        <div>Logic</div>
                        <div className="text-right">{active.result?.contribs?.logic ?? 0}</div>
                        <div>Evidence bonus</div>
                        <div className="text-right">+{active.result?.contribs?.evidenceBonus ?? 0}</div>
                        <div>Assumption penalty</div>
                        <div className="text-right">-{active.result?.contribs?.assumptionPenalty ?? 0}</div>
                        <div>Resonance nudge</div>
                        <div className="text-right">
                          {(() => {
                            const n = active.result?.contribs?.resonanceNudge ?? 0;
                            return `${n >= 0 ? "+" : ""}${n}`;
                          })()}
                        </div>
                        <div className="font-medium">Final depth</div>
                        <div className="text-right font-medium">{active.result?.contribs?.finalDepth ?? 0}</div>
                      </div>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <div className="mb-1 text-[10px] text-slate-500">Audit trail</div>
                      <div className="space-y-1 text-[11px]">
                        <div>
                          Evidence: {active.result?.audit?.evidenceCount ?? 0} • Counters: {active.result?.audit?.counterCount ?? 0}
                        </div>
                        <div>Assumptions: {active.result?.audit?.assumptionCount ?? 0}</div>
                        <div>
                          Absolutes:
                          {(active.result?.audit?.absolutes ?? []).length
                            ? ` ${(active.result?.audit?.absolutes ?? []).join(", ")}`
                            : " —"}
                        </div>
                        <div>Vague pronouns: {active.result?.audit?.vaguePronouns ?? 0}</div>
                        <div>
                          Time refs:
                          {(active.result?.audit?.timeRefs ?? []).length
                            ? ` ${(active.result?.audit?.timeRefs ?? []).join(", ")}`
                            : " —"}
                        </div>
                      </div>
                    </div>
                  </div>
                  {(((active.result?.notes?.length ?? 0) > 0) || (active.result?.rigor?.guidance?.length ?? 0) > 0) && (
                    <div className="mt-2 text-[11px] text-slate-600">
                      <div className="mb-1 font-medium">Next actions</div>
                      <ul className="list-disc space-y-1 pl-4">
                        {(active.result?.notes ?? []).map((note, index) => (
                          <li key={index}>{note}</li>
                        ))}
                        {(active.result?.rigor?.guidance ?? []).map((guideline, index) => (
                          <li key={`guideline-${index}`}>
                            {guideline} <span className="opacity-70">(Rigor: {active.result?.rigor?.level ?? "—"})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4" /> Model & Weights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["contradiction", "Contradiction weight"],
                  ["time", "Time weight"],
                  ["identity", "Identity weight"],
                  ["logic", "Logic weight"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{label}</span>
                      <span>{(normalizedWeights[key] * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[weights[key]]}
                      onValueChange={([value]) => setWeights({ ...weights, [key]: value })}
                      max={1}
                      step={0.01}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Resonance influence</span>
                    <span>{weights.resonanceInfluence}%</span>
                  </div>
                  <Slider
                    value={[weights.resonanceInfluence]}
                    onValueChange={([value]) => setWeights({ ...weights, resonanceInfluence: value })}
                    max={30}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Evidence bonus max</span>
                    <span>{weights.evidenceBonusMax}</span>
                  </div>
                  <Slider
                    value={[weights.evidenceBonusMax]}
                    onValueChange={([value]) => setWeights({ ...weights, evidenceBonusMax: value })}
                    max={20}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Evidence bonus / item</span>
                    <span>{weights.evidenceBonusPer}</span>
                  </div>
                  <Slider
                    value={[weights.evidenceBonusPer]}
                    onValueChange={([value]) => setWeights({ ...weights, evidenceBonusPer: value })}
                    max={10}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Assumption penalty / item</span>
                    <span>{weights.assumptionPenaltyPer}</span>
                  </div>
                  <Slider
                    value={[weights.assumptionPenaltyPer]}
                    onValueChange={([value]) => setWeights({ ...weights, assumptionPenaltyPer: value })}
                    max={10}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Assumption free threshold</span>
                    <span>{weights.assumptionPenaltyThreshold}</span>
                  </div>
                  <Slider
                    value={[weights.assumptionPenaltyThreshold]}
                    onValueChange={([value]) => setWeights({ ...weights, assumptionPenaltyThreshold: value })}
                    min={0}
                    max={6}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={autoRecalc} onCheckedChange={setAutoRecalc} />
                  <span className="text-xs">Auto re-run on weight change</span>
                </div>
                <Button variant="outline" size="sm" onClick={runScan}>
                  <Play className="mr-1 h-4 w-4" /> Re-run scan
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                The four core weights auto-normalize to 100%. Resonance influence applies after base scoring.
              </p>
            </CardContent>
          </Card>

          <SelfTests />

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recursive Loops</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ensureArray(active.loops).length === 0 && (
                <div className="text-xs text-slate-500">
                  Save snapshots as you refine. Each loop records a step in your thinking.
                </div>
              )}
              <div className="space-y-2">
                {ensureArray(active.loops).map((loop) => (
                  <div key={loop.id} className="rounded-lg bg-slate-100/70 p-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{new Date(loop.createdAt).toLocaleString()}</span>
                      <Badge variant="secondary">{loop.result?.status ?? "draft"}</Badge>
                    </div>
                    <div className="mt-1 text-sm font-medium">{saveTitleFromClaim(loop.claim)}</div>
                    {loop.result && (
                      <div className="mt-1 grid grid-cols-4 gap-2 text-[10px] text-slate-500">
                        <div>Depth: {loop.result.depth}</div>
                        <div>Contradiction: {loop.result.coherence.contradiction}</div>
                        <div>Time: {loop.result.coherence.time}</div>
                        <div>Logic: {loop.result.coherence.logic}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">How this page surfaces truth</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs leading-6 text-slate-600">
              <div>
                <strong>1. Ground a single claim</strong> → Name the subject and scope.
              </div>
              <div>
                <strong>2. Pull in evidence & counters</strong> → Treat counters as assets, not threats.
              </div>
              <div>
                <strong>3. Run REF checks</strong> → Contradiction, Time, Identity, Logic. Depth blends them by your weights, adds bonuses/penalties, then optional Resonance nudge.
              </div>
              <div>
                <strong>4. Explanation layer</strong> → Shows inputs, math, contributions, audit trail, and concrete next steps based on your stakes.
              </div>
              <div>
                <strong>5. Iterate mini-loops</strong> → Save snapshots, tighten wording, replace assumptions with data.
              </div>
              <div>
                <strong>6. Keep what survives</strong> → Export Truth Card JSON for your archive.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="pt-2 text-xs text-slate-500">
        Built with the REF lens. Status codes: <span className="font-mono">△∅</span> shallow, <span className="font-mono">⟁~</span> resonant,
        OK strong.
      </footer>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
      {hint && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-4 w-4 text-slate-500" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full transition-all ${pctColor(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">{children}</span>;
}

function SelfTests() {
  const [results, setResults] = useState<Array<{ name: string; pass: boolean; message?: string }> | null>(null);

  function run() {
    const output: Array<{ name: string; pass: boolean; message?: string }> = [];

    const record = (name: string, assertion: () => void) => {
      try {
        assertion();
        output.push({ name, pass: true });
      } catch (error) {
        output.push({
          name,
          pass: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const expectEqual = (actual: number, expected: number, tolerance = 0) => {
      if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`Expected ${expected}, received ${actual}`);
      }
    };

    record("Contradiction balances evidence", () => {
      const value = scoreContradiction(
        [
          { id: "1", text: "Item" },
          { id: "2", text: "Item" },
          { id: "3", text: "Item" },
        ],
        [{ id: "c1", text: "Counter" }]
      );
      expectEqual(value, 75);
    });

    record("Contradiction defaults conservatively", () => {
      const value = scoreContradiction([], []);
      expectEqual(value, 40);
    });

    record("Time scoring rewards precise references", () => {
      const refs = ["march", "2024"];
      const value = scoreTime(refs, "Happened in March 2024", "Claim");
      expectEqual(value, 90);
    });

    record("Identity penalizes vague pronouns", () => {
      const value = scoreIdentity("", "They always win");
      expectEqual(value, 45);
    });

    record("Logic penalizes absolutes and assumptions", () => {
      const value = scoreLogic("Everyone always fails", ["a", "b", "c", "d"]);
      expectEqual(value, 44);
    });

    record("Depth combines components and resonance", () => {
      const coherence = { contradiction: 80, time: 70, identity: 60, logic: 90 };
      const contribs = computeDepth(
        coherence,
        3,
        1,
        { resonanceForecaster: true, depthIntegrityScan: true, witnessMode: true },
        { clarity: 70, tension: 30, openness: 80 },
        defaultWeights
      );
      expectEqual(contribs.finalDepth, 77, 0);
      expectEqual(contribs.baseBeforeResonance, 84, 0);
      expectEqual(contribs.resonanceNudge, -7, 0);
    });

    setResults(output);
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" /> Built-in Self Tests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">
          Quick smoke-checks on scoring helpers. Useful when editing weight logic or coherence heuristics.
        </p>
        <Button size="sm" onClick={run}>
          <Play className="mr-2 h-4 w-4" /> Run self-tests
        </Button>
        {results && (
          <ul className="space-y-2">
            {results.map((result) => (
              <li key={result.name} className="flex items-start gap-2 text-xs">
                {result.pass ? (
                  <CheckCircle2 className="mt-[2px] h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="mt-[2px] h-4 w-4 text-rose-500" />
                )}
                <div>
                  <div className="font-medium">{result.name}</div>
                  {!result.pass && result.message && <div className="text-slate-500">{result.message}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
