/**
 * Guided query: one question at a time, writes the same QueryDraft the builder hydrates.
 */
import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { callTool } from "../../api";
import {
  ChildChain,
  ChildHop,
  ChildRel,
  FieldInfo,
  OsSearchResult,
  QueryParam,
  RelatedWhere,
  Tenant,
  WhereCondition,
} from "../../types";
import {
  appendRelatedHop,
  emptyHop,
  emptyRelatedWhere,
  extractSavedQueries,
  mergeFieldMeta,
  mergeRels,
  parseDomainValues,
  parseObjectAttributes,
  parseRelatedObjects,
  parseSubschemaFields,
  relatedCondsAt,
  relatedHasConds,
  searchNamesFrom,
  setRelatedCondsAt,
  splitProperties,
  trimRelatedHops,
  type DomainValue,
} from "../../lib/schema";
import { fetchRelsForObject } from "../../lib/mboRels";
import {
  assistInfer,
  assistNeedsWarmup,
  assistOn,
  AssistStep,
  clearAssistHealthCache,
  endAssistSession,
  ensureAssistModel,
  lastAssistError,
  lastAssistHealth,
  lastAssistSessionExpired,
  parentSearchKeyword,
  setAssistOn,
  startAssistSession,
} from "../../lib/assist";
import { pickInsight } from "../../lib/insights";
import { matchFields, mergeFieldNames, usefulOrFallback } from "../../lib/usefulFields";
import { emptyDraft, QueryDraft, draftToRelatedWhere } from "../../lib/queryDraft";
import {
  pickBestOs,
  pickDemoHop2,
  pickDemoRel,
  pickNamed,
  TOUR_EVENT,
  tourDone,
} from "../../lib/tourBridge";
import { isTouring } from "../../lib/tour";
import { TOUR_PARENT_FIELDS, TOUR_WHERE } from "../../lib/tour/example";
import { relatedSelectsFromQuery, fieldsForRelatedSelect } from "../../lib/displayConfig";
import ThemeToggle, { AssistToggle } from "../ThemeToggle";
import Brand from "../Brand";
import ResyncButton from "../ResyncButton";
import { Icon, faArrowLeft, faArrowRight, faHouse, faPlay, faSliders } from "../Icon";
import AdminButton from "../settings/AdminButton";
import { useAdmin } from "../settings/AdminProvider";
import InsightStamp from "./InsightStamp";
import RecipeRail from "./RecipeRail";
import WizAssistPanel from "./WizAssistPanel";
import WizCondList from "./WizCondList";
import TimelineCard from "../builder/TimelineCard";
import DomainInternalCard from "../builder/DomainInternalCard";
import WizFieldPick from "./WizFieldPick";
import WizRelList from "./WizRelList";
import WizTrail from "./WizTrail";
import WizProgress, { wizardPhaseId, wizardPhases } from "./WizProgress";
import WizHopPath from "./WizHopPath";
import WizHopCard, { hopsFromChain, hopsFromRelated } from "./WizHopCard";

type Step =
  | "intent"
  | "saved"
  | "os"
  | "savedPick"
  | "fields"
  | "children"
  | "childFields"
  | "childHopNext"
  | "childHopPick"
  | "parentWhere"
  | "relatedWant"
  | "relatedPick"
  | "relatedNext"
  | "relatedConds"
  | "childFilterWant"
  | "childFilterNext"
  | "childFilterPick"
  | "childFilterConds"
  | "sort"
  | "displayWant"
  | "displayPick"
  | "displayFields"
  | "displayNext"
  | "page"
  | "review";

