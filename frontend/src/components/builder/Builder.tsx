/**
 * Query builder: object-structure search, fields, WHERE, child hops, execute.
 * Kept mounted (paused) while other studio screens are showing so browser Back
 * restores this session; `paused` stops live-execute while hidden.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Icon, faDiagramProject, faFileImport, faFloppyDisk, faPlay } from "../Icon";
import { callTool, getTenantStatus, patchSavedQuery, wakeTenant, SavedQueryListItem } from "../../api";
import {
  ApiError,
  ChildChain,
  ChildRel,
  FieldInfo,
  LoadMeta,
  OsSearchResult,
  QueryParam,
  SavedQuery,
  SortRule,
  Tenant,
  RelatedWhere,
  TimelineQuery,
  DomainInternalClause,
  WhereCondition,
} from "../../types";
import {
  buildSelectFields,
  childOptionsFromChains,
  collectDynSlots,
  collectSearchAttributes,
  displayColumns,
  DisplaySpec,
  emptyChain,
  emptyRelatedWhere,
  extractEndpoint,
  extractSavedQueries,
  extractWsId,
  mergeFieldMeta,
  mergeRels,
  parseDomainValues,
  parseObjectAttributes,
  parseRelatedObjects,
  parseSubschemaFields,
  relatedWhereConditions,
  splitProperties,
  toCondition,
  toolFailure,
  DomainValue,
  fieldAllowsSearch,
  hopJoinClause,
  formatTlRange,
  formatTlAttribute,
  timelineReady,
  serializeDomainInternal,
} from "../../lib/schema";
import { fetchRelsForObject } from "../../lib/mboRels";
import { hydrateImport, parseImport, savedParamsFromImport, searchOffFromImport, type ImportStep } from "../../lib/oslcImport";
import TopBar from "./TopBar";
import FieldPanel from "./FieldPanel";
import TimelineCard from "./TimelineCard";
import DomainInternalCard from "./DomainInternalCard";
import WherePanel from "./WherePanel";
import ChildWherePanel from "./ChildWherePanel";
import SortPanel from "./SortPanel";
import SavedQueryPanel from "./SavedQueryPanel";
import DynamicValuesPanel from "./DynamicValuesPanel";
import ResultPanel, { ResultTab } from "./ResultPanel";
import InsightDialog from "./InsightDialog";
import ImportDialog from "./ImportDialog";
import ImportFlight, { chipsFromImport, FlightChip } from "./ImportFlight";
import DisplayConfigPanel from "./DisplayConfigPanel";
import ChartConfigPanel from "./ChartConfigPanel";
import TableViewPanel from "./TableViewPanel";
import SaveQueryDialog from "./SaveQueryDialog";
import { relatedSelectsFromQuery } from "../../lib/displayConfig";
import { emptyReport, reportFieldsFromQuery, ReportSpec } from "../../lib/resultReport";
import { emptyTableView, TableView } from "../../lib/tableView";
import { exportQueryDoc } from "../../lib/displayBundle";
import { joinsFromChains } from "../../lib/queryGraph";
import { draftToChildChains, draftToRelatedWhere, QueryDraft } from "../../lib/queryDraft";
import { mergeFieldNames, usefulOrFallback } from "../../lib/usefulFields";
import {
  pickBestOs,
  pickDemoHop2,
  pickDemoRel,
  pickNamed,
  TOUR_EVENT,
  tourDone,
} from "../../lib/tourBridge";
import { TOUR_QUERY } from "../../lib/tour/example";

function cacheKey(objectName: string): string {
  return objectName.toUpperCase();
}

function currentCompact(
  primary: string | null,
  relsByObject: Record<string, ChildRel[]>,
): ChildRel[] {
  if (!primary) return [];
  return relsByObject[primary] ?? [];
}

async function paintPause() {
  await new Promise((r) => setTimeout(r, 70));
}

const morphEase = [0.22, 1, 0.36, 1] as const;

export default function Builder({
  tenant,
  onSwitchTenant,
  onHome,
  initialDraft,
  autoExecute,
  initialImport,
  viewMode = "builder",
  initialLoaded,
  onResync,
  paused = false,
}: {
  tenant: Tenant;
  onSwitchTenant: () => void;
  onHome?: () => void;
  initialDraft?: QueryDraft | null;
  autoExecute?: boolean;
  initialImport?: string | null;
  viewMode?: "builder" | "results" | "report";
  initialLoaded?: SavedQueryListItem | null;
  onResync?: () => void;
  /** True while this screen is kept mounted but hidden (browser history). */
  paused?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const [results, setResults] = useState<OsSearchResult[]>([]);
  const [osName, setOsName] = useState<string | null>(null);
  const [primaryObject, setPrimaryObject] = useState<string | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [relations, setRelations] = useState<ChildRel[]>([]);
  const [relsByObject, setRelsByObject] = useState<Record<string, ChildRel[]>>({});
  const [osChildObjects, setOsChildObjects] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [searchOff, setSearchOff] = useState<Set<string>>(new Set());
  const [includeSearchTerms, setIncludeSearchTerms] = useState(true);
  const [includeSearchAttributes, setIncludeSearchAttributes] = useState(true);
  const [extraSelect, setExtraSelect] = useState<string[]>([]);
  const [pinnedSearchAttrs, setPinnedSearchAttrs] = useState<string[]>([]);
  const [rawWhere, setRawWhere] = useState<string | null>(null);
  const [childCollection, setChildCollection] = useState<{ parentRecordId: string; relationship: string } | null>(null);
  const [importedChildOptions, setImportedChildOptions] = useState<Record<string, unknown>[] | null>(null);
  const [where, setWhere] = useState<WhereCondition[]>([]);
  const [orMode, setOrMode] = useState(false);
  const [timeline, setTimeline] = useState<TimelineQuery | null>(null);
  const [domainInternal, setDomainInternal] = useState<DomainInternalClause[]>([]);
  const [searchTerms, setSearchTerms] = useState("");
  const [relatedWhere, setRelatedWhere] = useState<RelatedWhere[]>([]);
  const [childChains, setChildChains] = useState<ChildChain[]>([]);
  const [childFieldsCache, setChildFieldsCache] = useState<Record<string, FieldInfo[]>>({});
  const [childFieldStatus, setChildFieldStatus] = useState<Record<string, "loading" | "ready">>({});
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savedQuery, setSavedQuery] = useState<string | null>(null);
  const [savedParams, setSavedParams] = useState<Record<string, QueryParam>>({});
  const [dynValues, setDynValues] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(50);
  const [displaySpec, setDisplaySpec] = useState<DisplaySpec>({});
  const [displayExtra, setDisplayExtra] = useState<Record<string, unknown>>({});
  const [report, setReport] = useState<ReportSpec>(emptyReport());
  const [tableView, setTableView] = useState<TableView>(emptyTableView());
  const [saveOpen, setSaveOpen] = useState(false);
  const [loaded, setLoaded] = useState<SavedQueryListItem | null>(initialLoaded ?? null);
  const [saveBusy, setSaveBusy] = useState(false);
  const reportOnly = viewMode === "report";
  const [focusResults, setFocusResults] = useState(viewMode !== "builder");
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [execNote, setExecNote] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("call");
  const [builtArgs, setBuiltArgs] = useState<Record<string, unknown> | null>(null);
  const [builtResponse, setBuiltResponse] = useState<unknown>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<LoadMeta | null>(null);
  const [live, setLive] = useState(false);
  const [focusBuild, setFocusBuild] = useState(viewMode === "builder");
  const focusBuildRef = useRef(viewMode === "builder");
  const reduceMotion = useReducedMotion();
  const morph = reduceMotion
    ? { duration: 0 }
    : { duration: 0.55, ease: morphEase };
  const fade = reduceMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: morphEase };

  function morphFocus(next: boolean) {
    if (next) setFocusResults(false);
    if (focusBuildRef.current === next) return;
    focusBuildRef.current = next;
    setFocusBuild(next);
  }
  const [insightOpen, setInsightOpen] = useState(false);
  const [hydrated, setHydrated] = useState(!initialDraft?.osHit && !initialImport);
  const [mcpConnected, setMcpConnected] = useState<boolean | null>(null);
  const [domainByField, setDomainByField] = useState<Record<string, DomainValue[]>>({});
  const [domainLoading, setDomainLoading] = useState<Record<string, boolean>>({});
  const [flight, setFlight] = useState<{ origin: DOMRect; chips: FlightChip[] } | null>(null);

  const relsByObjectRef = useRef(relsByObject);
  relsByObjectRef.current = relsByObject;
  const childFieldsRef = useRef(childFieldsCache);
  childFieldsRef.current = childFieldsCache;
  const osChildRef = useRef(osChildObjects);
  osChildRef.current = osChildObjects;
  const childStatusRef = useRef(childFieldStatus);
  childStatusRef.current = childFieldStatus;
  const runSeq = useRef(0);
  const skipLive = useRef(true);
  const domainTried = useRef(new Set<string>());
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const relationsRef = useRef(relations);
  relationsRef.current = relations;

  useEffect(() => {
    let cancelled = false;
    // Check the real live state first (cheap, no side effect) so the badge
    // is accurate immediately, then proactively wake a cold client in the
    // background so the FIRST real query doesn't silently eat the
    // spawn+handshake delay.
    getTenantStatus(tenant.id)
      .then((s) => {
        if (cancelled) return;
        setMcpConnected(s.mcp_connected);
        if (!s.mcp_connected) {
          wakeTenant(tenant.id)
            .then((r) => !cancelled && setMcpConnected(r.mcp_connected))
            .catch(() => !cancelled && setMcpConnected(false));
        }
      })
      .catch(() => !cancelled && setMcpConnected(null));
    return () => {
      cancelled = true;
    };
  }, [tenant.id]);

  async function runTool<T>(tool: string, args: Record<string, unknown>): Promise<T | null> {
    try {
      const result = await callTool<T>(tenant.id, tool, args);
      setMcpConnected(true); // any successful call proves the client is warm
      return result;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.code}: ${err.message}`);
        if (err.code === "mcp_connection_error") setMcpConnected(false);
      } else {
        setError(String(err));
      }
      return null;
    }
  }

  const loadRels = useCallback(async (objectName: string) => {
    if (!objectName || relsByObjectRef.current[objectName]) return;
    relsByObjectRef.current = { ...relsByObjectRef.current, [objectName]: [] };
    setRelsByObject((prev) => ({ ...prev, [objectName]: prev[objectName] ?? [] }));
    try {
      const parsed = await fetchRelsForObject(tenant.id, objectName);
      relsByObjectRef.current = { ...relsByObjectRef.current, [objectName]: parsed };
      setRelsByObject((prev) => ({ ...prev, [objectName]: parsed }));
    } catch {
      /* keep empty list so we don't retry-loop */
    }
  }, [tenant.id]);

  async function searchOs(term?: string): Promise<OsSearchResult[]> {
    const q = (term ?? query).trim();
    if (!q) return [];
    if (term != null) setQuery(term);
    setSearching(true);
    setError(null);
    const res = await runTool<{ results?: OsSearchResult[] }>("maximo_get_metadata", {
      uri: `maximo://os/search/${encodeURIComponent(q)}`,
    });
    const hits = res?.results ?? [];
    setResults(hits);
    setSearching(false);
    return hits;
  }

  async function pickOs(hit: OsSearchResult): Promise<{
    fields: FieldInfo[];
    relations: ChildRel[];
    compact: ChildRel[];
    primaryObject: string | null;
  }> {
    const name = hit.osName;
    setError(null);
    setOsName(name);
    setPrimaryObject(hit.primaryObject ?? null);
    setDomainByField({});
    setDomainLoading({});
    domainTried.current = new Set();
    setSelected(new Set());
    setSelectAll(false);
    setAliases({});
    setSearchOff(new Set());
    setExtraSelect([]);
    setPinnedSearchAttrs([]);
    setRawWhere(null);
    setChildCollection(null);
    setImportedChildOptions(null);
    setWhere([]);
    setOrMode(false);
    setTimeline(null);
    setDomainInternal([]);
    setSearchTerms("");
    setRelatedWhere([]);
    setChildChains([]);
    setDisplaySpec({});
    setDisplayExtra({});
    setReport(emptyReport());
    setTableView(emptyTableView());
    setChildFieldsCache({});
    childFieldsRef.current = {};
    setChildFieldStatus({});
    childStatusRef.current = {};
    setRelsByObject({});
    relsByObjectRef.current = {};
    setOsChildObjects(new Set());
    osChildRef.current = new Set();
    setSortRules([]);
    setSavedQueries(extractSavedQueries(hit.meta?.queryCapability));
    setSavedQuery(null);
    setSavedParams({});
    setDynValues({});
    setRows([]);
    setBuiltArgs(null);
    setBuiltResponse(null);
    setExecNote(null);
    skipLive.current = true;
    setResults([]);
    setSearchFocus(false);
    setQuery(name);
    setLoadingSchema(true);
    const [schemaRes, relatedRes, compact, attrRaw] = await Promise.all([
      runTool<unknown>("maximo_get_metadata", { uri: `maximo://os/${name}/schema` }),
      runTool<unknown>("maximo_get_metadata", { uri: `maximo://os/${name}/relatedObjects` }),
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
    const osNames = new Set(osRels.map((r) => r.objectName.toUpperCase()));
    osChildRef.current = osNames;
    setOsChildObjects(osNames);
    if (hit.primaryObject) {
      setRelsByObject({ [hit.primaryObject]: compact });
      relsByObjectRef.current = { [hit.primaryObject]: compact };
    }
    setFields(f);
    setRelations(mergeRels(osRels, compact));
    setLoadingSchema(false);
    return { fields: f, relations: mergeRels(osRels, compact), compact, primaryObject: hit.primaryObject ?? null };
  }

  useEffect(() => {
    if (!initialDraft?.osHit) return;
    let cancel = false;
    void (async () => {
      await pickOs(initialDraft.osHit!);
      if (cancel) return;
      setSelected(new Set(initialDraft.selected));
      setSelectAll(initialDraft.selectAll);
      setChildChains(draftToChildChains(initialDraft));
      setWhere(initialDraft.where.filter((c) => c.field));
      setOrMode(!!initialDraft.orMode);
      setTimeline(initialDraft.timeline ?? null);
      setDomainInternal(initialDraft.domainInternal ?? []);
      setRelatedWhere(draftToRelatedWhere(initialDraft));
      setSavedQuery(initialDraft.savedQuery);
      setSavedParams(initialDraft.savedParams);
      setSortRules(initialDraft.sortRules);
      setPageSize(initialDraft.pageSize);
      setDisplaySpec(initialDraft.displaySpec ?? {});
      setHydrated(true);
    })();
    return () => {
      cancel = true;
    };
    // Boot once from the wizard draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadChildFields = useCallback(async (objectName: string) => {
    if (!objectName || !osName) return;
    const key = cacheKey(objectName);
    if (childStatusRef.current[key] === "ready" || childStatusRef.current[key] === "loading") return;
    childStatusRef.current = { ...childStatusRef.current, [key]: "loading" };
    setChildFieldStatus((prev) => ({ ...prev, [key]: "loading" }));
    let f: FieldInfo[] = [];
    try {
      if (osChildRef.current.has(key)) {
        const [sub, attrs] = await Promise.all([
          callTool(tenant.id, "maximo_get_metadata", {
            uri: `maximo://os/${osName}/subschemas/${objectName}`,
          }),
          callTool(tenant.id, "maximo_get_metadata", {
            uri: `maximo://object/${objectName}/attributes`,
          }).catch(() => null),
        ]);
        f = mergeFieldMeta(parseSubschemaFields(sub, objectName), attrs ? parseObjectAttributes(attrs) : []);
      } else {
        const attrs = await callTool(tenant.id, "maximo_get_metadata", {
          uri: `maximo://object/${objectName}/attributes`,
        });
        f = parseObjectAttributes(attrs);
      }
    } catch {
      /* leave empty - free-text field still works */
    }
    childFieldsRef.current = { ...childFieldsRef.current, [key]: f };
    childStatusRef.current = { ...childStatusRef.current, [key]: "ready" };
    setChildFieldsCache((prev) => ({ ...prev, [key]: f }));
    setChildFieldStatus((prev) => ({ ...prev, [key]: "ready" }));
  }, [osName, tenant.id]);

  const loadDomain = useCallback(async (field: string) => {
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
      /* fail silently - keep the typed input */
    } finally {
      setDomainLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [osName, primaryObject, tenant.id]);

  function toggleField(name: string) {
    if (selectAll) {
      setSelectAll(false);
      setSelected(new Set(fields.map((f) => f.name).filter((n) => n !== name)));
      setSearchOff(new Set(fields.filter((f) => !fieldAllowsSearch(f, fields)).map((f) => f.name)));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setAliases((a) => {
          const copy = { ...a };
          delete copy[name];
          return copy;
        });
        setSearchOff((off) => {
          const copy = new Set(off);
          copy.delete(name);
          return copy;
        });
      } else {
        next.add(name);
        const f = fields.find((x) => x.name === name);
        if (!fieldAllowsSearch(f, fields)) {
          setSearchOff((off) => new Set(off).add(name));
        }
      }
      return next;
    });
  }

  function addChildBlock() {
    if (!relations.length) return;
    const rel = relations.find((r) => r.inOs) ?? relations[0];
    setChildChains((prev) => [...prev, emptyChain(rel)]);
    loadChildFields(rel.objectName);
    loadRels(rel.objectName);
  }

  function buildArgs(size: number, mode?: { template?: boolean; applySearch?: boolean }): Record<string, unknown> {
    const condMode = { dynValues, template: mode?.template };
    const args: Record<string, unknown> = {
      opAction: "query",
      osName,
      select: { fields: buildSelectFields(selectAll, selected, childChains, aliases, extraSelect, osChildObjects) },
      pageSize: size,
      collectioncount: true,
    };
    if (childCollection) args.childCollection = childCollection;
    const searchAttrs = [
      ...collectSearchAttributes(selectAll, selected, fields, searchOff, childChains, childFieldsCache),
      ...pinnedSearchAttrs,
    ];
    const uniqueSearch = [...new Set(searchAttrs)];
    const sendSearch = includeSearchTerms || !!mode?.applySearch;
    if (sendSearch && searchTerms.trim()) args.searchTerms = searchTerms.trim();
    if (includeSearchAttributes && uniqueSearch.length) args.searchAttributes = uniqueSearch;
    if (savedQuery) {
      args.savedQuery = savedQuery;
      const sqp: Record<string, string> = {};
      for (const [k, p] of Object.entries(savedParams)) {
        const val = p.isDynamic
          ? mode?.template
            ? (p.dynamicPlaceholder ?? `{{${k.toUpperCase()}}}`)
            : (dynValues[k] ?? p.value)
          : p.value;
        if (val) sqp[k] = val;
      }
      if (Object.keys(sqp).length) args.savedQueryParams = sqp;
    } else if (rawWhere && where.length === 0 && relatedWhere.length === 0) {
      args.rawWhere = rawWhere;
    } else {
      const conditions = [
        ...where.filter((c) => c.field).map((c) => toCondition(c, condMode)),
        ...relatedWhereConditions(relatedWhere, condMode),
      ];
      if (conditions.length) args.where = { conditions };
    }
    if (orMode && (args.where || args.rawWhere)) args.orMode = true;
    if (timelineReady(timeline) && timeline) {
      args.tlrange = formatTlRange(timeline);
      args.tlattribute = formatTlAttribute(timeline);
    }
    const diw = serializeDomainInternal(domainInternal);
    if (diw) args.domaininternalwhere = diw;
    if (sortRules.length) {
      args.orderBy = { rules: sortRules.map((s) => (s.dir === "desc" ? `-${s.field}` : `+${s.field}`)) };
    }
    const children = childOptionsFromChains(childChains, condMode);
    if (children.length) args.childOptions = children;
    else if (importedChildOptions?.length) args.childOptions = importedChildOptions;
    return args;
  }

  async function runQuery(size: number, more: boolean, opts?: { live?: boolean; applySearch?: boolean }) {
    if (!osName) return;
    if (!selectAll && selected.size === 0 && childChains.length === 0 && extraSelect.length === 0) return;
    const keep = !!opts?.live;
    const my = ++runSeq.current;
    more ? setLoadingMore(true) : setBusy(true);
    setError(null);
    setExecNote(more ? "Loading more..." : keep ? "Live query..." : "Building query...");
    if (!keep && !more) {
      if (!reportOnly) morphFocus(false);
      setRows([]);
      setBuiltResponse(null);
      setMeta(null);
    }
    const args = buildArgs(size, { applySearch: opts?.applySearch });
    setBuiltArgs(args);
    if (!keep && !more) setResultTab("call");
    const built = await runTool<Record<string, unknown>>("os_query_builder", args);
    if (my !== runSeq.current) return;
    if (!built) {
      setBusy(false);
      setLoadingMore(false);
      if (keep) setExecNote("Live query failed - keeping previous results");
      else setExecNote(null);
      return;
    }
    setBuiltResponse(built);
    if (!keep && !more) setResultTab("response");
    const builtErr = toolFailure(built);
    if (builtErr) {
      setError(builtErr);
      setBusy(false);
      setLoadingMore(false);
      if (keep) setExecNote("Live query failed - keeping previous results");
      else setExecNote(builtErr);
      return;
    }
    const wsId = extractWsId(built);
    if (!wsId) {
      setError("os_query_builder did not return a working set id");
      setBusy(false);
      setLoadingMore(false);
      if (keep) setExecNote("Live query failed - keeping previous results");
      return;
    }
    setExecNote(keep ? "Live loading results..." : "Loading results...");
    const loaded = await runTool<{
      result?: Record<string, unknown>[];
      meta?: LoadMeta;
      op_success?: boolean;
      error?: { reason?: string; detail?: string };
    }>("ws_load", { id: wsId });
    if (my !== runSeq.current) return;
    const loadErr = toolFailure(loaded);
    if (loadErr) {
      if (loaded) setBuiltResponse(loaded);
      if (!keep && !more) setResultTab("response");
      setError(loadErr);
      setBusy(false);
      setLoadingMore(false);
      if (keep) setExecNote("Live query failed - keeping previous results");
      else setExecNote(loadErr);
      return;
    }
    if (!loaded) {
      setBusy(false);
      setLoadingMore(false);
      if (keep) setExecNote("Live query failed - keeping previous results");
      else setExecNote(null);
      return;
    }
    const n = loaded.result?.length ?? 0;
    if (keep && n === 0) {
      setExecNote("No rows - keeping previous results");
      setError(null);
      setBusy(false);
      setLoadingMore(false);
      return;
    }
    setRows(loaded.result ?? []);
    if (loaded.meta) setMeta(loaded.meta);
    const total = loaded.meta?.totalCount;
    setExecNote(total != null ? `Loaded ${n} of ${total}` : `Loaded ${n} row${n === 1 ? "" : "s"}`);
    setBusy(false);
    setLoadingMore(false);
  }

  const ranDraft = useRef(false);
  const ranImport = useRef(false);
  useEffect(() => {
    if (!initialImport || ranImport.current) return;
    ranImport.current = true;
    void handleImport(initialImport)
      .then(() => setHydrated(true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setHydrated(true);
      });
    // Load once from a saved-query payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImport]);

  useEffect(() => {
    if (!autoExecute || !hydrated || !osName || loadingSchema || ranDraft.current) return;
    if (!selectAll && selected.size === 0 && childChains.length === 0 && extraSelect.length === 0) return;
    ranDraft.current = true;
    void runQuery(pageSize, false);
  }, [autoExecute, hydrated, osName, loadingSchema, selectAll, selected, childChains, extraSelect, pageSize]);

  const formKey = useMemo(
    () =>
      JSON.stringify({
        osName,
        selectAll,
        selected: Array.from(selected).sort(),
        aliases,
        searchOff: Array.from(searchOff).sort(),
        includeSearchTerms,
        includeSearchAttributes,
        extraSelect,
        pinnedSearchAttrs,
        rawWhere,
        childCollection,
        where,
        searchTerms,
        relatedWhere,
        childChains,
        sortRules,
        savedQuery,
        savedParams,
        dynValues,
        pageSize,
      }),
    [
      osName,
      selectAll,
      selected,
      aliases,
      searchOff,
      includeSearchTerms,
      includeSearchAttributes,
      extraSelect,
      pinnedSearchAttrs,
      rawWhere,
      childCollection,
      where,
      searchTerms,
      relatedWhere,
      childChains,
      sortRules,
      savedQuery,
      savedParams,
      dynValues,
      pageSize,
    ],
  );

  useEffect(() => {
    if (!live || paused) {
      skipLive.current = true;
      return;
    }
    if (skipLive.current) {
      skipLive.current = false;
      return;
    }
    if (!osName || loadingSchema) return;
    if (!selectAll && selected.size === 0 && childChains.length === 0) return;
    const t = window.setTimeout(() => {
      void runQuery(pageSize, false, { live: true });
    }, 700);
    return () => window.clearTimeout(t);
    // formKey captures the query; runQuery reads latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, formKey, paused]);

  const endpoint = extractEndpoint(builtResponse);
  const dynSlots = collectDynSlots(savedParams, where, relatedWhere, childChains);
  const templateArgs = dynSlots.length ? buildArgs(pageSize, { template: true }) : null;
  const exportDoc = osName ? exportQueryDoc(buildArgs(pageSize), displaySpec, displayExtra, report, tableView) : null;

  async function saveExisting() {
    if (!loaded || !exportDoc || !osName) return;
    setSaveBusy(true);
    try {
      await patchSavedQuery(tenant.id, loaded.id, { payload: exportDoc, osName });
      setExecNote(`Saved "${loaded.name}"`);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaveBusy(false);
    }
  }
  const columns = displayColumns(selectAll, selected, aliases, rows);
  const displayItems = useMemo(
    () => relatedSelectsFromQuery(childChains, extraSelect),
    [childChains, extraSelect],
  );
  const reportFields = useMemo(
    () =>
      reportFieldsFromQuery(
        fields,
        selected,
        selectAll,
        aliases,
        displaySpec,
        displayItems,
        childFieldsCache,
      ),
    [fields, selected, selectAll, aliases, displaySpec, displayItems, childFieldsCache],
  );
  const fieldTypeByName: Record<string, string> = {};
  for (const f of fields) {
    fieldTypeByName[f.name] = f.type;
    const a = aliases[f.name]?.trim();
    if (a) fieldTypeByName[a] = f.type;
  }
  for (const chain of childChains) {
    for (const hop of chain.hops) {
      const hopFields = childFieldsCache[hop.objectName.toUpperCase()] ?? [];
      for (const f of hopFields) {
        fieldTypeByName[f.name] = f.type;
        const a = hop.aliases?.[f.name]?.trim();
        if (a) fieldTypeByName[a] = f.type;
      }
    }
  }

  async function loadOsByName(name: string): Promise<{
    fields: FieldInfo[];
    relations: ChildRel[];
    compact: ChildRel[];
    primaryObject: string | null;
  } | null> {
    const res = await runTool<{ results?: OsSearchResult[] }>("maximo_get_metadata", {
      uri: `maximo://os/search/${encodeURIComponent(name)}`,
    });
    const hits = res?.results ?? [];
    const hit =
      hits.find((h) => h.osName.toUpperCase() === name.toUpperCase()) ??
      hits[0] ??
      { osName: name };
    return pickOs(hit);
  }

  function applyHydrated(
    imported: ReturnType<typeof hydrateImport>,
    schema: { fields: FieldInfo[]; relations: ChildRel[]; compact: ChildRel[] },
  ) {
    const hydrated = hydrateImport(
      imported,
      schema.fields,
      schema.relations,
      schema.relations.filter((r) => r.inOs),
    );
    setSelectAll(hydrated.selectAll);
    setSelected(new Set(hydrated.selected));
    setAliases(hydrated.aliases);
    setExtraSelect(hydrated.extraSelect);
    setSearchOff(searchOffFromImport(hydrated, hydrated.selected));
    const computed = collectSearchAttributes(
      hydrated.selectAll,
      new Set(hydrated.selected),
      schema.fields,
      searchOffFromImport(hydrated, hydrated.selected),
      hydrated.chains,
      childFieldsRef.current,
    );
    const computedLower = new Set(computed.map((s) => s.toLowerCase()));
    setPinnedSearchAttrs((hydrated.searchAttributes ?? []).filter((a) => !computedLower.has(a.toLowerCase())));
    setWhere(hydrated.where);
    setOrMode(!!hydrated.orMode);
    setTimeline(hydrated.timeline ?? null);
    setDomainInternal(hydrated.domainInternal ?? []);
    setRawWhere(hydrated.rawWhere ?? null);
    setChildChains(hydrated.chains);
    setRelatedWhere([]);
    setSortRules(hydrated.sortRules);
    setSearchTerms(hydrated.searchTerms ?? "");
    setIncludeSearchTerms(true);
    setIncludeSearchAttributes(true);
    if (hydrated.pageSize) setPageSize(hydrated.pageSize);
    setSavedQuery(hydrated.savedQuery ?? null);
    setSavedParams(savedParamsFromImport(hydrated));
    setChildCollection(hydrated.childCollection ?? null);
    setImportedChildOptions(hydrated.childOptions ?? null);
    setDisplaySpec(hydrated.displayFlatten ?? {});
    setDisplayExtra(hydrated.displayExtra ?? {});
    setReport(hydrated.displayReport ?? emptyReport());
    setTableView(hydrated.displayTable ?? emptyTableView());
    setDynValues({});
    for (const chain of hydrated.chains) {
      for (const hop of chain.hops) {
        if (hop.objectName) {
          void loadChildFields(hop.objectName);
          void loadRels(hop.objectName);
        }
      }
    }
    const bits = [...hydrated.notes];
    if (hydrated.dropped.length) bits.push(`Dropped: ${hydrated.dropped.join(", ")}`);
    setExecNote(bits.length ? bits.join(" | ") : `Imported ${hydrated.source}`);
    const preview: Record<string, unknown> = {
      opAction: "query",
      osName: hydrated.osName ?? osName,
      select: {
        fields: buildSelectFields(
          hydrated.selectAll,
          new Set(hydrated.selected),
          hydrated.chains,
          hydrated.aliases,
          hydrated.extraSelect,
          osChildRef.current,
        ),
      },
      pageSize: hydrated.pageSize ?? pageSize,
      collectioncount: true,
    };
    if (hydrated.childCollection) preview.childCollection = hydrated.childCollection;
    if (hydrated.searchTerms) preview.searchTerms = hydrated.searchTerms;
    if (hydrated.searchAttributes?.length) preview.searchAttributes = hydrated.searchAttributes;
    if (hydrated.where.length) preview.where = { conditions: hydrated.where.map((c) => toCondition(c)) };
    else if (hydrated.rawWhere) preview.rawWhere = hydrated.rawWhere;
    if (hydrated.orMode) preview.orMode = true;
    if (timelineReady(hydrated.timeline) && hydrated.timeline) {
      preview.tlrange = formatTlRange(hydrated.timeline);
      preview.tlattribute = formatTlAttribute(hydrated.timeline);
    }
    const diw = serializeDomainInternal(hydrated.domainInternal);
    if (diw) preview.domaininternalwhere = diw;
    if (hydrated.sortRules.length) {
      preview.orderBy = { rules: hydrated.sortRules.map((s) => (s.dir === "desc" ? `-${s.field}` : `+${s.field}`)) };
    }
    const children = childOptionsFromChains(hydrated.chains);
    if (children.length) preview.childOptions = children;
    else if (hydrated.childOptions?.length) preview.childOptions = hydrated.childOptions;
    setBuiltArgs(preview);
    setBuiltResponse(null);
    setResultTab("call");
    return hydrated;
  }

  async function handleImport(
    text: string,
    origin?: DOMRect,
    onProgress?: (steps: ImportStep[]) => void,
  ) {
    const steps: ImportStep[] = [];
    const emit = () => onProgress?.([...steps]);
    const begin = async (id: string, label: string) => {
      steps.push({ id, label, status: "running" });
      emit();
      await paintPause();
    };
    const finish = (id: string, status: "done" | "warn", detail?: string, lines?: string[]) => {
      const step = steps.find((s) => s.id === id);
      if (step) {
        step.status = status;
        step.detail = detail;
        step.lines = lines;
      }
      emit();
    };

    await begin("parse", "Parse input");
    const parsed = parseImport(text);
    if (!parsed.ok) throw new Error(parsed.error);
    finish(
      "parse",
      "done",
      parsed.source === "url" ? "OSLC GET URL" : "tool-call JSON",
      parsed.osName ? [`osName ${parsed.osName}`] : undefined,
    );

    skipLive.current = true;
    setError(null);

    await begin("os", "Set object structure");
    let schema = {
      fields,
      relations,
      compact: currentCompact(primaryObject, relsByObjectRef.current),
      primaryObject,
    };
    const wantOs = parsed.osName;
    if (wantOs && wantOs.toUpperCase() !== (osName ?? "").toUpperCase()) {
      const loaded = await loadOsByName(wantOs);
      if (!loaded) throw new Error(`Could not load object structure ${wantOs}`);
      schema = loaded;
      finish("os", "done", loaded.primaryObject ? `${wantOs} (${loaded.primaryObject})` : wantOs);
    } else if (!osName && wantOs) {
      const loaded = await loadOsByName(wantOs);
      if (!loaded) throw new Error(`Could not load object structure ${wantOs}`);
      schema = loaded;
      finish("os", "done", loaded.primaryObject ? `${wantOs} (${loaded.primaryObject})` : wantOs);
    } else {
      finish("os", "done", osName ? `${osName} already loaded` : "no OS in import");
    }

    await begin("rels", "Load relationships");
    const compact = schema.compact;
    finish(
      "rels",
      compact.length ? "done" : "warn",
      compact.length
        ? `${compact.length} MAXRELATIONSHIP on ${schema.primaryObject ?? primaryObject ?? "parent"}`
        : "no compact relationship list - dotted paths stay as-is",
    );

    await begin("select", "Process select fields");
    const hydrated = applyHydrated(parsed, schema);
    finish("select", "done", `${hydrated.extraSelect.length} nested / rel. tokens`, hydrated.selectLog);

    await begin("where", "Process where clause");
    if (hydrated.where.length) {
      finish(
        "where",
        "done",
        `${hydrated.where.length} condition${hydrated.where.length === 1 ? "" : "s"}`,
        hydrated.where.map((c) =>
          c.op === "isnull" || c.op === "isnotnull" ? `${c.field} ${c.op}` : `${c.field} ${c.op} ${c.value}`,
        ),
      );
    } else if (hydrated.rawWhere) {
      finish("where", "warn", "kept as rawWhere (could not parse)", [hydrated.rawWhere]);
    } else {
      finish("where", "done", "none");
    }

    await begin("rest", "Process the rest");
    const rest: string[] = [];
    if (hydrated.pageSize) rest.push(`pageSize ${hydrated.pageSize}`);
    if (hydrated.searchAttributes?.length) rest.push(`searchAttributes ${hydrated.searchAttributes.length}`);
    if (hydrated.searchTerms) rest.push(`searchTerms "${hydrated.searchTerms}"`);
    if (hydrated.sortRules.length) rest.push(`orderBy ${hydrated.sortRules.length}`);
    if (hydrated.savedQuery) rest.push(`savedQuery ${hydrated.savedQuery}`);
    const displayHops = Object.values(hydrated.displayFlatten ?? {}).filter((f) => f.length).length;
    if (displayHops) rest.push(`display flatten ${displayHops}`);
    if (hydrated.displayReport?.kpis.length) rest.push(`tiles ${hydrated.displayReport.kpis.length}`);
    if (hydrated.displayReport?.charts.length) rest.push(`charts ${hydrated.displayReport.charts.length}`);
    if (hydrated.displayTable && (hydrated.displayTable.header || hydrated.displayTable.columns.length || hydrated.displayTable.rules.length)) {
      rest.push("table view");
    }
    if (hydrated.dropped.length) rest.push(`dropped ${hydrated.dropped.join(", ")}`);
    finish("rest", "done", rest.length ? rest.join(" | ") : "nothing else");

    await begin("apply", "Apply to builder");
    finish("apply", "done", "ready");
    await paintPause();

    if (origin) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFlight({ origin, chips: chipsFromImport(hydrated) }));
      });
    }
  }

  const tourRef = useRef({
    searchOs,
    pickOs,
    loadChildFields,
    loadRels,
    childChains,
    extraSelect,
    applyHydrated,
    primaryObject,
  });
  tourRef.current = {
    searchOs,
    pickOs,
    loadChildFields,
    loadRels,
    childChains,
    extraSelect,
    applyHydrated,
    primaryObject,
  };

  useEffect(() => {
    const allowed = new Set(displayItems.map((i) => i.key));
    setDisplaySpec((prev) => {
      const keys = Object.keys(prev);
      if (keys.every((k) => allowed.has(k))) return prev;
      const next: DisplaySpec = {};
      for (const k of keys) if (allowed.has(k)) next[k] = prev[k];
      return next;
    });
  }, [displayItems]);

  useEffect(() => {
    const onTour = async (e: Event) => {
      const api = tourRef.current;
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      try {
        if (action === "demo-os") {
          setSearchFocus(true);
          let hits = await api.searchOs("mxapiwo");
          if (!hits.length) hits = await api.searchOs("wo");
          if (!hits.length) hits = await api.searchOs("workorder");
          await new Promise((r) => setTimeout(r, 400));
          const hit = pickBestOs(hits);
          if (!hit) throw new Error("No object structure matched MXAPIWO on this tenant.");
          await api.pickOs(hit);
        } else if (action === "demo-story" || action === "demo-fields") {
          if (!fieldsRef.current.length) throw new Error("Pick an object structure first.");
          const parsed = parseImport(JSON.stringify(TOUR_QUERY));
          if (!parsed.ok) throw new Error(parsed.error);
          api.applyHydrated(parsed, {
            fields: fieldsRef.current,
            relations: relationsRef.current,
            compact: currentCompact(api.primaryObject, relsByObjectRef.current),
          });
          await new Promise((r) => setTimeout(r, 80));
        } else if (action === "demo-child") {
          const rel = pickDemoRel(relationsRef.current);
          if (!rel) throw new Error("This OS has no relationships to hop.");
          await api.loadChildFields(rel.objectName);
          await api.loadRels(rel.objectName);
          const hopFields = childFieldsRef.current[rel.objectName.toUpperCase()] ?? [];
          const hopSelected = pickNamed(hopFields, ["assetnum", "description", "status", "location", "ticketid"], 4);
          const hop0 = {
            ...emptyChain(rel).hops[0],
            selectAll: hopSelected.length === 0,
            selected: hopSelected,
          };
          setChildChains([{ hops: [hop0] }]);
        } else if (action === "demo-child-hop") {
          const chain = api.childChains[0];
          if (!chain?.hops[0]) throw new Error("Add a child relationship first.");
          const leaf = chain.hops[chain.hops.length - 1];
          await api.loadRels(leaf.objectName);
          const nextRels = (relsByObjectRef.current[leaf.objectName] ?? []).filter(
            (r) => r.relation.toUpperCase() !== leaf.relationship.toUpperCase(),
          );
          const hop2rel = pickDemoHop2(nextRels);
          if (!hop2rel) throw new Error("No ACTIVEASSETMETER (or similar) hop from this object.");
          await api.loadChildFields(hop2rel.objectName);
          await api.loadRels(hop2rel.objectName);
          const hop1 = { ...emptyChain(hop2rel).hops[0], selectAll: true, selected: [] };
          setChildChains([{ hops: [...chain.hops, hop1] }]);
        } else if (action === "demo-where") {
          const names = pickNamed(fieldsRef.current, ["istask", "historyflag", "worktype", "status"], 1);
          const field = names[0];
          if (!field) throw new Error("No where field available.");
          const value = field.toLowerCase() === "worktype" ? "PM" : "0";
          setSavedQuery(null);
          setWhere([{ field, op: "=", value }]);
        } else if (action === "demo-sort") {
          const names = pickNamed(fieldsRef.current, ["wonum", "changedate", "status", "workorderid"], 1);
          if (!names[0]) throw new Error("No sort field available.");
          setSortRules([{ field: names[0], dir: "asc" }]);
        } else if (action === "demo-display") {
          const items = relatedSelectsFromQuery(api.childChains, api.extraSelect);
          const first = items[0];
          if (first) {
            const fields = first.selectAll
              ? pickNamed(childFieldsRef.current[first.objectName.toUpperCase()] ?? [], ["assetnum", "description", "status", "owner"], 2)
              : first.fieldList.slice(0, 4);
            setDisplaySpec({ [first.key]: fields });
          }
        } else if (action === "demo-page") {
          setPageSize(10);
        } else {
          throw new Error("Unknown tour action");
        }
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
    <div className={`builder${searchFocus ? " dim" : ""}`}>
      <TopBar
        tenant={tenant}
        mcpConnected={mcpConnected}
        query={query}
        searching={searching}
        results={results}
        osName={osName}
        focused={searchFocus}
        onQuery={setQuery}
        onSearch={searchOs}
        onPick={pickOs}
        onFocus={() => setSearchFocus(true)}
        onBlur={() => setSearchFocus(false)}
        live={live}
        onLive={() => {
          skipLive.current = true;
          setLive((v) => {
            if (!v) morphFocus(false);
            return !v;
          });
        }}
        onSwitchTenant={onSwitchTenant}
        onResync={onResync}
        onHome={onHome}
        chrome={reportOnly ? "report" : "full"}
        title={loaded?.name}
      />
      <div className={`builder-body${focusBuild ? " focus-build" : ""}${focusResults ? " focus-results" : ""}${reportOnly ? " report-only" : ""}`}>
        <motion.aside
          className={`logic-col${live ? " live" : ""}`}
          initial={false}
          animate={{
            flexGrow: focusResults ? 0 : 1,
            flexShrink: focusResults ? 0 : 1,
            flexBasis: focusResults ? 44 : focusBuild ? 0 : 380,
            maxWidth: focusResults ? 44 : focusBuild ? 9999 : 420,
            minWidth: focusResults ? 44 : focusBuild ? 0 : 340,
          }}
          transition={morph}
        >
          <motion.button
            type="button"
            className="query-rail"
            onClick={() => setFocusResults(false)}
            title="Show the query builder"
            initial={false}
            animate={{ opacity: focusResults ? 1 : 0 }}
            transition={fade}
            tabIndex={focusResults ? 0 : -1}
            style={{ pointerEvents: focusResults ? "auto" : "none" }}
          >
            <span className="output-rail-inner">
              <span className="output-rail-dot" />
              Query
            </span>
          </motion.button>
          <div className="logic-col-head">
            <span className="logic-col-kicker">{loaded ? loaded.name : "Query"}</span>
            <div className="logic-col-head-actions">
              <button
                type="button"
                className="ghost copy-btn"
                data-tour="import"
                onClick={() => setImportOpen(true)}
                title="Paste os_query_builder JSON or an OSLC GET URL"
              >
                <Icon icon={faFileImport} /> Import
              </button>
              {exportDoc && (
                loaded ? (
                  <>
                    <button
                      type="button"
                      className="ghost copy-btn"
                      disabled={saveBusy}
                      onClick={() => void saveExisting()}
                      title={`Update "${loaded.name}"`}
                    >
                      <Icon icon={faFloppyDisk} /> {saveBusy ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="ghost copy-btn"
                      onClick={() => setSaveOpen(true)}
                      title="Save a new library entry"
                    >
                      Save as
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ghost copy-btn"
                    onClick={() => setSaveOpen(true)}
                    title="Save this query to the library"
                  >
                    <Icon icon={faFloppyDisk} /> Save
                  </button>
                )
              )}
              <button
                type="button"
                className="ghost copy-btn"
                onClick={() => morphFocus(!focusBuildRef.current)}
                title={focusBuild ? "Show tool call and results" : "Give the builder the full width"}
              >
                {focusBuild ? "Show results" : "Widen"}
              </button>
            </div>
          </div>
          <div className="logic-scroll">
            {error && <div className="error-box">{error}</div>}
            {!osName && <div className="empty-hint">Search for an object structure to start.</div>}
            {osName && (
              <>
                <div className="studio-fields">
                  <p className="studio-col-kicker">Select</p>
                  <FieldPanel
                    fields={fields}
                    selected={selected}
                    selectAll={selectAll}
                    loading={loadingSchema}
                    intent={initialDraft?.intent ?? ""}
                    aliases={aliases}
                    searchOff={searchOff}
                    includeSearchTerms={includeSearchTerms}
                    includeSearchAttributes={includeSearchAttributes}
                    onToggle={toggleField}
                    onSelectAll={() => { setSelectAll(true); setSelected(new Set()); }}
                    onSelectNone={() => { setSelectAll(false); setSelected(new Set()); setSearchOff(new Set()); setAliases({}); }}
                    onSelectUseful={() => {
                      const names = usefulOrFallback(fields, initialDraft?.intent ?? "").map((f) => f.name);
                      setSelectAll(false);
                      setSelected((prev) => new Set(selectAll ? names : mergeFieldNames([...prev], names)));
                      setSearchOff((prev) => {
                        const next = new Set(prev);
                        for (const f of fields) {
                          if (!fieldAllowsSearch(f, fields)) next.add(f.name);
                        }
                        return next;
                      });
                    }}
                    onAlias={(name, alias) => setAliases((prev) => ({ ...prev, [name]: alias }))}
                    onSearch={(name, on) =>
                      setSearchOff((prev) => {
                        const next = new Set(prev);
                        on ? next.delete(name) : next.add(name);
                        return next;
                      })
                    }
                    onIncludeSearchTerms={setIncludeSearchTerms}
                    onIncludeSearchAttributes={setIncludeSearchAttributes}
                    extraSelect={extraSelect}
                    onRemoveExtra={(token) => setExtraSelect((prev) => prev.filter((t) => t !== token))}
                  />
                  {childCollection && (
                    <div className="panel-block">
                      <div className="spread">
                        <span className="muted mono" style={{ fontSize: "0.75rem" }}>
                          childCollection {childCollection.relationship} of {childCollection.parentRecordId}
                        </span>
                        <button className="ghost" onClick={() => setChildCollection(null)}>clear</button>
                      </div>
                    </div>
                  )}
                  <SortPanel
                    fields={fields}
                    rules={sortRules}
                    onAdd={() => {
                      const used = new Set(sortRules.map((s) => s.field));
                      const next = fields.find((f) => !used.has(f.name)) ?? fields[0];
                      if (next) setSortRules((prev) => [...prev, { field: next.name, dir: "asc" }]);
                    }}
                    onUpdate={(i, patch) => setSortRules((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))}
                    onRemove={(i) => setSortRules((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </div>
                <div className="studio-filter">
                  <p className="studio-col-kicker">Filter</p>
                  <WherePanel
                    fields={fields}
                    where={where}
                    disabled={!!savedQuery}
                    related={relatedWhere}
                    primaryRels={relations}
                    childFieldsCache={childFieldsCache}
                    childFieldStatus={childFieldStatus}
                    relsByObject={relsByObject}
                    onAdd={() => setWhere((prev) => [...prev, { field: fields[0]?.name ?? "", op: "=", value: "" }])}
                    onUpdate={(i, patch) => setWhere((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))}
                    onRemove={(i) => setWhere((prev) => prev.filter((_, idx) => idx !== i))}
                    onAddRelated={() => {
                      if (!relations.length) return;
                      const rel = relations[0];
                      setRelatedWhere((prev) => [...prev, emptyRelatedWhere(rel)]);
                      loadChildFields(rel.objectName);
                      loadRels(rel.objectName);
                    }}
                    onChangeRelated={(i, next) => {
                      setRelatedWhere((prev) => prev.map((f, idx) => (idx === i ? next : f)));
                      for (const h of next.hops) {
                        if (h.objectName) {
                          loadChildFields(h.objectName);
                          loadRels(h.objectName);
                        }
                      }
                    }}
                    onRemoveRelated={(i) => setRelatedWhere((prev) => prev.filter((_, idx) => idx !== i))}
                    onNeedRels={loadRels}
                    onNeedFields={loadChildFields}
                    onNeedDomain={loadDomain}
                    domainByField={domainByField}
                    domainLoading={domainLoading}
                    orMode={orMode}
                    onOrMode={setOrMode}
                  />
                  <TimelineCard
                    fields={fields}
                    value={timeline}
                    onChange={setTimeline}
                    disabled={!!savedQuery}
                    tour="timeline"
                  />
                  <DomainInternalCard
                    fields={fields}
                    clauses={domainInternal}
                    onChange={setDomainInternal}
                    disabled={!!savedQuery}
                    tour="domain"
                  />
                  <ChildWherePanel
                    primaryRels={relations}
                    chains={childChains}
                    childFieldsCache={childFieldsCache}
                    childFieldStatus={childFieldStatus}
                    osChildObjects={osChildObjects}
                    relsByObject={relsByObject}
                    intent={initialDraft?.intent ?? ""}
                    onAddChain={addChildBlock}
                    onChange={(i, next) => {
                      setChildChains((prev) => prev.map((c, idx) => (idx === i ? next : c)));
                      for (const hop of next.hops) {
                        if (hop.objectName) {
                          loadChildFields(hop.objectName);
                          loadRels(hop.objectName);
                        }
                      }
                    }}
                    onRemove={(i) => setChildChains((prev) => prev.filter((_, idx) => idx !== i))}
                    onNeedRels={loadRels}
                    onNeedFields={loadChildFields}
                  />
                  <SavedQueryPanel
                    queries={savedQueries}
                    selected={savedQuery}
                    params={savedParams}
                    onSelect={setSavedQuery}
                    onParams={setSavedParams}
                  />
                  <DynamicValuesPanel slots={dynSlots} values={dynValues} onChange={setDynValues} />
                  <DisplayConfigPanel
                    items={displayItems}
                    spec={displaySpec}
                    childFieldsCache={childFieldsCache}
                    onAdd={(item) => {
                      setDisplaySpec((prev) => ({
                        ...prev,
                        [item.key]: item.selectAll ? [] : [...item.fieldList],
                      }));
                      if (item.objectName) void loadChildFields(item.objectName);
                    }}
                    onRemove={(key) =>
                      setDisplaySpec((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                    onToggleField={(key, field, on) =>
                      setDisplaySpec((prev) => {
                        const cur = prev[key] ?? [];
                        const has = cur.some((f) => f.toLowerCase() === field.toLowerCase());
                        const nextFields = on
                          ? (has ? cur : [...cur, field])
                          : cur.filter((f) => f.toLowerCase() !== field.toLowerCase());
                        return { ...prev, [key]: nextFields };
                      })
                    }
                    onSetFields={(key, fields) =>
                      setDisplaySpec((prev) => ({ ...prev, [key]: fields }))
                    }
                  />
                  <ChartConfigPanel spec={report} fields={reportFields} onChange={setReport} />
                  <TableViewPanel
                    view={tableView}
                    fields={reportFields.map((f) => f.name)}
                    onChange={setTableView}
                  />
                </div>
              </>
            )}
          </div>
          {osName && (
            <div className="execute-bar">
              <div className="execute-bar-row">
                <div className="page-size-field" data-flight="pagesize" data-tour="pagesize">
                  <span className="page-size-prefix">Page</span>
                  <input
                    type="number"
                    min={1}
                    aria-label="Page size"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  />
                </div>
                <button
                  className="go"
                  data-tour="execute"
                  onClick={() => runQuery(pageSize, false)}
                  disabled={busy || loadingMore || (!selectAll && selected.size === 0 && childChains.length === 0 && extraSelect.length === 0)}
                >
                  <Icon icon={faPlay} />
                  {busy ? "Running..." : "Execute query"}
                </button>
                <button
                  type="button"
                  className="ghost execute-insight"
                  onClick={() => setInsightOpen(true)}
                  title="Anatomy of the OSLC query"
                >
                  <Icon icon={faDiagramProject} />
                  Insight
                </button>
              </div>
              <div className={`execute-status ${busy || loadingMore ? "running" : error ? "err" : execNote?.includes("keeping previous") ? "warn" : execNote ? "ok" : ""}`}>
                {(busy || loadingMore) && <span className="spinner" />}
                {error ? error : execNote}
              </div>
            </div>
          )}
        </motion.aside>
        <motion.main
          className="output-col"
          initial={false}
          animate={{
            flexGrow: focusBuild ? 0 : 1,
            flexShrink: 0,
            flexBasis: focusBuild ? 44 : 0,
            minWidth: focusBuild ? 44 : 0,
            paddingTop: focusBuild ? 0 : 16,
            paddingBottom: focusBuild ? 0 : 16,
            paddingLeft: focusBuild ? 0 : 20,
            paddingRight: focusBuild ? 0 : 20,
          }}
          transition={morph}
        >
          <motion.button
            type="button"
            className="output-rail"
            onClick={() => morphFocus(false)}
            title="Show tool call and results"
            initial={false}
            animate={{ opacity: focusBuild ? 1 : 0 }}
            transition={fade}
            tabIndex={focusBuild ? 0 : -1}
            style={{ pointerEvents: focusBuild ? "auto" : "none" }}
          >
            <span className="output-rail-inner">
              <span className="output-rail-dot" />
              Results
            </span>
          </motion.button>
          <motion.div
            className="output-col-body"
            initial={false}
            animate={{
              opacity: focusBuild ? 0 : 1,
              filter: focusBuild ? "blur(6px)" : "blur(0px)",
            }}
            transition={{
              ...fade,
              delay: focusBuild ? 0 : 0.08,
            }}
            style={{ pointerEvents: focusBuild ? "none" : "auto" }}
          >
          <div className="output-col-scroll">
          <ResultPanel
            tab={resultTab}
            onTab={setResultTab}
            builtArgs={builtArgs}
            templateArgs={templateArgs}
            builtResponse={builtResponse}
            endpoint={endpoint}
            rows={rows}
            columns={columns}
            fieldTypeByName={fieldTypeByName}
            meta={meta}
            busy={busy && !(live && rows.length > 0)}
            loadingMore={loadingMore}
            onLoadMore={() => runQuery(rows.length + pageSize, true)}
            searchTerms={searchTerms}
            onSearchTerms={setSearchTerms}
            onApplySearch={() => void runQuery(pageSize, false, { applySearch: true })}
            flattenKeys={displaySpec}
            report={report}
            reportFields={reportFields}
            tableView={tableView}
            exportDoc={exportDoc}
            onSave={exportDoc ? (loaded ? () => void saveExisting() : () => setSaveOpen(true)) : undefined}
            onSaveAs={loaded && exportDoc ? () => setSaveOpen(true) : undefined}
            saveBusy={saveBusy}
            reportOnly={reportOnly}
            onInsight={() => setInsightOpen(true)}
          />
          </div>
          </motion.div>
        </motion.main>
      </div>
      {insightOpen && (
        <InsightDialog
          args={osName ? buildArgs(pageSize) : null}
          endpoint={endpoint}
          joins={[
            ...joinsFromChains(childChains, (hops, i) => hopJoinClause(hops, i, relations, relsByObject)),
            ...joinsFromChains(relatedWhere, (hops, i) => hopJoinClause(hops, i, relations, relsByObject)),
          ]}
          onClose={() => setInsightOpen(false)}
        />
      )}
      {importOpen && (
        <ImportDialog onImport={handleImport} onClose={() => setImportOpen(false)} />
      )}
      {saveOpen && exportDoc && osName && (
        <SaveQueryDialog
          tenantId={tenant.id}
          osName={osName}
          payload={exportDoc}
          seed={loaded}
          onCreated={(q) => setLoaded(q)}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {flight && (
        <ImportFlight
          origin={flight.origin}
          chips={flight.chips}
          onDone={() => setFlight(null)}
        />
      )}
    </div>
  );
}
