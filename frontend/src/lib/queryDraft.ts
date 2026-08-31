/** Wizard output shape the builder hydrates (not the MCP payload). */
import {
  ChildChain,
  ChildRel,
  DomainInternalClause,
  OsSearchResult,
  QueryParam,
  RelatedWhere,
  SavedQuery,
  SortRule,
  TimelineQuery,
  WhereCondition,
} from "../types";
import { DisplaySpec, emptyHop, relatedHasConds } from "./schema";

export function draftToRelatedWhere(d: QueryDraft): RelatedWhere[] {
  const keep = (f: RelatedWhere) => f.hops.length && relatedHasConds(f);
  const out = d.relatedWhere.filter(keep);
  if (d.relatedFilter && keep(d.relatedFilter)) out.push(d.relatedFilter);
  if (out.length) return out;
  if (!d.relatedRel || !d.relatedConds.some((c) => c.field)) return [];
  return [{
    hops: [{
      relationship: d.relatedRel.relation,
      objectName: d.relatedRel.objectName,
      whereClause: d.relatedRel.whereClause,
      conditions: d.relatedConds.filter((c) => c.field),
    }],
    conditions: d.relatedConds.filter((c) => c.field),
  }];
}

export type QueryDraft = {
  intent: string;
  wantSaved: boolean | null;
  osHit: OsSearchResult | null;
  selected: string[];
  selectAll: boolean;
  childRels: ChildRel[];
  childSelected: Record<string, string[]>;
  childSelectAll: Record<string, boolean>;
  childChains: ChildChain[];
  where: WhereCondition[];
  relatedWhere: RelatedWhere[];
  relatedFilter: RelatedWhere | null;
  /** Parent where.orMode - Maximo combines conditions with OR. */
  orMode: boolean;
  timeline: TimelineQuery | null;
  domainInternal: DomainInternalClause[];
  /** @deprecated legacy single-hop */
  relatedRel: ChildRel | null;
  /** @deprecated legacy */
  relatedConds: WhereCondition[];
  /** @deprecated legacy */
  childConditions: Record<string, WhereCondition[]>;
  savedQuery: string | null;
  savedQueries: SavedQuery[];
  savedParams: Record<string, QueryParam>;
  sortRules: SortRule[];
  pageSize: number;
  pageTouched: boolean;
  displaySpec: DisplaySpec;
};

export function emptyDraft(): QueryDraft {
  return {
    intent: "",
    wantSaved: null,
    osHit: null,
    selected: [],
    selectAll: false,
    childRels: [],
    childSelected: {},
    childSelectAll: {},
    childChains: [],
    where: [],
    relatedWhere: [],
    relatedFilter: null,
    orMode: false,
    timeline: null,
    domainInternal: [],
    relatedRel: null,
    relatedConds: [],
    childConditions: {},
    savedQuery: null,
    savedQueries: [],
    savedParams: {},
    sortRules: [],
    pageSize: 50,
    pageTouched: false,
    displaySpec: {},
  };
}

export function draftToChildChains(d: QueryDraft): ChildChain[] {
  if (d.childChains.length > 0) return d.childChains;
  return d.childRels.map((rel) => {
    const hop = emptyHop(rel);
    const key = rel.objectName;
    hop.selectAll = d.childSelectAll[key] ?? hop.selectAll;
    hop.selected = d.childSelected[key] ?? [];
    // No FieldInfo here; Wizard trims via searchNamesFrom. Execute still
    // drops YORN / OS extras in collectSearchAttributes.
    hop.searchFields = hop.selected;
    hop.conditions = d.childConditions[key] ?? [];
    return { hops: [hop] };
  });
}

export function syncChildChainsFromSelect(d: QueryDraft): ChildChain[] {
  return d.childRels.map((rel) => {
    const hop = emptyHop(rel);
    hop.selectAll = d.childSelectAll[rel.objectName] ?? hop.selectAll;
    hop.selected = d.childSelected[rel.objectName] ?? [];
    hop.searchFields = hop.selected; // filtered at collectSearchAttributes
    hop.conditions = [];
    return { hops: [hop] };
  });
}