export default function Wizard({
  tenant,
  onHome,
  onOpenBuilder,
  onResync,
}: {
  tenant: Tenant;
  onHome: () => void;
  onOpenBuilder: (draft: QueryDraft, execute?: boolean) => void;
  onResync?: () => void;
}) {
  const [stack, setStack] = useState<Step[]>(["intent"]);
  const [draft, setDraft] = useState<QueryDraft>(emptyDraft);
  const [insight, setInsight] = useState(() => pickInsight());
  const [osQuery, setOsQuery] = useState("");
  const [osHits, setOsHits] = useState<OsSearchResult[]>([]);
  const [osSearching, setOsSearching] = useState(false);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [relations, setRelations] = useState<ChildRel[]>([]);
  const [relsByObject, setRelsByObject] = useState<Record<string, ChildRel[]>>({});
  const [primaryObject, setPrimaryObject] = useState<string | null>(null);
  const [osChildObjects, setOsChildObjects] = useState<Set<string>>(new Set());
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [childIndex, setChildIndex] = useState(0);
  const [childHopIndex, setChildHopIndex] = useState(0);
  const [childFilterIndex, setChildFilterIndex] = useState(0);
  const [childFilterHopIndex, setChildFilterHopIndex] = useState(0);
  const [hopFields, setHopFields] = useState<Record<string, FieldInfo[]>>({});
  const [childLoading, setChildLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainByField, setDomainByField] = useState<Record<string, DomainValue[]>>({});
  const [domainLoading, setDomainLoading] = useState<Record<string, boolean>>({});
  const domainTried = useRef(new Set<string>());
  const hopFieldsRef = useRef(hopFields);
  hopFieldsRef.current = hopFields;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const relationsRef = useRef(relations);
  relationsRef.current = relations;
  const relsByObjectRef = useRef(relsByObject);
  relsByObjectRef.current = relsByObject;
  const [relatedPickFrom, setRelatedPickFrom] = useState<"root" | "fromHere">("root");
  const [relatedHopIndex, setRelatedHopIndex] = useState(0);
  const [displayKey, setDisplayKey] = useState<string | null>(null);
  const [assistEnabled, setAssistEnabled] = useState(() => assistOn() && !isTouring());
  const [assistNote, setAssistNote] = useState<string | null>(null);
  const [needByStep, setNeedByStep] = useState<Record<string, string>>({});
  const [suggestOs, setSuggestOs] = useState<OsSearchResult[]>([]);
  const [suggestFields, setSuggestFields] = useState<string[]>([]);
  const [suggestRels, setSuggestRels] = useState<ChildRel[]>([]);
  const [suggestWhere, setSuggestWhere] = useState<WhereCondition[]>([]);
  const { llmConfigured } = useAdmin();
  const [touring, setTouring] = useState(isTouring);
  useEffect(() => {
    const sync = () => setTouring(isTouring());
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (touring) {
      setAssistEnabled(false);
      setAssistNote(null);
      setSuggestOs([]);
      setSuggestFields([]);
      setSuggestRels([]);
      setSuggestWhere([]);
    }
  }, [touring]);

  // One Assist conversation per wizard run (docs/DECISIONS.md MQB-007):
  // created lazily on first Assist use, reused by every step's assistInfer
  // call so later steps see what earlier steps already decided, and torn
  // down when the wizard unmounts. A cached ref (not state) is deliberate -
  // nothing should re-render off this, and it must be readable synchronously
  // for the self-heal-on-expiry path below.
  const assistSessionId = useRef<string | null>(null);
  const assistSessionPromise = useRef<Promise<string | null> | null>(null);
  async function ensureAssistSession(): Promise<string | undefined> {
    if (assistSessionId.current) return assistSessionId.current;
    if (!assistSessionPromise.current) {
      assistSessionPromise.current = startAssistSession().then((id) => {
        assistSessionId.current = id;
        return id;
      });
    }
    const id = await assistSessionPromise.current;
    return id ?? undefined;
  }
  /** Call after every assistInfer(..., sessionId) in this component - if the
   * session had idle-expired server-side, drop the cached id so the next
   * call transparently starts a fresh one instead of 404-ing forever. */
  function noteAssistSessionOutcome() {
    if (lastAssistSessionExpired()) {
      assistSessionId.current = null;
      assistSessionPromise.current = null;
    }
  }
  useEffect(() => {
    return () => {
      if (assistSessionId.current) endAssistSession(assistSessionId.current);
    };
  }, []);

  const step = stack[stack.length - 1];
  const patch = (p: Partial<QueryDraft>) => setDraft((d) => ({ ...d, ...p }));

  function go(next: Step) {
    setStack((s) => [...s, next]);
  }
  function goReplace(next: Step) {
    setStack((s) => (s.length ? [...s.slice(0, -1), next] : [next]));
  }
  function back() {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setError(null);
  }
  function popTo(target: Step) {
    setError(null);
    setStack((s) => {
      const i = s.lastIndexOf(target);
      if (i >= 0) return s.slice(0, i + 1);
      return [...s, target];
    });
  }

  const firstInsight = useRef(true);
  useEffect(() => {
    if (firstInsight.current) {
      firstInsight.current = false;
      return;
    }
    setInsight((prev) => pickInsight(prev.id));
    setSuggestOs([]);
    setSuggestFields([]);
    setSuggestRels([]);
    setSuggestWhere([]);
  }, [step]);

  useEffect(() => {
    if (isTouring() || !assistEnabled) return;
    void toggleAssist(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipOsDebounce = useRef(false);
  const osAutoKey = useRef("");

  useEffect(() => {
    if (skipOsDebounce.current) {
      skipOsDebounce.current = false;
      return;
    }
    if (!osQuery.trim()) {
      setOsHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchOs(osQuery);
    }, 280);
    return () => window.clearTimeout(t);
  }, [osQuery, tenant.id]);

  useEffect(() => {
    if (step !== "os" || !assistEnabled) {
      if (!assistEnabled) osAutoKey.current = "";
      return;
    }
    if (isTouring()) return;
    const intent = draft.intent.trim();
    if (!intent) {
      setAssistNote("Turn Assist on after you write an intent - I'll extract a search word and query Maximo.");
      return;
    }
    if (osAutoKey.current === intent) return;
    osAutoKey.current = intent;
    void runSuggest("os", "os");
    // runSuggest is recreated each render; we gate with osAutoKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, assistEnabled, draft.intent]);

  async function searchOs(q: string): Promise<OsSearchResult[]> {
    setOsSearching(true);
    try {
      const res = await callTool<{ results?: OsSearchResult[] }>(tenant.id, "maximo_get_metadata", {
        uri: `maximo://os/search/${encodeURIComponent(q)}`,
      });
      const hits = res?.results ?? [];
      setOsHits(hits);
      return hits;
    } catch (e) {
      setError(String(e));
      return [];
    } finally {
      setOsSearching(false);
    }
  }

  async function pickOs(hit: OsSearchResult) {
    setLoadingSchema(true);
    setError(null);
    try {
      const [schemaRes, relatedRes, compact, attrRaw] = await Promise.all([
        callTool(tenant.id, "maximo_get_metadata", { uri: `maximo://os/${hit.osName}/schema` }),
        callTool(tenant.id, "maximo_get_metadata", { uri: `maximo://os/${hit.osName}/relatedObjects` }),
        hit.primaryObject
          ? fetchRelsForObject(tenant.id, hit.primaryObject)
          : Promise.resolve([] as ChildRel[]),
        hit.primaryObject
          ? callTool(tenant.id, "maximo_get_metadata", {
              uri: `maximo://object/${hit.primaryObject}/attributes`,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const { fields: schemaFields, relations: schemaRels } = splitProperties(schemaRes);
      const attrFields = attrRaw ? parseObjectAttributes(attrRaw) : [];
      const f = mergeFieldMeta(schemaFields, attrFields);
      const relatedRels = parseRelatedObjects(relatedRes);
      const osRels = relatedRels.length ? relatedRels : schemaRels;
      const merged = mergeRels(osRels, compact);
      const osNames = new Set(osRels.map((r) => r.objectName.toUpperCase()));
      setFields(f);
      setRelations(merged);
      setOsChildObjects(osNames);
      setPrimaryObject(hit.primaryObject ?? null);
      if (hit.primaryObject) {
        setRelsByObject({ [hit.primaryObject]: compact });
      } else {
        setRelsByObject({});
      }
      const queries = extractSavedQueries(hit.meta?.queryCapability);
      const suggested = matchFields(f, draft.intent);
      patch({
        osHit: hit,
        savedQueries: queries,
        savedQuery: null,
        savedParams: {},
        selected: suggested,
        selectAll: false,
        childRels: [],
        childSelected: {},
        childSelectAll: {},
        childChains: [],
        relatedFilter: null,
        relatedWhere: [],
        relatedRel: null,
        relatedConds: [],
        childConditions: {},
      });
      setDomainByField({});
      setDomainLoading({});
      domainTried.current = new Set();
      setOsQuery(hit.osName);
      setOsHits([]);
      go(draft.wantSaved ? "savedPick" : "fields");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingSchema(false);
    }
  }


  const childChain = draft.childChains[childIndex];
  const childHop = childChain?.hops[Math.min(childHopIndex, Math.max(0, (childChain?.hops.length ?? 1) - 1))];
  const filterChain = draft.childChains[childFilterIndex];
  const displayItems = relatedSelectsFromQuery(draft.childChains, []);
  const displayItem = displayItems.find((i) => i.key === displayKey) ?? null;
  const filterLeaf = filterChain?.hops[filterChain.hops.length - 1];
  const filterHop = filterChain?.hops[Math.min(childFilterHopIndex, Math.max(0, (filterChain?.hops.length ?? 1) - 1))];
  const relatedHops = draft.relatedFilter?.hops ?? [];
  const relatedLeaf = relatedHops[relatedHops.length - 1];
  const relatedHop = relatedHops[Math.min(relatedHopIndex, Math.max(0, relatedHops.length - 1))];
  const relatedHopConds = draft.relatedFilter ? relatedCondsAt(draft.relatedFilter, relatedHopIndex) : [];

  async function loadRels(objectName: string) {
    if (!objectName || relsByObjectRef.current[objectName] !== undefined) return;
    relsByObjectRef.current = { ...relsByObjectRef.current, [objectName]: [] };
    setRelsByObject((prev) => ({ ...prev, [objectName]: prev[objectName] ?? [] }));
    try {
      const res = await fetchRelsForObject(tenant.id, objectName);
      relsByObjectRef.current = { ...relsByObjectRef.current, [objectName]: res };
      setRelsByObject((prev) => ({ ...prev, [objectName]: res }));
    } catch {
      setRelsByObject((prev) => ({ ...prev, [objectName]: prev[objectName] ?? [] }));
    }
  }

  function isOsChild(objectName: string) {
    return osChildObjects.has(objectName.toUpperCase());
  }

  useEffect(() => {
    if (step !== "childFields" && step !== "childHopNext" && step !== "childHopPick") return;
    if (!childHop?.objectName || !draft.osHit) return;
    void loadHopFields(childHop.objectName, childHop.inOs);
    void loadRels(childHop.objectName);
  }, [step, childHop?.objectName, childHop?.inOs, draft.osHit, tenant.id]);

  useEffect(() => {
    if (step !== "displayFields" || !displayItem?.objectName || !draft.osHit) return;
    void loadHopFields(displayItem.objectName, isOsChild(displayItem.objectName));
  }, [step, displayItem?.objectName, draft.osHit, tenant.id]);

  async function loadHopFields(objectName: string, osChild?: boolean) {
    if (!objectName || !draft.osHit) return;
    if (objectName in hopFieldsRef.current && hopFieldsRef.current[objectName].length) return;
    const inOs = osChild ?? isOsChild(objectName);
    const osName = draft.osHit.osName;
    setHopFields((prev) => (objectName in prev ? prev : { ...prev, [objectName]: [] }));
    setChildLoading(true);
    try {
      let f: FieldInfo[] = [];
      if (inOs) {
        const [sub, attrs] = await Promise.all([
          callTool(tenant.id, "maximo_get_metadata", { uri: `maximo://os/${osName}/subschemas/${objectName}` }),
          callTool(tenant.id, "maximo_get_metadata", { uri: `maximo://object/${objectName}/attributes` }).catch(() => null),
        ]);
        f = mergeFieldMeta(parseSubschemaFields(sub, objectName), attrs ? parseObjectAttributes(attrs) : []);
      } else {
        const attrs = await callTool(tenant.id, "maximo_get_metadata", {
          uri: `maximo://object/${objectName}/attributes`,
        });
        f = parseObjectAttributes(attrs);
      }
      hopFieldsRef.current = { ...hopFieldsRef.current, [objectName]: f };
      setHopFields((prev) => ({ ...prev, [objectName]: f }));
    } catch {
      hopFieldsRef.current = { ...hopFieldsRef.current, [objectName]: [] };
      setHopFields((prev) => ({ ...prev, [objectName]: [] }));
    } finally {
      setChildLoading(false);
    }
  }

  useEffect(() => {
    if (relatedHopIndex >= relatedHops.length) setRelatedHopIndex(Math.max(0, relatedHops.length - 1));
  }, [relatedHopIndex, relatedHops.length]);

  useEffect(() => {
    if (!relatedHop?.objectName || !draft.osHit) return;
    void loadHopFields(relatedHop.objectName);
    void loadRels(relatedHop.objectName);
  }, [relatedHop?.objectName, draft.osHit, tenant.id]);

  useEffect(() => {
    if (!relatedLeaf?.objectName || !draft.osHit) return;
    void loadHopFields(relatedLeaf.objectName);
    void loadRels(relatedLeaf.objectName);
  }, [relatedLeaf?.objectName, draft.osHit, tenant.id]);

  useEffect(() => {
    if (!filterLeaf?.objectName || !draft.osHit) return;
    void loadHopFields(filterLeaf.objectName);
    void loadRels(filterLeaf.objectName);
  }, [filterLeaf?.objectName, draft.osHit, tenant.id, step]);

  useEffect(() => {
    if (step !== "childFilterConds" || !filterHop?.objectName || !draft.osHit) return;
    void loadHopFields(filterHop.objectName);
    void loadRels(filterHop.objectName);
  }, [step, filterHop?.objectName, draft.osHit, tenant.id]);

  useEffect(() => {
    if (step === "relatedPick" && relatedPickFrom === "root" && primaryObject) void loadRels(primaryObject);
  }, [step, primaryObject, tenant.id]);

  async function loadDomain(field: string) {
    const osName = draft.osHit?.osName;
    if (!osName || !primaryObject || !field) return;
    const key = field.toLowerCase();
    if (domainTried.current.has(key)) return;
    domainTried.current.add(key);
    setDomainLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await callTool(tenant.id, "maximo_get_metadata", {
        uri: `maximo://os/${osName}/object/${primaryObject}/attributes/${field}`,
      });
      const values = parseDomainValues(res, field);
      if (values.length) setDomainByField((prev) => ({ ...prev, [key]: values }));
    } catch {
      /* typed input still works */
    } finally {
      setDomainLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  function syncChildChains() {
    setDraft((d) => {
      const chains = d.childRels.map((rel) => {
        const existing = d.childChains.find((c) => c.hops[0]?.relationship === rel.relation);
        return existing ?? { hops: [emptyHop(rel)] };
      });
      return { ...d, childChains: chains };
    });
  }

  function hopSearchFields(objectName: string, names: string[]): string[] {
    return searchNamesFrom(hopFieldsRef.current[objectName] ?? hopFields[objectName] ?? [], names);
  }

  function patchCurrentChildHop(patch: Partial<ChildHop>) {
    const chain = draft.childChains[childIndex];
    if (!chain) return;
    const hi = Math.min(childHopIndex, Math.max(0, chain.hops.length - 1));
    const next = patch.searchFields && chain.hops[hi]
      ? { ...patch, searchFields: hopSearchFields(chain.hops[hi].objectName, patch.searchFields) }
      : patch;
    patchChildChain(childIndex, {
      hops: chain.hops.map((h, i) => (i === hi ? { ...h, ...next } : h)),
    });
  }

  function childHopTrail(onHop: (index: number) => void) {
    const chain = draft.childChains[childIndex];
    if (!chain) return null;
    return (
      <WizTrail
        home={{ label: "Children", onClick: () => popTo("children") }}
        hops={chain.hops.map((h, hi) => ({
          label: h.relationship,
          title: h.objectName,
          current: hi === childHopIndex && step !== "children",
          onClick: () => onHop(hi),
          onRemove: hi > 0
            ? () => {
                patchChildChain(childIndex, { hops: chain.hops.slice(0, hi) });
                setChildHopIndex(hi - 1);
                goReplace("childFields");
              }
            : undefined,
        }))}
      />
    );
  }

  function nextChildOrWhere() {
    if (childIndex + 1 < draft.childRels.length) {
      setChildIndex(childIndex + 1);
      setChildHopIndex(0);
      goReplace("childFields");
    } else {
      go("parentWhere");
    }
  }

  function goChildFilterOrSort() {
    commitRelatedFilter();
    if (draft.childRels.length === 0) return goReplace("sort");
    setChildFilterIndex(0);
    setChildFilterHopIndex(0);
    goReplace("childFilterWant");
  }

  function nextChildFilterOrSort() {
    if (childFilterIndex + 1 < draft.childChains.length) {
      setChildFilterIndex(childFilterIndex + 1);
      setChildFilterHopIndex(0);
      go("childFilterWant");
    } else {
      go("sort");
    }
  }

  function patchChildChain(index: number, next: ChildChain) {
    setDraft((d) => ({
      ...d,
      childChains: d.childChains.map((c, i) => (i === index ? next : c)),
    }));
  }

  function patchRelatedFilter(next: RelatedWhere) {
    setDraft((d) => ({ ...d, relatedFilter: next }));
  }

  function pickRelatedRel(r: ChildRel) {
    if (relatedPickFrom === "fromHere" && draft.relatedFilter) {
      const next = appendRelatedHop(draft.relatedFilter, r);
      patchRelatedFilter(next);
      setRelatedHopIndex(next.hops.length - 1);
    } else {
      patchRelatedFilter(emptyRelatedWhere(r));
      setRelatedHopIndex(0);
    }
    void loadHopFields(r.objectName, r.inOs);
    void loadRels(r.objectName);
    goReplace("relatedNext");
  }

  function addChildHop(rel: ChildRel) {
    const chain = draft.childChains[childIndex];
    if (!chain) return;
    const hop = emptyHop(rel);
    patchChildChain(childIndex, { hops: [...chain.hops, hop] });
    setChildHopIndex(chain.hops.length);
    void loadHopFields(rel.objectName, rel.inOs);
    void loadRels(rel.objectName);
    goReplace("childFields");
  }

  function addChildFilterHop(rel: ChildRel) {
    const chain = draft.childChains[childFilterIndex];
    if (!chain) return;
    const hop = emptyHop(rel);
    hop.selectAll = true;
    hop.conditions = [];
    patchChildChain(childFilterIndex, { hops: [...chain.hops, hop] });
    void loadHopFields(rel.objectName, rel.inOs);
    void loadRels(rel.objectName);
    setChildFilterHopIndex(chain.hops.length);
    goReplace("childFilterNext");
  }

  function commitRelatedFilter() {
    setDraft((d) => {
      const f = d.relatedFilter;
      if (!f?.hops.length || !relatedHasConds(f)) {
        return { ...d, relatedFilter: null };
      }
      return { ...d, relatedWhere: [...d.relatedWhere, f], relatedFilter: null };
    });
  }

  function focusRelatedHop(hi: number) {
    setRelatedHopIndex(hi);
    goReplace("relatedNext");
  }

  function dropRelatedHopsFrom(hi: number) {
    const cur = draft.relatedFilter;
    if (!cur) return;
    patchRelatedFilter(trimRelatedHops(cur, hi));
    setRelatedHopIndex(Math.max(0, hi - 1));
    setRelatedPickFrom(hi <= 1 ? "root" : "fromHere");
    goReplace("relatedNext");
  }

  function pathLabel(hops: { relationship: string }[]) {
    return hops.map((h) => h.relationship).join(" -> ");
  }

  async function toggleAssist(on: boolean) {
    setAssistOn(on);
    setAssistEnabled(on);
    if (!on) {
      setAssistNote(null);
      return;
    }
    clearAssistHealthCache();
    setAssistNote("checking Assist...");
    const ok = await ensureAssistModel();
    const health = lastAssistHealth();
    if (ok) {
      const model = health?.model ?? "model";
      setAssistNote(
        assistNeedsWarmup()
          ? `Assist ready (${model}). First suggestion can take a couple of minutes while the model loads.`
          : `Assist ready (${model})`,
      );
    } else {
      setAssistNote(health?.reason ? `Assist unavailable - ${health.reason}` : "Assist unavailable");
    }
  }

  async function improveIntent() {
    const raw = draft.intent.trim();
    if (!raw) return;
    setBusy(true);
    setAssistNote("Rewriting in Maximo language...");
    try {
      const ok = await ensureAssistModel(true);
      if (!ok) {
        setAssistNote(lastAssistHealth()?.reason ?? "Assist unavailable");
        return;
      }
      const sessionId = await ensureAssistSession();
      const out = await assistInfer({ intent: raw, step: "intentRewrite" }, sessionId);
      noteAssistSessionOutcome();
      if (out?.intent) patch({ intent: out.intent });
      setAssistNote(out?.intent
        ? "Rewrote with Maximo names - edit if you want, then Continue."
        : (lastAssistError() ?? "Couldn't rewrite. Try again or keep what you have."));
    } finally {
      setBusy(false);
    }
  }

  function assistNeed(key: string) {
    return needByStep[key] ?? "";
  }
  function setAssistNeed(key: string, v: string) {
    setNeedByStep((prev) => ({ ...prev, [key]: v }));
  }

  async function runSuggest(assistStep: AssistStep, key: string) {
    setBusy(true);
    setAssistNote(assistStep === "os"
      ? (assistNeedsWarmup()
        ? "Loading the model, then extracting a search word from your intent..."
        : "Extracting a search word from your intent...")
      : (assistNeedsWarmup()
        ? "Warming up the model - first time can take a couple of minutes..."
        : "Assist is suggesting..."));
    setSuggestOs([]);
    setSuggestFields([]);
    setSuggestRels([]);
    setSuggestWhere([]);
    try {
      const ok = await ensureAssistModel(true);
      if (!ok) {
        setAssistNote(lastAssistHealth()?.reason ?? "Assist unavailable");
        return;
      }
      const sessionId = await ensureAssistSession();
      const need = assistNeed(key);
      let inferred = null as Awaited<ReturnType<typeof assistInfer>>;
      let searchedKw = "";
      if (assistStep === "os") {
        if (!draft.intent.trim() && !need) {
          setAssistNote("Add an overall intent (first step) or a note here, then try again.");
          return;
        }
        const parentKw = parentSearchKeyword(draft.intent, need);
        let keyword = parentKw;
        if (!keyword) {
          setAssistNote(assistNeedsWarmup()
            ? "Loading the model, then extracting a search word from your intent..."
            : "Extracting a search word from your intent...");
          const kw = await assistInfer({ intent: draft.intent, need, step: "osKeyword" }, sessionId);
          noteAssistSessionOutcome();
          keyword = kw?.keyword ?? null;
        }
        if (!keyword) {
          setAssistNote(lastAssistError() ?? "Could not extract a search word. Rephrase the intent, or type a search below.");
          return;
        }
        searchedKw = keyword;
        skipOsDebounce.current = true;
        setOsQuery(keyword);
        setAssistNote(`Searching object structures for "${keyword}"...`);
        const hits = await searchOs(keyword);
        if (!hits.length) {
          setAssistNote(`No object structures for "${keyword}". Try a different note or search manually.`);
          return;
        }
        setAssistNote(`Choosing the best object structure from ${hits.length} hits...`);
        inferred = await assistInfer({
          intent: draft.intent,
          need,
          step: "os",
          scene: `The user wants to LIST parent records. Rank object structures for that parent, not for related nouns after with/from.`,
          osHits: hits.slice(0, 24).map((h) => ({
            osName: h.osName,
            description: h.description,
            primaryObject: h.primaryObject,
            savedQueries: h.meta?.queryCapability?.length,
          })),
        }, sessionId);
        noteAssistSessionOutcome();
        const names = new Set(inferred?.osNames ?? []);
        const ranked = hits.filter((h) => names.has(h.osName));
        setSuggestOs(ranked);
      } else if (assistStep === "fields") {
        const pool = key.startsWith("childFields")
          ? (hopFields[childHop?.objectName ?? ""] ?? [])
          : fields;
        const osName = draft.osHit?.osName ?? "this OS";
        const mbo = draft.osHit?.primaryObject ?? primaryObject ?? "parent";
        const scene = key.startsWith("childFields") && childHop && childChain
          ? `Object structure ${osName} (primary ${mbo}).\nYou are choosing COLUMNS on ${childHop.objectName}, nested in the result via ${pathLabel(childChain.hops)}.\nThese appear under that related object, not on the parent row.`
          : `Object structure ${osName} (primary ${mbo}).\nYou are choosing COLUMNS on the parent row.`;
        inferred = await assistInfer({
          intent: draft.intent,
          need,
          step: "fields",
          scene,
          fields: pool.map((f) => ({ name: f.name, title: f.title, type: f.type, domainId: f.domainId })),
        }, sessionId);
        noteAssistSessionOutcome();
        setSuggestFields(inferred?.fields ?? []);
      } else if (assistStep === "children" || assistStep === "related") {
        const pool = assistStep === "related" && relatedPickFrom === "fromHere" && relatedLeaf
          ? (relsByObject[relatedLeaf.objectName] ?? [])
          : key.startsWith("childHopPick") && childHop
            ? (relsByObject[childHop.objectName] ?? [])
            : key.startsWith("childFilterPick") && filterLeaf
              ? (relsByObject[filterLeaf.objectName] ?? [])
              : relations;
        const osName = draft.osHit?.osName ?? "this OS";
        const mbo = draft.osHit?.primaryObject ?? primaryObject ?? "parent";
        const pickedKids = draft.childRels.map((r) => r.relation).join(", ") || "none";
        let scene: string;
        if (assistStep === "related") {
          const path = draft.relatedFilter?.hops.length
            ? pathLabel(draft.relatedFilter.hops)
            : `start from parent ${mbo}`;
          const committed = draft.relatedWhere
            .filter((f) => f.hops.length)
            .map((f) => pathLabel(f.hops))
            .join("; ") || "none";
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are picking a relationship used ONLY to FILTER which parent rows return (OSLC EXISTS / dotted where). Those related rows are NOT loaded into the result.\nCurrent path: ${path}.\nAlready committed related filters: ${committed}.`;
        } else if (key.startsWith("childHopPick") && childHop && childChain) {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are hopping DEEPER from ${childHop.objectName} to include another nested object in the result.\nCurrent path: ${pathLabel(childChain.hops)}.\nAlready picked top-level children: ${pickedKids}.`;
        } else if (key.startsWith("childFilterPick") && filterLeaf && filterChain) {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are hopping from ${filterLeaf.objectName} to FILTER which nested child rows load (childOptions where), not which parents return.\nCurrent path: ${pathLabel(filterChain.hops)}.`;
        } else {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are choosing child collections to INCLUDE in the result (nested select). This is not an EXISTS / parent filter.\nAlready picked: ${pickedKids}.`;
        }
        inferred = await assistInfer({
          intent: draft.intent,
          need,
          step: assistStep,
          scene,
          children: pool.map((r) => ({
            relation: r.relation,
            objectName: r.objectName,
            inOs: r.inOs,
            inheritedFrom: r.inheritedFrom,
            whereClause: r.whereClause,
          })),
        }, sessionId);
        noteAssistSessionOutcome();
        setSuggestRels(
          (inferred?.relations ?? [])
            .map((name) => pool.find((r) => r.relation === name))
            .filter((r): r is ChildRel => !!r),
        );
      } else if (assistStep === "where") {
        const pool = key === "parentWhere"
          ? fields
          : key === "relatedConds" && relatedHop
            ? (hopFields[relatedHop.objectName] ?? [])
            : (filterHop ? hopFields[filterHop.objectName] ?? [] : fields);
        const osName = draft.osHit?.osName ?? "this OS";
        const mbo = draft.osHit?.primaryObject ?? primaryObject ?? "parent";
        let scene: string;
        if (key === "relatedConds" && relatedHop && draft.relatedFilter) {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are writing WHERE on ${relatedHop.objectName} (hop ${relatedHop.relationship} in ${pathLabel(draft.relatedFilter.hops)}).\nThese conditions still filter PARENT rows. Other hops on this path can have their own conditions.`;
        } else if (key.startsWith("childFilterConds") && filterHop && filterChain) {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are filtering which ${filterHop.objectName} CHILD rows load, via ${pathLabel(filterChain.hops)}.\nParent ${mbo} rows still return; this only trims the nested ${filterHop.objectName} collection.`;
        } else {
          scene = `Object structure ${osName} (primary ${mbo}).\nYou are writing parent WHERE on ${mbo} attributes only (not related hops).`;
        }
        inferred = await assistInfer({
          intent: draft.intent,
          need,
          step: "where",
          scene,
          fields: pool.map((f) => ({ name: f.name, title: f.title, type: f.type, domainId: f.domainId })),
        }, sessionId);
        noteAssistSessionOutcome();
        const allowed = new Set(pool.map((f) => f.name));
        setSuggestWhere(
          (inferred?.where ?? [])
            .filter((c) => allowed.has(c.field))
            .map((c) => ({ field: c.field, op: c.op as WhereCondition["op"], value: c.value })),
        );
      }
      const health = lastAssistHealth();
      if (assistStep === "os") {
        const n = inferred?.osNames?.length ?? 0;
        setAssistNote(
          n
            ? `From "${searchedKw}" - tap a suggestion (${health?.model ?? "model"})`
            : `Searched "${searchedKw}". ${lastAssistError() ?? "Couldn't rank hits"} - pick from the list below.`,
        );
      } else {
        const has =
          (inferred?.fields?.length ?? 0) +
          (inferred?.relations?.length ?? 0) +
          (inferred?.where?.length ?? 0);
        setAssistNote(has ? `Tap a suggestion to use it (${health?.model ?? "model"})` : (lastAssistError() ?? "No suggestions - try a clearer note for this step"));
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleParentField(name: string) {
    patch({
      selectAll: false,
      selected: draft.selected.includes(name)
        ? draft.selected.filter((n) => n !== name)
        : [...draft.selected, name],
    });
  }

  function toggleChildRel(rel: ChildRel) {
    const has = draft.childRels.some((r) => r.relation === rel.relation);
    if (has) {
      patch({
        childRels: draft.childRels.filter((r) => r.relation !== rel.relation),
        childChains: draft.childChains.filter((c) => c.hops[0]?.relationship !== rel.relation),
      });
      return;
    }
    patch({
      childRels: [...draft.childRels, rel],
      childChains: [...draft.childChains, { hops: [emptyHop(rel)] }],
    });
  }

  function tapAllParentFields() {
    patch({ selectAll: false, selected: mergeFieldNames(draft.selected, suggestFields) });
  }

  function tapAllChildRels() {
    let rels = [...draft.childRels];
    let chains = [...draft.childChains];
    for (const r of suggestRels) {
      if (rels.some((x) => x.relation === r.relation)) continue;
      rels = [...rels, r];
      chains = [...chains, { hops: [emptyHop(r)] }];
    }
    patch({ childRels: rels, childChains: chains });
  }

  function tapAllParentWhere() {
    patch({ where: mergeConds(draft.where, suggestWhere) });
  }

  function continueFrom(current: Step) {
    setError(null);
    if (current === "intent") return go("saved");
    if (current === "saved") return go("os");
    if (current === "savedPick") return go("fields");
    if (current === "fields") {
      if (!draft.selectAll && draft.selected.length === 0) {
        setError("Pick * , useful fields, or at least one column.");
        return;
      }
      return go("children");
    }
    if (current === "children") {
      if (draft.childRels.length) {
        syncChildChains();
        setChildIndex(0);
        setChildHopIndex(0);
        return go("childFields");
      }
      return go("parentWhere");
    }
    if (current === "childFields") {
      return goReplace("childHopNext");
    }
    if (current === "childHopPick") {
      return goReplace("childHopNext");
    }
    if (current === "parentWhere") return go("relatedWant");
    if (current === "relatedPick") {
      if (!draft.relatedFilter?.hops.length) {
        setError("Pick a related object.");
        return;
      }
      return go("relatedNext");
    }
    if (current === "relatedConds") return go("relatedNext");
    if (current === "childFilterPick") return go("childFilterNext");
    if (current === "childFilterConds") return go("childFilterNext");
    if (current === "sort") {
      const items = relatedSelectsFromQuery(draft.childChains, []);
      return items.length ? go("displayWant") : go("page");
    }
    if (current === "displayFields") return go("displayNext");
    if (current === "page") {
      patch({ pageTouched: true });
      return go("review");
    }
  }

  const hasChildren = draft.childRels.length > 0;
  const phases = wizardPhases(hasChildren);
  const phase = wizardPhaseId(step);
  const progressDetail = (() => {
    if (phase === "children" && childChain) {
      const path = childChain.hops.map((h) => h.relationship).join(" -> ");
      return `Child ${childIndex + 1} of ${draft.childRels.length}${path ? ` | ${path}` : ""}`;
    }
    if (phase === "where" && draft.relatedFilter?.hops.length) {
      return `Related | ${pathLabel(draft.relatedFilter.hops)}`;
    }
    if (phase === "filters" && filterChain) {
      return `Child ${childFilterIndex + 1} of ${draft.childChains.length} | ${pathLabel(filterChain.hops)}`;
    }
    return undefined;
  })();
  const reduceMotion = useReducedMotion();
  const stepTx = reduceMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };

  const tourApi = useRef({ searchOs, pickOs, loadHopFields, loadRels });
  tourApi.current = { searchOs, pickOs, loadHopFields, loadRels };

  useEffect(() => {
    const onTour = async (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (!action?.startsWith("wiz-")) return;
      const api = tourApi.current;
      try {
        if (action === "wiz-start") {
          setDraft((d) => ({
            ...d,
            intent: "PM work orders with asset ancestry, location, and activities",
            wantSaved: false,
          }));
          setStack(["os"]);
        } else if (action === "wiz-os") {
          let hits = await api.searchOs("mxapiwo");
          if (!hits.length) hits = await api.searchOs("wo");
          if (!hits.length) hits = await api.searchOs("workorder");
          const hit = pickBestOs(hits);
          if (!hit) throw new Error("No object structure matched MXAPIWO on this tenant.");
          await api.pickOs(hit);
        } else if (action === "wiz-fields") {
          const names = pickNamed(fieldsRef.current, [...TOUR_PARENT_FIELDS]);
          if (!names.length) throw new Error("No fields loaded yet.");
          setDraft((d) => ({ ...d, selectAll: false, selected: names }));
        } else if (action === "wiz-children") {
          const rel = pickDemoRel(relationsRef.current);
          if (!rel) throw new Error("This OS has no relationships to hop.");
          await api.loadHopFields(rel.objectName, rel.inOs);
          await api.loadRels(rel.objectName);
          const hop = emptyHop(rel);
          hop.selectAll = false;
          hop.selected = [];
          setDraft((d) => ({ ...d, childRels: [rel], childChains: [{ hops: [hop] }] }));
          setChildIndex(0);
          setChildHopIndex(0);
          setStack((s) => {
            const kept = s.filter((x) => x !== "children" && x !== "childFields");
            if (!kept.includes("fields")) kept.push("fields");
            return [...kept, "children", "childFields"];
          });
        } else if (action === "wiz-child-fields") {
          const d = draftRef.current;
          const chain = d.childChains[0];
          const hop = chain?.hops[0];
          if (!hop) throw new Error("Add a child relationship first.");
          await api.loadHopFields(hop.objectName, hop.inOs);
          const names = pickNamed(
            hopFieldsRef.current[hop.objectName] ?? [],
            ["assetnum", "description", "status", "location", "ticketid"],
            4,
          );
          setDraft((prev) => {
            const c = prev.childChains[0];
            if (!c) return prev;
            return {
              ...prev,
              childChains: [{
                hops: c.hops.map((h, i) => (
                  i === 0 ? { ...h, selectAll: names.length === 0, selected: names, searchFields: hopSearchFields(hop.objectName, names) } : h
                )),
              }],
            };
          });
        } else if (action === "wiz-child-hop") {
          const d = draftRef.current;
          const chain = d.childChains[0];
          const leaf = chain?.hops[chain.hops.length - 1];
          if (!leaf) throw new Error("Add a child relationship first.");
          await api.loadRels(leaf.objectName);
          const nextRels = (relsByObjectRef.current[leaf.objectName] ?? []).filter(
            (r) => r.relation.toUpperCase() !== leaf.relationship.toUpperCase(),
          );
          const hop2 = pickDemoHop2(nextRels);
          if (!hop2) throw new Error("No ASSET_PARENT (or similar) hop from this object.");
          await api.loadHopFields(hop2.objectName, hop2.inOs);
          await api.loadRels(hop2.objectName);
          const hop = emptyHop(hop2);
          hop.selectAll = true;
          hop.selected = [];
          setDraft((prev) => {
            const c = prev.childChains[0];
            if (!c) return prev;
            return { ...prev, childChains: [{ hops: [...c.hops, hop] }] };
          });
          setChildHopIndex(chain.hops.length);
          setStack((s) => {
            const kept = s.filter((x) => x !== "childHopPick" && x !== "childHopNext" && x !== "childFields");
            return [...kept, "childHopNext", "childFields"];
          });
        } else if (action === "wiz-where") {
          const byLower = new Map(fieldsRef.current.map((f) => [f.name.toLowerCase(), f.name]));
          const where: WhereCondition[] = [];
          for (const c of TOUR_WHERE) {
            const field = byLower.get(c.field.toLowerCase());
            if (field) where.push({ field, op: "=", value: c.value });
          }
          if (!where.length) {
            const names = pickNamed(fieldsRef.current, ["istask", "historyflag", "worktype", "status"], 1);
            const field = names[0];
            if (!field) throw new Error("No where field available.");
            where.push({ field, op: "=", value: field.toLowerCase() === "worktype" ? "PM" : "0" });
          }
          const changedate = byLower.get("changedate") ?? "changedate";
          const status = byLower.get("status") ?? "status";
          setDraft((d) => ({
            ...d,
            savedQuery: null,
            where,
            timeline: { sign: "-", amount: 3, unit: "M", attribute: changedate },
            domainInternal: [{ field: status, value: "WAPPR" }],
          }));
          setStack((s) => {
            const kept = s.filter((x) => x !== "parentWhere" && x !== "relatedWant" && x !== "sort");
            return [...kept, "parentWhere"];
          });
        } else if (action === "wiz-sort") {
          const names = pickNamed(fieldsRef.current, ["wonum", "changedate", "status", "workorderid"], 1);
          if (!names[0]) throw new Error("No sort field available.");
          setDraft((d) => ({ ...d, sortRules: [{ field: names[0], dir: "asc" }] }));
          setStack((s) => {
            const kept = s.filter((x) => x !== "sort");
            return [...kept, "sort"];
          });
        } else if (action === "wiz-display") {
          const items = relatedSelectsFromQuery(draftRef.current.childChains, []);
          const first = items[0];
          if (first) {
            const names = first.selectAll
              ? pickNamed(hopFieldsRef.current[first.objectName] ?? [], ["assetnum", "description", "status", "owner"], 2)
              : first.fieldList.slice(0, 4);
            setDisplayKey(first.key);
            setDraft((d) => ({ ...d, displaySpec: { [first.key]: names } }));
          }
          setStack((s) => {
            const kept = s.filter((x) => !x.startsWith("display"));
            return [...kept, "displayWant", "displayNext"];
          });
        } else if (action === "wiz-page") {
          setDraft((d) => ({ ...d, pageSize: 10, pageTouched: true }));
          setStack((s) => {
            const kept = s.filter((x) => x !== "page" && x !== "review");
            return [...kept, "page", "review"];
          });
        } else {
          throw new Error("Unknown wizard tour action");
        }
        await new Promise((r) => setTimeout(r, 80));
        tourDone(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        tourDone(false, message);
      }
    };
    document.addEventListener(TOUR_EVENT, onTour);
    return () => document.removeEventListener(TOUR_EVENT, onTour);
  }, []);

  return (
    <div className={`wiz-root wiz-flow${assistEnabled ? " assist-on" : ""}`}>
      <header className="wiz-top">
        <div className="wiz-brand">
          <Brand onClick={onHome} />
        </div>
        <div className="wiz-top-actions">
          {!touring && (
            <AssistToggle
              on={assistEnabled}
              disabled={!llmConfigured}
              onChange={(v) => void toggleAssist(v)}
            />
          )}
          <AdminButton />
          <ThemeToggle />
          {onResync && <ResyncButton tenantId={tenant.id} onStarted={onResync} />}
          <button type="button" className="ghost" onClick={onHome}>
            <Icon icon={faHouse} /> Home
          </button>
        </div>
      </header>
      <WizProgress phase={phase} phases={phases} detail={step === "children" ? undefined : progressDetail} />
      {assistEnabled && assistNote && !["intent", "os", "fields", "children", "childFields", "childHopPick", "parentWhere", "relatedPick", "relatedConds", "childFilterPick", "childFilterConds", "displayWant", "displayPick", "displayFields"].includes(step) && (
        <p className="wiz-assist-banner">{assistNote}</p>
      )}

      <div className="wiz-body">
        <RecipeRail draft={draft} />
        <WizTourId.Provider value={`wiz-${step}`}>
        <AnimatePresence mode="wait">
        <motion.main
          className="wiz-stage"
          key={step}
          initial={touring ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={touring ? undefined : { opacity: 0, y: -6 }}
          transition={touring ? { duration: 0 } : stepTx}
        >
          {error && <p className="wiz-err">{error}</p>}

          {step === "intent" && (
            <Question
              kicker="Optional"
              title="What's this query for?"
              assist={assistEnabled && !touring ? (
                <WizAssistPanel
                  placeholder="optional hint for the rewrite"
                  need={assistNeed("intent")}
                  onNeed={(v) => setAssistNeed("intent", v)}
                  busy={busy}
                  note={assistNote}
                  goLabel="Rewrite in Maximo language"
                  busyLabel="Rewriting..."
                  disabled={!draft.intent.trim()}
                  onSuggest={() => void improveIntent()}
                />
              ) : undefined}
              nav={<Nav back={null} onContinue={() => continueFrom("intent")} continueLabel={draft.intent.trim() ? "Continue" : "Skip"} />}
            >
              <input
                className="wiz-line"
                autoFocus
                placeholder="asset failure report for Bedford..."
                value={draft.intent}
                onChange={(e) => patch({ intent: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && continueFrom("intent")}
              />
            </Question>
          )}

          {step === "saved" && (
            <Question kicker="Start" title="Do you already have a saved query?" nav={<Nav back={back} />}>
              <div className="wiz-choices">
                <button type="button" className={`wiz-choice${draft.wantSaved === true ? " on" : ""}`} onClick={() => { patch({ wantSaved: true }); go("os"); }}>
                  <strong>Yes</strong>
                  <span>I'll pick one from Maximo</span>
                </button>
                <button type="button" className={`wiz-choice${draft.wantSaved === false ? " on" : ""}`} onClick={() => { patch({ wantSaved: false }); go("os"); }}>
                  <strong>No</strong>
                  <span>Build from scratch</span>
                </button>
              </div>
            </Question>
          )}

          {step === "os" && (
            <Question
              kicker={draft.wantSaved ? "Find its object structure" : "Object structure"}
              title="What are you querying?"
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder="optional hint: service requests, not work orders..."
                  need={assistNeed("os")}
                  onNeed={(v) => setAssistNeed("os", v)}
                  busy={busy}
                  note={assistNote}
                  goLabel="Find from intent"
                  busyLabel={
                    assistNote?.toLowerCase().includes("choosing") ? "Picking..."
                    : assistNote?.toLowerCase().includes("search") ? "Searching..."
                    : "Extracting..."
                  }
                  onSuggest={() => {
                    osAutoKey.current = draft.intent.trim();
                    void runSuggest("os", "os");
                  }}
                >
                  {suggestOs.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggested from search - tap to use</p>
                      {suggestOs.map((h) => (
                        <button type="button" key={h.osName} className="wiz-hit suggest" onClick={() => void pickOs(h)}>
                          <span className="mono">{h.osName}</span>
                          {h.description && <span className="muted">{h.description}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} />}
            >
              <div className="wiz-os-manual">
                <p className="wiz-hint">{assistEnabled ? "Or search Maximo yourself" : "Search object structures"}</p>
                <input
                  className="wiz-line"
                  autoFocus={!assistEnabled}
                  placeholder={assistEnabled ? "assets, work orders..." : "assets, work orders..."}
                  value={osQuery}
                  onChange={(e) => setOsQuery(e.target.value)}
                />
                {osSearching && <p className="wiz-hint">Searching Maximo...</p>}
                {loadingSchema && <p className="wiz-hint">Loading schema...</p>}
                <div className="wiz-hits">
                  {osHits.map((h) => (
                    <button type="button" key={h.osName} className="wiz-hit" onClick={() => void pickOs(h)}>
                      <span className="mono">{h.osName}</span>
                      {h.description && <span className="muted">{h.description}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </Question>
          )}

          {step === "savedPick" && (
            <Question kicker="Saved query" title={draft.savedQueries.length ? "Which saved query?" : "No saved queries on this OS"} nav={<Nav back={back} onContinue={() => continueFrom("savedPick")} />}>
              {draft.savedQueries.length === 0 && (
                <p className="wiz-hint">Continue from scratch with this object structure, or go back.</p>
              )}
              <div className="wiz-hits">
                {draft.savedQueries.map((q) => (
                  <button
                    type="button"
                    key={q.name}
                    className={`wiz-hit${draft.savedQuery === q.name ? " on" : ""}`}
                    onClick={() => {
                      const params: Record<string, QueryParam> = {};
                      for (const p of q.params) params[p] = { value: "", isDynamic: false };
                      patch({ savedQuery: q.name, savedParams: params });
                    }}
                  >
                    <span className="mono">{q.name}</span>
                    {q.title && <span className="muted">{q.title}</span>}
                  </button>
                ))}
              </div>
              {draft.savedQuery && Object.keys(draft.savedParams).map((k) => (
                <label key={k} className="wiz-param">
                  {k}
                  <input
                    className="wiz-line"
                    value={draft.savedParams[k]?.value ?? ""}
                    onChange={(e) => patch({
                      savedParams: { ...draft.savedParams, [k]: { ...draft.savedParams[k], value: e.target.value } },
                    })}
                  />
                </label>
              ))}
            </Question>
          )}

          {step === "fields" && (
            <Question
              kicker="Parent row"
              title="What should each row show?"
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder="e.g. asset number, status, description..."
                  need={assistNeed("fields")}
                  onNeed={(v) => setAssistNeed("fields", v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("fields", "fields")}
                  onTapAll={tapAllParentFields}
                  tapAllCount={suggestFields.filter((n) => !draft.selected.includes(n)).length}
                >
                  {suggestFields.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestFields.map((n) => (
                          <button
                            type="button"
                            key={n}
                            className={`wiz-chip suggest${draft.selected.includes(n) ? " on" : ""}`}
                            onClick={() => toggleParentField(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("fields")} />}
            >
              <WizFieldPick
                fields={fields}
                useful={usefulOrFallback(fields, draft.intent)}
                selected={new Set(draft.selected)}
                selectAll={draft.selectAll}
                onToggle={toggleParentField}
                onSelectAll={() => patch({ selectAll: true, selected: [] })}
                onApplyUseful={() => {
                  const names = usefulOrFallback(fields, draft.intent).map((f) => f.name);
                  patch({ selectAll: false, selected: mergeFieldNames(draft.selected, names) });
                }}
                onClear={() => patch({ selectAll: false, selected: [] })}
              />
            </Question>
          )}

          {step === "children" && (
            <Question
              kicker="Related rows"
              title="Any child data in the result?"
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder="e.g. include meters and work logs..."
                  need={assistNeed("children")}
                  onNeed={(v) => setAssistNeed("children", v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("children", "children")}
                  onTapAll={tapAllChildRels}
                  tapAllCount={suggestRels.filter((r) => !draft.childRels.some((c) => c.relation === r.relation)).length}
                >
                  {suggestRels.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestRels.map((r) => (
                          <button
                            type="button"
                            key={r.relation}
                            className={`wiz-chip suggest${draft.childRels.some((c) => c.relation === r.relation) ? " on" : ""}`}
                            onClick={() => toggleChildRel(r)}
                          >
                            {r.relation}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("children")} continueLabel={draft.childRels.length ? "Continue" : "Skip"} />}
            >
              <p className="wiz-hint">Pick relationships to include in select. After each one you can hop deeper (ASSET{" -> "}SITE) or return here. Filter their rows on a later step.</p>
              {draft.childChains.some((c) => c.hops.length > 1) && (
                <p className="wiz-hint mono">
                  Paths: {draft.childChains.map((c) => c.hops.map((h) => h.relationship).join(" -> ")).join("; ")}
                </p>
              )}
              <WizRelList
                rels={relations}
                selected={new Set(draft.childRels.map((r) => r.relation))}
                onToggle={toggleChildRel}
                maxHeight={360}
              />
            </Question>
          )}

          {step === "childFields" && childHop && (
            <Question
              kicker={`Child ${childIndex + 1} / ${draft.childRels.length}`}
              title={`Columns on ${childHop.objectName}?`}
              trail={childHopTrail((hi) => {
                setChildHopIndex(hi);
                goReplace("childFields");
              })}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder={`e.g. reading and date on ${childHop.relationship}...`}
                  need={assistNeed(`childFields:${childHop.objectName}`)}
                  onNeed={(v) => setAssistNeed(`childFields:${childHop.objectName}`, v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("fields", `childFields:${childHop.objectName}`)}
                  onTapAll={() => {
                    const next = mergeFieldNames(childHop.selected, suggestFields);
                    patchCurrentChildHop({ selectAll: false, selected: next, searchFields: next });
                  }}
                  tapAllCount={suggestFields.filter((n) => !childHop.selected.includes(n)).length}
                >
                  {suggestFields.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestFields.map((n) => {
                          const sel = childHop.selected;
                          const on = sel.includes(n);
                          return (
                            <button
                              type="button"
                              key={n}
                              className={`wiz-chip suggest${on ? " on" : ""}`}
                              onClick={() => {
                                const next = on ? sel.filter((x) => x !== n) : [...sel, n];
                                patchCurrentChildHop({ selectAll: false, selected: next, searchFields: next });
                              }}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={() => popTo("children")} onContinue={() => continueFrom("childFields")} continueLabel="Continue" />}
            >
              {(childLoading || !(childHop.objectName in hopFields)) && <p className="wiz-hint">Loading fields...</p>}
              {childChain && (
                <WizHopCard
                  purpose="These objects load as nested rows in the result."
                  hops={hopsFromChain(childChain.hops)}
                />
              )}
              <WizFieldPick
                fields={hopFields[childHop.objectName] ?? []}
                useful={usefulOrFallback(hopFields[childHop.objectName] ?? [], draft.intent)}
                selected={new Set(childHop.selected)}
                selectAll={childHop.selectAll}
                onSelectAll={() => patchCurrentChildHop({ selectAll: true, selected: [], searchFields: [] })}
                onClear={() => patchCurrentChildHop({ selectAll: false, selected: [], searchFields: [] })}
                onApplyUseful={() => {
                  const names = usefulOrFallback(hopFields[childHop.objectName] ?? [], draft.intent).map((f) => f.name);
                  const next = mergeFieldNames(childHop.selected, names);
                  patchCurrentChildHop({ selectAll: false, selected: next, searchFields: next });
                }}
                onToggle={(name) => {
                  const sel = childHop.selected;
                  const on = sel.includes(name);
                  const next = on ? sel.filter((n) => n !== name) : [...sel, name];
                  patchCurrentChildHop({ selectAll: false, selected: next, searchFields: next });
                }}
              />
            </Question>
          )}

          {step === "childHopNext" && childHop && (
            <Question
              kicker={`Child ${childIndex + 1} / ${draft.childRels.length}`}
              title={`On ${childHop.objectName}, what next?`}
              trail={childHopTrail((hi) => {
                setChildHopIndex(hi);
                goReplace("childFields");
              })}
              nav={<Nav back={() => popTo("children")} />}
            >
              {childChain && (
                <WizHopCard
                  purpose="These objects load as nested rows in the result. You can hop deeper or move on."
                  hops={hopsFromChain(childChain.hops)}
                />
              )}
              <p className="wiz-hint">You can hop deeper from this object, return to the child list, or move on.</p>
              <div className="wiz-choices">
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    void loadRels(childHop.objectName);
                    goReplace("childHopPick");
                  }}
                >
                  <strong>Hop deeper</strong>
                  <span>Related data from {childHop.objectName}</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => popTo("children")}>
                  <strong>Back to child list</strong>
                  <span>Add another top-level child</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => nextChildOrWhere()}>
                  <strong>{childIndex + 1 < draft.childRels.length ? "Next child" : "Continue to Where"}</strong>
                  <span>{childIndex + 1 < draft.childRels.length ? "Keep this path and configure the next child" : "Done with related rows in the result"}</span>
                </button>
              </div>
            </Question>
          )}

          {step === "childHopPick" && childHop && (
            <Question
              kicker={`Child ${childIndex + 1} / ${draft.childRels.length}`}
              title={`Related object from ${childHop.objectName}?`}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder={`e.g. hop to site or organization from ${childHop.objectName}...`}
                  need={assistNeed(`childHopPick:${childHop.objectName}`)}
                  onNeed={(v) => setAssistNeed(`childHopPick:${childHop.objectName}`, v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("children", `childHopPick:${childHop.objectName}`)}
                >
                  {suggestRels.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to hop</p>
                      <div className="wiz-chips">
                        {suggestRels.map((r) => (
                          <button
                            type="button"
                            key={r.relation}
                            className="wiz-chip suggest"
                            onClick={() => addChildHop(r)}
                          >
                            {r.relation}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={() => goReplace("childHopNext")} onContinue={() => continueFrom("childHopPick")} continueLabel="Skip hop" />}
            >
              {childChain && (
                <WizHopCard
                  purpose="These objects load as nested rows. Pick another related object to hop deeper, or skip."
                  hops={hopsFromChain(childChain.hops)}
                />
              )}
              <WizHopPath
                home="Children"
                hops={childChain?.hops ?? []}
                activeIndex={childHopIndex}
                leafRels={relsByObject[childHop.objectName] ?? []}
                relsLoading={relsByObject[childHop.objectName] === undefined}
                onHome={() => popTo("children")}
                onJump={(hi) => {
                  setChildHopIndex(hi);
                  goReplace("childFields");
                }}
                onAddHop={addChildHop}
                onTrimHop={(hi) => {
                  const chain = draft.childChains[childIndex];
                  if (!chain || hi <= 0) return;
                  patchChildChain(childIndex, { hops: chain.hops.slice(0, hi) });
                  setChildHopIndex(hi - 1);
                  goReplace("childFields");
                }}
              />
            </Question>
          )}

          {step === "parentWhere" && (
            <Question
              kicker="Where"
              title="Conditions on this object?"
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder="e.g. site Bedford, status APPR..."
                  need={assistNeed("parentWhere")}
                  onNeed={(v) => setAssistNeed("parentWhere", v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("where", "parentWhere")}
                  onTapAll={tapAllParentWhere}
                  tapAllCount={suggestWhere.filter((c) => !draft.where.some((x) => condKey(x) === condKey(c))).length}
                >
                  {suggestWhere.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestWhere.map((c, i) => (
                          <button
                            type="button"
                            key={`${c.field}-${i}`}
                            className="wiz-chip suggest"
                            onClick={() => patch({ where: [...draft.where.filter((x) => x.field), c] })}
                          >
                            {c.field} {c.op} {c.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("parentWhere")} continueLabel="Continue" />}
            >
              <p className="wiz-hint">Primary attributes only. Related-object filters come next.</p>
              <WizCondList
                fields={fields}
                conds={draft.where}
                onChange={(where) => patch({ where })}
                onNeedDomain={loadDomain}
                domainByField={domainByField}
                domainLoading={domainLoading}
                orMode={draft.orMode}
                onOrMode={(orMode) => patch({ orMode })}
                orModeHint="Parent oslc.where - Maximo replaces AND with OR (orMode)."
              />
              <TimelineCard
                fields={fields}
                value={draft.timeline}
                onChange={(timeline) => patch({ timeline })}
                tour="wiz-timeline"
              />
              <DomainInternalCard
                fields={fields}
                clauses={draft.domainInternal}
                onChange={(domainInternal) => patch({ domainInternal })}
              />
            </Question>
          )}

          {step === "relatedWant" && (
            <Question kicker="Where | related" title="Filter by a related object?" nav={<Nav back={back} />}>
              <p className="wiz-hint">
                Parents come back only if a matching related row exists. This does not load those children into the result.
                On a hop path, tap a hop to set WHERE on that object - same as child options.
              </p>
              {draft.relatedWhere.length > 0 && (
                <p className="wiz-hint">
                  Already set: {draft.relatedWhere.map((f) => f.hops.map((h) => h.relationship).join(" -> ")).join("; ")}
                </p>
              )}
              <div className="wiz-choices row">
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    setRelatedPickFrom("root");
                    if (draft.relatedFilter?.hops.length) {
                      setRelatedHopIndex(draft.relatedFilter.hops.length - 1);
                      go("relatedNext");
                    } else go("relatedPick");
                  }}
                >
                  <strong>Yes</strong>
                  <span>Pick a related object</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => goChildFilterOrSort()}
                >
                  <strong>No</strong>
                  <span>Skip</span>
                </button>
              </div>
            </Question>
          )}

          {step === "relatedPick" && (
            <Question
              kicker="Where | related"
              title={relatedPickFrom === "fromHere" && relatedLeaf
                ? `Related object from ${relatedLeaf.objectName}?`
                : "Which related object?"}
              trail={(
                <WizTrail
                  home={{ label: "Where", onClick: () => popTo("parentWhere") }}
                  hops={(draft.relatedFilter?.hops ?? []).map((h, hi) => ({
                    label: h.relationship,
                    title: `${h.objectName} - tap to set WHERE on this hop`,
                    current: hi === relatedHopIndex,
                    onClick: () => focusRelatedHop(hi),
                    onRemove: hi > 0
                      ? () => dropRelatedHopsFrom(hi)
                      : undefined,
                  }))}
                />
              )}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder="e.g. filter by site, organization..."
                  need={assistNeed("relatedPick")}
                  onNeed={(v) => setAssistNeed("relatedPick", v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("related", "relatedPick")}
                >
                  {suggestRels.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to use</p>
                      <div className="wiz-chips">
                        {suggestRels.map((r) => (
                          <button
                            type="button"
                            key={r.relation}
                            className="wiz-chip suggest"
                            onClick={() => pickRelatedRel(r)}
                          >
                            {r.relation}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("relatedPick")} />}
            >
              <p className="wiz-hint">
                {relatedPickFrom === "fromHere"
                  ? "Next related object from the last hop. Tap a hop in the trail to set WHERE on that object - x shortens the path."
                  : "From this object's relationships. After you pick, you'll see the join clause - go back if it's the wrong door. Tap a hop to set WHERE on that object."}
              </p>
              {draft.relatedFilter && draft.relatedFilter.hops.length > 0 && (
                <WizHopCard
                  purpose="This path filters which parent rows return. It does not load these related rows into the result."
                  hops={hopsFromRelated(draft.relatedFilter)}
                />
              )}
              <WizRelList
                rels={relatedPickFrom === "fromHere" && relatedLeaf
                  ? (relsByObject[relatedLeaf.objectName] ?? [])
                  : relations}
                selected={
                  relatedPickFrom === "fromHere"
                    ? null
                    : (draft.relatedFilter?.hops[0]?.relationship ?? null)
                }
                onToggle={pickRelatedRel}
                maxHeight={320}
              />
            </Question>
          )}

          {step === "relatedNext" && draft.relatedFilter && relatedHop && relatedLeaf && (
            <Question
              kicker="Where | related"
              title={`On ${relatedHop.objectName}, what next?`}
              trail={(
                <WizTrail
                  home={{ label: "Where", onClick: () => popTo("parentWhere") }}
                  hops={draft.relatedFilter.hops.map((h, hi) => ({
                    label: h.relationship,
                    title: `${h.objectName} - tap to set WHERE on this hop`,
                    current: hi === relatedHopIndex,
                    onClick: () => focusRelatedHop(hi),
                    onRemove: hi > 0
                      ? () => dropRelatedHopsFrom(hi)
                      : undefined,
                  }))}
                />
              )}
              nav={<Nav back={back} />}
            >
              {draft.relatedFilter && (
                <WizHopCard
                  purpose="This path filters which parent rows return. Related rows are not loaded into the result. Tap a hop to set WHERE on that object."
                  hops={hopsFromRelated(draft.relatedFilter)}
                />
              )}
              {relatedHopConds.some((c) => c.field) && (
                <p className="wiz-hint">
                  Conditions on {relatedHop.objectName}: {relatedHopConds.filter((c) => c.field).map((c) => `${c.field} ${c.op} ${c.value}`).join(", ")}
                </p>
              )}
              <div className="wiz-choices">
                <button type="button" className="wiz-choice" onClick={() => goReplace("relatedConds")}>
                  <strong>Add a condition</strong>
                  <span>Filter on {relatedHop.objectName} attributes</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    setRelatedPickFrom("fromHere");
                    void loadRels(relatedLeaf.objectName);
                    goReplace("relatedPick");
                  }}
                >
                  <strong>Related object from here</strong>
                  <span>Continue the path from {relatedLeaf.objectName}</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    commitRelatedFilter();
                    setRelatedPickFrom("root");
                    goReplace("relatedPick");
                  }}
                >
                  <strong>A different related object</strong>
                  <span>Start another path from the parent</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    commitRelatedFilter();
                    popTo("parentWhere");
                  }}
                >
                  <strong>Back to Where</strong>
                  <span>Parent conditions</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => goChildFilterOrSort()}
                >
                  <strong>Done with related filters</strong>
                  <span>Keep what you have and continue</span>
                </button>
              </div>
            </Question>
          )}

          {step === "relatedConds" && draft.relatedFilter && relatedHop && (
            <Question
              kicker="Where | related"
              title={`Conditions on ${relatedHop.objectName}?`}
              trail={(
                <WizTrail
                  home={{ label: "Where", onClick: () => popTo("parentWhere") }}
                  hops={draft.relatedFilter.hops.map((h, hi) => ({
                    label: h.relationship,
                    title: `${h.objectName} - tap to set WHERE on this hop`,
                    current: hi === relatedHopIndex,
                    onClick: () => setRelatedHopIndex(hi),
                    onRemove: hi > 0
                      ? () => dropRelatedHopsFrom(hi)
                      : undefined,
                  }))}
                />
              )}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder={`e.g. org EAGLENA on ${relatedHop.objectName}...`}
                  need={assistNeed("relatedConds")}
                  onNeed={(v) => setAssistNeed("relatedConds", v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("where", "relatedConds")}
                  onTapAll={() => {
                    const cur = draft.relatedFilter;
                    if (!cur) return;
                    patchRelatedFilter(setRelatedCondsAt(cur, relatedHopIndex, mergeConds(relatedHopConds, suggestWhere)));
                  }}
                  tapAllCount={suggestWhere.filter((c) => !relatedHopConds.some((x) => condKey(x) === condKey(c))).length}
                >
                  {suggestWhere.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestWhere.map((c, i) => (
                          <button
                            type="button"
                            key={`${c.field}-${i}`}
                            className="wiz-chip suggest"
                            onClick={() => patchRelatedFilter(setRelatedCondsAt(
                              draft.relatedFilter!,
                              relatedHopIndex,
                              [...relatedHopConds.filter((x) => x.field), c],
                            ))}
                          >
                            {c.field} {c.op} {c.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("relatedConds")} continueLabel="Back to choices" />}
            >
              <p className="wiz-hint mono">{pathLabel(draft.relatedFilter.hops.slice(0, relatedHopIndex + 1))} - tap another hop to set its WHERE</p>
              <WizCondList
                key={`${relatedHopIndex}-${relatedHop.objectName}`}
                fields={hopFields[relatedHop.objectName] ?? []}
                conds={relatedHopConds}
                onChange={(conditions) => patchRelatedFilter(setRelatedCondsAt(draft.relatedFilter!, relatedHopIndex, conditions))}
                orMode={draft.orMode}
                onOrMode={(orMode) => patch({ orMode })}
                orModeHint="Same parent where - Maximo replaces AND with OR (orMode)."
              />
            </Question>
          )}

          {step === "childFilterWant" && filterChain && (
            <Question
              kicker={`Child ${childFilterIndex + 1} / ${draft.childChains.length}`}
              title={`Filter rows on ${filterChain.hops[0]?.relationship}?`}
              trail={(
                <WizTrail
                  home={{ label: "Child filters", current: true }}
                  hops={filterChain.hops.map((h) => ({ label: h.relationship, title: h.objectName }))}
                />
              )}
              nav={<Nav back={back} />}
            >
              <p className="wiz-hint">
                Trims which child rows load. You can stay on this object, or follow a related object from it.
                Timeline range and domain-internal filters are on the next condition screen.
              </p>
              <div className="wiz-choices row">
                <button type="button" className="wiz-choice" onClick={() => { setChildFilterHopIndex(Math.max(0, filterChain.hops.length - 1)); go("childFilterNext"); }}>
                  <strong>Yes</strong>
                  <span>Add conditions or follow a related object</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => nextChildFilterOrSort()}>
                  <strong>No</strong>
                  <span>Keep all rows</span>
                </button>
              </div>
            </Question>
          )}

          {step === "childFilterNext" && filterChain && filterHop && (
            <Question
              kicker={`Child ${childFilterIndex + 1} / ${draft.childChains.length}`}
              title={`On ${filterHop.objectName}, what next?`}
              trail={(
                <WizTrail
                  home={{ label: "Child filters", onClick: () => popTo("childFilterWant") }}
                  hops={filterChain.hops.map((h, hi) => ({
                    label: h.relationship,
                    title: h.objectName,
                    current: hi === childFilterHopIndex,
                    onClick: () => {
                      setChildFilterHopIndex(hi);
                      goReplace("childFilterNext");
                    },
                    onRemove: hi > 0
                      ? () => {
                          patchChildChain(childFilterIndex, { hops: filterChain.hops.slice(0, hi) });
                          setChildFilterHopIndex(hi - 1);
                          goReplace("childFilterNext");
                        }
                      : undefined,
                  }))}
                />
              )}
              nav={<Nav back={back} />}
            >
              <WizHopCard
                purpose="This path filters which nested child rows load. Parent rows still return."
                hops={hopsFromChain(filterChain.hops)}
              />
              {filterHop.conditions.some((c) => c.field) && (
                <p className="wiz-hint">
                  Conditions here: {filterHop.conditions.filter((c) => c.field).map((c) => `${c.field} ${c.op} ${c.value}`).join(", ")}
                </p>
              )}
              <div className="wiz-choices">
                <button type="button" className="wiz-choice" onClick={() => goReplace("childFilterConds")}>
                  <strong>Add a condition</strong>
                  <span>Filter rows on {filterHop.objectName}</span>
                </button>
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    void loadRels(filterHop.objectName);
                    goReplace("childFilterPick");
                  }}
                >
                  <strong>Related object from here</strong>
                  <span>Go further from {filterHop.objectName}</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => popTo("childFilterWant")}>
                  <strong>This child's start</strong>
                  <span>Yes / no for this child again</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => nextChildFilterOrSort()}>
                  <strong>Done with this child</strong>
                  <span>Keep these filters</span>
                </button>
              </div>
            </Question>
          )}

          {step === "childFilterPick" && filterChain && filterLeaf && (
            <Question
              kicker={`Child ${childFilterIndex + 1} / ${draft.childChains.length}`}
              title={`Related object from ${filterLeaf.objectName}?`}
              trail={(
                <WizTrail
                  home={{ label: "Child filters", onClick: () => popTo("childFilterWant") }}
                  hops={filterChain.hops.map((h, hi) => ({
                    label: h.relationship,
                    title: h.objectName,
                    current: hi === filterChain.hops.length - 1,
                    onClick: () => {
                      setChildFilterHopIndex(hi);
                      goReplace("childFilterNext");
                    },
                    onRemove: hi > 0
                      ? () => {
                          patchChildChain(childFilterIndex, { hops: filterChain.hops.slice(0, hi) });
                          setChildFilterHopIndex(hi - 1);
                          goReplace("childFilterNext");
                        }
                      : undefined,
                  }))}
                />
              )}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder={`e.g. hop to asset or site from ${filterLeaf.objectName}...`}
                  need={assistNeed(`childFilterPick:${filterLeaf.objectName}`)}
                  onNeed={(v) => setAssistNeed(`childFilterPick:${filterLeaf.objectName}`, v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("children", `childFilterPick:${filterLeaf.objectName}`)}
                >
                  {suggestRels.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to hop</p>
                      <div className="wiz-chips">
                        {suggestRels.map((r) => (
                          <button
                            type="button"
                            key={r.relation}
                            className="wiz-chip suggest"
                            onClick={() => addChildFilterHop(r)}
                          >
                            {r.relation}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("childFilterPick")} continueLabel="Back to choices" />}
            >
              <WizHopCard
                purpose="This path filters nested child rows. After you pick, you'll see the join clause - go back if it's the wrong door."
                hops={hopsFromChain(filterChain.hops)}
              />
              <WizRelList
                rels={relsByObject[filterLeaf.objectName] ?? []}
                selected={null}
                onToggle={addChildFilterHop}
                maxHeight={280}
              />
            </Question>
          )}

          {step === "childFilterConds" && filterChain && filterHop && (
            <Question
              kicker={`Child ${childFilterIndex + 1} | ${filterHop.relationship}`}
              title={`Conditions on ${filterHop.objectName}?`}
              trail={(
                <WizTrail
                  home={{ label: "Child filters", onClick: () => popTo("childFilterWant") }}
                  hops={filterChain.hops.slice(0, childFilterHopIndex + 1).map((h, hi) => ({
                    label: h.relationship,
                    title: h.objectName,
                    current: hi === childFilterHopIndex,
                    onClick: () => goReplace("childFilterNext"),
                  }))}
                />
              )}
              assist={assistEnabled ? (
                <WizAssistPanel
                  placeholder={`e.g. only active rows on ${filterHop.objectName}...`}
                  need={assistNeed(`childFilterConds:${filterHop.objectName}`)}
                  onNeed={(v) => setAssistNeed(`childFilterConds:${filterHop.objectName}`, v)}
                  busy={busy}
                  note={assistNote}
                  onSuggest={() => void runSuggest("where", `childFilterConds:${filterHop.objectName}`)}
                  onTapAll={() => {
                    const chain = draft.childChains[childFilterIndex];
                    if (!chain) return;
                    const hop = chain.hops[childFilterHopIndex];
                    patchChildChain(childFilterIndex, {
                      hops: chain.hops.map((h, hi) => (
                        hi === childFilterHopIndex
                          ? { ...h, conditions: mergeConds(hop.conditions, suggestWhere) }
                          : h
                      )),
                    });
                  }}
                  tapAllCount={suggestWhere.filter((c) => !filterHop.conditions.some((x) => condKey(x) === condKey(c))).length}
                >
                  {suggestWhere.length > 0 && (
                    <div className="wiz-suggest">
                      <p className="wiz-assist-kicker">Suggestions - tap to add</p>
                      <div className="wiz-chips">
                        {suggestWhere.map((c, i) => (
                          <button
                            type="button"
                            key={`${c.field}-${i}`}
                            className="wiz-chip suggest"
                            onClick={() => {
                              const chain = draft.childChains[childFilterIndex];
                              if (!chain) return;
                              const hop = chain.hops[childFilterHopIndex];
                              patchChildChain(childFilterIndex, {
                                hops: chain.hops.map((h, hi) => (
                                  hi === childFilterHopIndex
                                    ? { ...h, conditions: [...hop.conditions.filter((x) => x.field), c] }
                                    : h
                                )),
                              });
                            }}
                          >
                            {c.field} {c.op} {c.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </WizAssistPanel>
              ) : undefined}
              nav={<Nav back={back} onContinue={() => continueFrom("childFilterConds")} continueLabel="Back to choices" />}
            >
              <p className="wiz-hint mono">{pathLabel(filterChain.hops.slice(0, childFilterHopIndex + 1))}</p>
              <WizCondList
                key={`${childFilterIndex}-${childFilterHopIndex}-${filterHop.objectName}`}
                fields={hopFields[filterHop.objectName] ?? []}
                conds={filterHop.conditions}
                onChange={(conditions) => {
                  const chain = draft.childChains[childFilterIndex];
                  if (!chain) return;
                  patchChildChain(childFilterIndex, {
                    hops: chain.hops.map((h, i) => (
                      i === childFilterHopIndex ? { ...h, conditions } : h
                    )),
                  });
                }}
                orMode={!!filterHop.opmodeor}
                onOrMode={(opmodeor) => {
                  const chain = draft.childChains[childFilterIndex];
                  if (!chain) return;
                  patchChildChain(childFilterIndex, {
                    hops: chain.hops.map((h, i) => (
                      i === childFilterHopIndex ? { ...h, opmodeor } : h
                    )),
                  });
                }}
                orModeHint="This hop's childOptions - Maximo replaces AND with OR (opmodeor)."
              />
              <TimelineCard
                fields={hopFields[filterHop.objectName] ?? []}
                value={filterHop.timeline ?? null}
                onChange={(timeline) => {
                  const chain = draft.childChains[childFilterIndex];
                  if (!chain) return;
                  patchChildChain(childFilterIndex, {
                    hops: chain.hops.map((h, i) => (
                      i === childFilterHopIndex ? { ...h, timeline } : h
                    )),
                  });
                }}
              />
              <DomainInternalCard
                fields={hopFields[filterHop.objectName] ?? []}
                clauses={filterHop.domainInternal ?? []}
                onChange={(domainInternal) => {
                  const chain = draft.childChains[childFilterIndex];
                  if (!chain) return;
                  patchChildChain(childFilterIndex, {
                    hops: chain.hops.map((h, i) => (
                      i === childFilterHopIndex ? { ...h, domainInternal } : h
                    )),
                  });
                }}
              />
            </Question>
          )}

          {step === "sort" && (
            <Question kicker="Order" title="Any sort?" nav={<Nav back={back} onContinue={() => continueFrom("sort")} continueLabel="Skip or continue" />}>
              <div className="wiz-chips">
                {(draft.selectAll ? fields.slice(0, 12) : fields.filter((f) => draft.selected.includes(f.name))).map((f) => {
                  const rule = draft.sortRules.find((s) => s.field === f.name);
                  return (
                    <button
                      type="button"
                      key={f.name}
                      className={`wiz-chip${rule ? " on" : ""}`}
                      onClick={() => {
                        if (!rule) patch({ sortRules: [...draft.sortRules, { field: f.name, dir: "asc" }] });
                        else if (rule.dir === "asc") patch({ sortRules: draft.sortRules.map((s) => (s.field === f.name ? { ...s, dir: "desc" } : s)) });
                        else patch({ sortRules: draft.sortRules.filter((s) => s.field !== f.name) });
                      }}
                    >
                      {rule ? (rule.dir === "desc" ? "-" : "+") : ""}{f.name}
                    </button>
                  );
                })}
              </div>
              <p className="wiz-hint">Tap once for +, twice for -, third clears.</p>
            </Question>
          )}

          {step === "displayWant" && (
            <Question kicker="Results table" title="Flatten a related record onto parent columns?" nav={<Nav back={back} />}>
              <p className="wiz-hint">
                Display only - the query is unchanged. Use this when a hop is 1:1 (one ASSET per SR). Each hop is separate: ASSET, then ASSET{" -> "}ACTIVEASSETMETER.
              </p>
              <div className="wiz-choices row">
                <button
                  type="button"
                  className="wiz-choice"
                  onClick={() => {
                    const unused = displayItems.filter((i) => !(i.key in draft.displaySpec));
                    if (unused.length === 0 && Object.keys(draft.displaySpec).length) go("displayNext");
                    else go("displayPick");
                  }}
                >
                  <strong>Yes</strong>
                  <span>Pick a hop already in this query</span>
                </button>
                <button type="button" className="wiz-choice" onClick={() => go("page")}>
                  <strong>No</strong>
                  <span>Keep related data nested</span>
                </button>
              </div>
            </Question>
          )}

          {step === "displayPick" && (
            <Question
              kicker="Results table"
              title="Which related hop?"
              nav={<Nav back={back} onContinue={() => go("displayNext")} continueLabel={Object.keys(draft.displaySpec).length ? "Skip to summary" : "Skip"} />}
            >
              <p className="wiz-hint">
                One hop per card. ASSET (its selected fields) and a deeper hop like ACTIVEASSETMETER (*) are both listed.
              </p>
              <div className="wiz-choices">
                {displayItems.map((item) => {
                  const on = item.key in draft.displaySpec;
                  return (
                    <button
                      type="button"
                      key={item.key}
                      className={`wiz-choice${on ? " on" : ""}`}
                      onClick={() => {
                        setDisplayKey(item.key);
                        if (!(item.key in draft.displaySpec)) {
                          patch({
                            displaySpec: {
                              ...draft.displaySpec,
                              [item.key]: item.selectAll ? [] : [...item.fieldList],
                            },
                          });
                        }
                        void loadHopFields(item.objectName, isOsChild(item.objectName));
                        go("displayFields");
                      }}
                    >
                      <strong className="mono">{item.path}</strong>
                      <span>
                        {item.selectAll ? `* on ${item.objectName}` : item.fieldList.join(", ") || "pick fields"}
                        {on ? " | already added" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Question>
          )}

          {step === "displayFields" && displayItem && (
            <Question
              kicker="Results table"
              title={`Columns from ${displayItem.path}?`}
              nav={<Nav back={back} onContinue={() => continueFrom("displayFields")} continueLabel="Continue" />}
            >
              <p className="wiz-hint">
                Checked fields become parent-table columns ({displayItem.key}.field). Nested collections stay in the GET.
              </p>
              {displayItem.selectAll && !(displayItem.objectName in hopFields) && (
                <p className="wiz-hint">Loading {displayItem.objectName} fields...</p>
              )}
              <WizFieldPick
                fields={(() => {
                  const cache = hopFields[displayItem.objectName] ?? [];
                  if (displayItem.selectAll) return cache;
                  const by = new Map(cache.map((f) => [f.name.toLowerCase(), f]));
                  return displayItem.fieldList.map((n) => by.get(n.toLowerCase()) ?? { name: n, title: n, type: "ALN" });
                })()}
                useful={usefulOrFallback(hopFields[displayItem.objectName] ?? [], draft.intent)}
                selected={new Set(draft.displaySpec[displayItem.key] ?? [])}
                selectAll={false}
                onSelectAll={() => {
                  const names = fieldsForRelatedSelect(displayItem, Object.fromEntries(
                    Object.entries(hopFields).map(([k, v]) => [k.toUpperCase(), v]),
                  ));
                  patch({ displaySpec: { ...draft.displaySpec, [displayItem.key]: names } });
                }}
                onClear={() => patch({ displaySpec: { ...draft.displaySpec, [displayItem.key]: [] } })}
                onApplyUseful={() => {
                  const names = usefulOrFallback(hopFields[displayItem.objectName] ?? [], draft.intent).map((f) => f.name);
                  const cur = draft.displaySpec[displayItem.key] ?? [];
                  patch({ displaySpec: { ...draft.displaySpec, [displayItem.key]: [...new Set([...cur, ...names])] } });
                }}
                onToggle={(name) => {
                  const cur = draft.displaySpec[displayItem.key] ?? [];
                  const on = cur.some((f) => f.toLowerCase() === name.toLowerCase());
                  const next = on ? cur.filter((f) => f.toLowerCase() !== name.toLowerCase()) : [...cur, name];
                  patch({ displaySpec: { ...draft.displaySpec, [displayItem.key]: next } });
                }}
              />
            </Question>
          )}

          {step === "displayNext" && (
            <Question kicker="Results table" title="Flatten another hop?" nav={<Nav back={back} />}>
              {Object.entries(draft.displaySpec).filter(([, f]) => f.length).length === 0 ? (
                <p className="wiz-hint">Nothing flattened yet.</p>
              ) : (
                <ul className="wiz-review">
                  {Object.entries(draft.displaySpec).filter(([, f]) => f.length).map(([k, f]) => (
                    <li key={k}><em>{k.replace(/\./g, " -> ")}</em> {f.join(", ")}</li>
                  ))}
                </ul>
              )}
              <div className="wiz-choices">
                {displayItems.some((i) => !(i.key in draft.displaySpec)) && (
                  <button type="button" className="wiz-choice" onClick={() => go("displayPick")}>
                    <strong>Add another</strong>
                    <span>A different hop in this query</span>
                  </button>
                )}
                <button type="button" className="wiz-choice" onClick={() => go("page")}>
                  <strong>Continue</strong>
                  <span>Page size next</span>
                </button>
              </div>
            </Question>
          )}

          {step === "page" && (
            <Question kicker="How many" title="Page size" nav={<Nav back={back} onContinue={() => continueFrom("page")} />}>
              <div className="wiz-choices row">
                {[25, 50, 100].map((n) => (
                  <button key={n} type="button" className={`wiz-choice${draft.pageSize === n ? " on" : ""}`} onClick={() => patch({ pageSize: n, pageTouched: true })}>
                    <strong>{n}</strong>
                  </button>
                ))}
              </div>
              <p className="wiz-hint">Load more rebuilds with a bigger pageSize. ws_load has no page number.</p>
            </Question>
          )}

          {step === "review" && (
            <Question
              kicker="Ready"
              title={draft.osHit?.osName ?? "Your query"}
              nav={(
                <div className="wiz-nav">
                  <button type="button" className="ghost" onClick={back}>
                    <Icon icon={faArrowLeft} /> Back
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="ghost" onClick={() => onOpenBuilder(draft, false)}>
                    <Icon icon={faSliders} /> Open builder
                  </button>
                  <button type="button" className="wiz-go" onClick={() => onOpenBuilder(draft, true)}>
                    <Icon icon={faPlay} /> Run it
                  </button>
                </div>
              )}
            >
              <ul className="wiz-review">
                {draft.intent && <li><em>for</em> {draft.intent}</li>}
                <li><em>os</em> {draft.osHit?.osName}</li>
                <li><em>select</em> {draft.selectAll ? "*" : draft.selected.join(", ") || "-"}</li>
                {draft.childChains.length > 0 && (
                  <li>
                    <em>children</em>{" "}
                    {draft.childChains.map((c) => c.hops.map((h) => h.relationship).join(" -> ")).join("; ")}
                  </li>
                )}
                {draft.where.filter((c) => c.field).length > 0 && (
                  <li><em>where</em> {draft.where.filter((c) => c.field).map((c) => `${c.field} ${c.op} ${c.value}`).join(" and ")}</li>
                )}
                {draftToRelatedWhere(draft).map((f, i) => (
                  <li key={`rel-${i}`}>
                    <em>related</em> {pathLabel(f.hops)}{" - "}
                    {f.conditions.filter((c) => c.field).map((c) => `${c.field} ${c.op} ${c.value}`).join(" and ")}
                  </li>
                ))}
                {draft.childChains.some((c) => c.hops.some((h) => h.conditions.some((x) => x.field))) && (
                  <li>
                    <em>child where</em>{" "}
                    {draft.childChains
                      .filter((c) => c.hops.some((h) => h.conditions.some((x) => x.field)))
                      .map((c) => c.hops.map((h) => h.relationship).join(" -> "))
                      .join("; ")}
                  </li>
                )}
                {draft.savedQuery && <li><em>saved</em> {draft.savedQuery}</li>}
                {Object.entries(draft.displaySpec).filter(([, f]) => f.length).map(([k, f]) => (
                  <li key={`d-${k}`}><em>display</em> {k.replace(/\./g, " -> ")} | {f.join(", ")}</li>
                ))}
                <li><em>page</em> {draft.pageSize}</li>
              </ul>
            </Question>
          )}
        </motion.main>
        </AnimatePresence>
        </WizTourId.Provider>
        <InsightStamp insight={insight} />
      </div>
    </div>
  );
}

function condKey(c: WhereCondition): string {
  return `${c.field}|${c.op}|${c.value}`;
}

function mergeConds(existing: WhereCondition[], extra: WhereCondition[]): WhereCondition[] {
  const keep = existing.filter((x) => x.field);
  const seen = new Set(keep.map(condKey));
  return [...keep, ...extra.filter((c) => c.field && !seen.has(condKey(c)))];
}

const WizTourId = createContext<string | undefined>(undefined);

function Question({
  kicker,
  title,
  trail,
  assist,
  nav,
  children,
}: {
  kicker: string;
  title: string;
  trail?: ReactNode;
  assist?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) {
  const tour = useContext(WizTourId);
  return (
    <div className={`wiz-q${assist ? " has-assist" : ""}`}>
      <div className="wiz-q-focus" data-tour={tour}>
        <div className="wiz-q-head">
          {trail}
          <p className="wiz-kicker">{kicker}</p>
          <h1 className="wiz-display">{title}</h1>
        </div>
        {assist}
        <div className="wiz-q-body">{children}</div>
      </div>
      {nav ? <div className="wiz-q-foot">{nav}</div> : null}
    </div>
  );
}

function Nav({
  back,
  onContinue,
  continueLabel = "Continue",
}: {
  back: (() => void) | null;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="wiz-nav">
      {back ? (
        <button type="button" className="ghost" onClick={back}>
          <Icon icon={faArrowLeft} /> Back
        </button>
      ) : <span />}
      {onContinue && (
        <button type="button" className="wiz-go" onClick={onContinue}>
          {continueLabel} <Icon icon={faArrowRight} />
        </button>
      )}
    </div>
  );
}
