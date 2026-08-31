/**
 * Tour catalog - edit THIS file to add, remove, or rewrite a step.
 *
 * Builder: BUILDER_TOUR
 * Wizard:  WIZARD_TOUR
 *
 * Copy is always three beats: this panel / how you use it / this tour's example.
 * `onNext.action` is handled in Builder.tsx or Wizard.tsx (search TOUR_EVENT).
 * `onNext.go` tells App to open wizard or builder.
 * Targets are `data-tour` attributes on the live UI.
 */
import { EXAMPLE } from "./example";
import { TourDef, TourStepDef } from "./types";

export { EXAMPLE };

function s(step: TourStepDef): TourStepDef {
  return { side: "left", align: "start", ...step };
}

/** Compact wizard targets: sit to the right of the question, not on top of it. */
function w(step: TourStepDef): TourStepDef {
  return { side: "right", align: "start", ...step };
}

export const BUILDER_TOUR: TourDef = {
  id: "builder",
  title: "Builder",
  blurb: `Hands-on console tour: ${EXAMPLE.os} PM work orders - columns, ${EXAMPLE.childPath}, ${EXAMPLE.child2}, ${EXAMPLE.child3Path}, where, timeline, domain-internal, search, sort. Nothing is executed until you choose to.`,
  steps: [
    s({
      id: "door-wizard",
      target: '[data-tour="door-wizard"]',
      lock: true,
      side: "bottom",
      align: "center",
      copy: {
        title: "Wizard",
        what: "One question at a time when you are still deciding the query.",
        how: "Use it to pick the object structure, columns, children, and filters without seeing every panel at once.",
        example: "This tour stays in the Builder. Wizard is still on Home if you prefer one question at a time.",
      },
    }),
    s({
      id: "door-builder",
      target: '[data-tour="door-builder"]',
      lock: true,
      side: "bottom",
      align: "center",
      nextLabel: "Open builder",
      copy: {
        title: "Builder",
        what: "The full console: object structure, columns, child hops, where, sort, display, then execute.",
        how: "Change any panel; Execute runs a live page from Maximo. Insight shows how the GET is driven.",
        example: `Next opens the Builder and we assemble a sample ${EXAMPLE.os} PM work-order query. Nothing is executed until you choose to.`,
      },
      onNext: { go: "builder", wait: '[data-tour="os"]' },
    }),
    s({
      id: "os",
      target: '[data-tour="os"]',
      nextLabel: `Search ${EXAMPLE.os}`,
      copy: {
        title: "Object structure",
        what: "Every query starts with an object structure (the Maximo OS).",
        how: "Type a name or fragment, pick a hit. Schema, relationships, and saved queries load from that OS.",
        example: `Next searches mxapiwo on your tenant and selects ${EXAMPLE.os} (or the closest work-order OS).`,
      },
      onNext: { action: "demo-os", busy: "Searching...", wait: '[data-tour="fields"]' },
    }),
    s({
      id: "os-on",
      target: '[data-tour="os"]',
      lock: true,
      copy: {
        title: "OS is set",
        what: "The query now targets this object structure.",
        how: "You can search again any time to switch OS - that resets columns and hops.",
        example: `${EXAMPLE.os} (or the closest match) is selected. Next loads the full sample onto every panel.`,
      },
    }),
    s({
      id: "fields",
      target: '[data-tour="fields"]',
      side: "right",
      nextLabel: "Load sample",
      copy: {
        title: "Columns",
        what: "Parent fields become the table columns Maximo returns (oslc.select).",
        how: "Check attributes you need. Search marks a field for searchAttributes. Alias renames the result key.",
        example: `Next loads the sample: ${EXAMPLE.fields} plus nested ${EXAMPLE.child}, ${EXAMPLE.child2}, and ${EXAMPLE.child3} - with where, timeline, domain-internal, searchAttributes, and sort.`,
      },
      onNext: { action: "demo-story", busy: "Loading sample...", wait: '[data-tour="child-added"]' },
    }),
    s({
      id: "fields-on",
      target: '[data-tour="fields"]',
      lock: true,
      side: "right",
      copy: {
        title: "Those columns are on",
        what: "Checked fields are the parent select for this query.",
        how: "Add or remove any time. * still means every parent attribute.",
        example: `${EXAMPLE.fields} are checked (or the closest fields this OS has). Nested rel. tokens live in Child options, not as extra parent chips.`,
      },
    }),
    s({
      id: "child",
      target: '[data-tour="child"]',
      lock: true,
      copy: {
        title: "Child options",
        what: "Related objects nest in the same GET. A relationship is added first; a hop from that leaf goes one level deeper.",
        how: "Three blocks on this sample: a deep asset ancestry, the work-order location, and activities with meters.",
        example: `Next looks at ${EXAMPLE.childPath} - the first block.`,
      },
    }),
    s({
      id: "child-on",
      target: '[data-tour="child-added"]',
      lock: true,
      copy: {
        title: `${EXAMPLE.child} ancestry`,
        what: "This block is the first child relationship - related rows nested under each parent.",
        how: "Path is the hop chain. Click a pill to edit that object's select and where. The w mark is a filter on that hop, not on the parent.",
        example: `${EXAMPLE.childPath} is on the query. ${EXAMPLE.hopLeaf} has where istask=0 (childOptions.path).`,
      },
    }),
    s({
      id: "child-hop-on",
      target: '[data-tour="child-hop-leaf"]',
      lock: true,
      copy: {
        title: "The hop is on the path",
        what: `The path is ${EXAMPLE.childPath}. Each pill is a hop you can click to edit that object's select and where.`,
        how: "Child where on OPENWO trims related open work orders (istask=0), not parent PM rows.",
        example: `${EXAMPLE.hopLeaf} is nested under ${EXAMPLE.child} -> ${EXAMPLE.hop}. Next is the other two relationships.`,
      },
    }),
    s({
      id: "child-more",
      target: '[data-tour="child-more"]',
      lock: true,
      copy: {
        title: "Sibling relationships",
        what: "Each top-level relationship is its own Child options block - not a hop on the first path.",
        how: "Add relationship for a new block. Hop from the leaf to go deeper on that block only.",
        example: `${EXAMPLE.child2} is 1:1 location. ${EXAMPLE.child3Path} nests meters under each activity. Next is parent where.`,
      },
    }),
    s({
      id: "where",
      target: '[data-tour="where"]',
      lock: true,
      copy: {
        title: "Where",
        what: "Parent filters decide which work-order rows return (oslc.where).",
        how: "Add a condition on a parent field. Related-object filters (exists-style) live in the related section; child-row filters live on the hop.",
        example: `${EXAMPLE.where} is on the parent. Next is the date-range (timeline) filter.`,
      },
    }),
    s({
      id: "where-on",
      target: '[data-tour="where-added"]',
      lock: true,
      copy: {
        title: "Those filters are live",
        what: "These conditions are on the parent row.",
        how: "Change the operator or value any time. Saved queries bypass this panel.",
        example: "Non-task, non-history, any asset, work type PM. Next is timeline.",
      },
    }),
    s({
      id: "timeline",
      target: '[data-tour="timeline"]',
      lock: true,
      side: "right",
      copy: {
        title: "Timeline",
        what: "Date-range filter on a DATE/DATETIME field. Maximo's tlrange + tlattribute, not a pair of where conditions.",
        how: "Past -3 months on changedate is tlrange=-3M and tlattribute=changedate. + is future, +/- is both sides of now. Units: D W M Y h m s (M months != m minutes). Same two keys exist on each child hop.",
        example: `${EXAMPLE.timeline} is set on this sample. Next is domain-internal where.`,
      },
    }),
    s({
      id: "domain",
      target: '[data-tour="domain"]',
      lock: true,
      side: "right",
      copy: {
        title: "Domain internal where",
        what: "Filters on internal/domain-coded values (often synonym status), not the display label.",
        how: "Sends domaininternalwhere as field=value with no quotes. Use this when the SYNONYMDOMAIN internal value differs from what the UI shows.",
        example: `${EXAMPLE.domain} - waiting for approval, internal code. Next is sort.`,
      },
    }),
    s({
      id: "sort",
      target: '[data-tour="sort"]',
      lock: true,
      side: "right",
      copy: {
        title: "Sort",
        what: "Orders parent rows (oslc.orderby).",
        how: "Add a field, then pick + or -. Sort is parent-only - not nested collections.",
        example: `${EXAMPLE.sort} is set (+wonum). Next is how searchAttributes / searchTerms are sent.`,
      },
    }),
    s({
      id: "sort-on",
      target: '[data-tour="sort-added"]',
      lock: true,
      side: "right",
      copy: {
        title: "Sort is on",
        what: "Parent rows will come back in this order.",
        how: "Add more fields for a tie-break, or remove this rule.",
        example: `${EXAMPLE.sort} is set. Next is searchAttributes - which fields Maximo text-searches.`,
      },
    }),
    s({
      id: "search",
      target: '[data-tour="search-call"]',
      lock: true,
      side: "right",
      copy: {
        title: "Search",
        what: "searchAttributes lists which fields Maximo text-searches. searchTerms is the string, typed in the results filter.",
        how: "Uncheck search on a column to drop it from searchAttributes. After Execute, type a term and press Enter (or Search) to re-run.",
        example: "The sample sends searchAttributes from parent + hops. Type a term in the results filter after Execute - Enter or Search re-runs with searchTerms.",
      },
    }),
    s({
      id: "display",
      target: '[data-tour="display"]',
      side: "top",
      nextLabel: `Flatten ${EXAMPLE.child}`,
      copy: {
        title: "Display config",
        what: "Display only. Flatten a 1:1 related record into extra parent-table columns. The GET is unchanged.",
        how: `Add a hop that is already in the query. ${EXAMPLE.child} and ${EXAMPLE.childPath} are separate. Check the columns to lift. Flattening does not hide nested child tables.`,
        example: `Next flattens the first hop (${EXAMPLE.child}). ${EXAMPLE.hopLeaf} rows still show as a nested table under that hop.`,
      },
      onNext: { action: "demo-display", busy: "Updating...", wait: '[data-tour="display-card"]' },
    }),
    s({
      id: "display-on",
      target: '[data-tour="display-card"]',
      lock: true,
      side: "top",
      copy: {
        title: "Flatten is on",
        what: `Checked fields from this hop become parent columns like ${EXAMPLE.child}.assetnum after you execute.`,
        how: `Add ${EXAMPLE.hop} the same way if you want child-of-child columns. Nested collections on a flattened hop still expand in results.`,
        example: "The query still nests those objects. Flatten only adds parent columns; child tables remain.",
      },
    }),
    s({
      id: "report",
      target: '[data-tour="report"]',
      lock: true,
      side: "top",
      copy: {
        title: "Charts",
        what: "Tiles and charts on the results page. Display only - not part of the Maximo GET.",
        how: "Suggest picks count / status / date charts from selected columns. Clear removes them. They save with the query.",
        example: "Leave empty for this sample. Next is the results table layout.",
      },
    }),
    s({
      id: "table-view",
      target: '[data-tour="table-view"]',
      lock: true,
      side: "top",
      copy: {
        title: "Table view",
        what: "Column order, labels, hidden columns, and row/cell color rules for the results table.",
        how: "Drag rows to reorder. Color rules run on the current page of flattened rows.",
        example: "Also display-only. Next is page size, then you're ready to execute.",
      },
    }),
    s({
      id: "pagesize",
      target: '[data-tour="pagesize"]',
      lock: true,
      side: "top",
      copy: {
        title: "Page size",
        what: "How many parent rows Maximo sends per page.",
        how: "Start small while you check shape. Load more asks for a bigger pageSize; there is no page number on ws_load.",
        example: `This sample uses page size ${EXAMPLE.pageSize}. Execute is next - this tour will not run the query against Maximo.`,
      },
    }),
    s({
      id: "execute",
      target: '[data-tour="execute"]',
      side: "top",
      align: "center",
      copy: {
        title: "Execute",
        what: "Sends this query through os_query_builder and shows a page of results.",
        how: "Insight (next to Execute) is the anatomy graph. Save next to Import stores this query in the library, including display flatten, charts, and table colors. After results load, the table search re-runs with searchTerms.",
        example: `That's the ${EXAMPLE.os} PM sample. Hit Execute when you want a live page. Done closes the tour.`,
      },
    }),
  ],
};

export const WIZARD_TOUR: TourDef = {
  id: "wizard",
  title: "Wizard",
  blurb: `Same ${EXAMPLE.os} example, one question at a time: columns, ${EXAMPLE.child}, hop ${EXAMPLE.hop}, where, sort, display.`,
  steps: [
    w({
      id: "door-wizard",
      target: '[data-tour="door-wizard"]',
      lock: true,
      side: "bottom",
      align: "center",
      nextLabel: "Open wizard",
      copy: {
        title: "Wizard",
        what: "One question at a time. The same query the Builder would build, told as a story.",
        how: "Answer each screen. Back is always available. At the end you open the Builder or run it.",
        example: `Next opens the Wizard and we build the same sample: ${EXAMPLE.os}, ${EXAMPLE.child}, then ${EXAMPLE.hop}. Nothing is executed until you choose to.`,
      },
      onNext: { go: "wizard", wait: '[data-tour="wiz-intent"]' },
    }),
    w({
      id: "intent",
      target: '[data-tour="wiz-intent"]',
      nextLabel: "Skip to OS",
      copy: {
        title: "Intent",
        what: "Optional. A short note of what this query is for.",
        how: "Type it in Maximo language, or skip. This tour skips ahead to object structure.",
        example: "Next fills a short PM work-order intent, skips the saved-query question, and lands on object structure.",
      },
      onNext: { action: "wiz-start", busy: "Starting...", wait: '[data-tour="wiz-os"]' },
    }),
    w({
      id: "os",
      target: '[data-tour="wiz-os"]',
      nextLabel: `Search ${EXAMPLE.os}`,
      copy: {
        title: "Object structure",
        what: "Same as the Builder: every query starts with an OS.",
        how: "Search Maximo and tap a hit. Schema loads, then you pick columns.",
        example: `Next searches mxapiwo and selects ${EXAMPLE.os} (or the closest work-order OS).`,
      },
      onNext: { action: "wiz-os", busy: "Searching...", wait: '[data-tour="wiz-fields"]' },
    }),
    w({
      id: "os-on",
      target: '[data-tour="wiz-fields"]',
      lock: true,
      copy: {
        title: "OS is set",
        what: `${EXAMPLE.os} (or the closest match) is loaded. This screen is parent columns.`,
        how: "The recipe rail on the left keeps the running log as you go.",
        example: "Next picks the same parent columns as the Builder tour.",
      },
    }),
    w({
      id: "fields",
      target: '[data-tour="wiz-fields"]',
      nextLabel: "Select columns",
      copy: {
        title: "Columns",
        what: "Parent fields become oslc.select - what each row shows.",
        how: "Suggested, browse, or *. Continue when the row looks right.",
        example: `Next picks ${EXAMPLE.fields} when those exist.`,
      },
      onNext: { action: "wiz-fields", busy: "Selecting...", wait: '[data-tour="wiz-picked"]' },
    }),
    w({
      id: "fields-on",
      target: '[data-tour="wiz-picked"]',
      lock: true,
      copy: {
        title: "Those columns are on",
        what: "Checked chips are the parent select.",
        how: "Tap a chip to remove it. Continue moves on to related rows.",
        example: `${EXAMPLE.fields} (or the closest fields). Next adds ${EXAMPLE.child}.`,
      },
    }),
    w({
      id: "children",
      target: '[data-tour="wiz-fields"]',
      nextLabel: `Add ${EXAMPLE.child}`,
      copy: {
        title: "Related rows",
        what: "Child relationships nest related objects in the same GET.",
        how: "Pick a relationship first, then its columns, then optionally hop deeper from that leaf.",
        example: `Next continues to children, adds ${EXAMPLE.child}, and opens its column picker.`,
      },
      onNext: { action: "wiz-children", busy: `Adding ${EXAMPLE.child}...`, wait: '[data-tour="wiz-childFields"]' },
    }),
    w({
      id: "child-fields",
      target: '[data-tour="wiz-childFields"]',
      nextLabel: `Select ${EXAMPLE.child} columns`,
      copy: {
        title: `${EXAMPLE.child} columns`,
        what: `This screen is select on ${EXAMPLE.child} - not the parent.`,
        how: "Same picker as parent columns. Continue, then you can hop deeper.",
        example: `Next picks ${EXAMPLE.childFields} when those exist.`,
      },
      onNext: { action: "wiz-child-fields", busy: "Selecting...", wait: '[data-tour="wiz-picked"]' },
    }),
    w({
      id: "child-fields-on",
      target: '[data-tour="wiz-picked"]',
      lock: true,
      nextLabel: `Hop ${EXAMPLE.hop}`,
      copy: {
        title: `${EXAMPLE.child} columns are on`,
        what: "Those fields load as nested rows under each parent.",
        how: "Continue asks what to do next on this object - hop deeper, or move on.",
        example: `Next hops from ${EXAMPLE.child} to ${EXAMPLE.hop}.`,
      },
      onNext: { action: "wiz-child-hop", busy: "Hopping...", wait: '[data-tour="wiz-hop-leaf"]' },
    }),
    w({
      id: "child-hop-on",
      target: '[data-tour="wiz-hop-leaf"]',
      lock: true,
      copy: {
        title: "The hop is on the path",
        what: `The trail is ${EXAMPLE.child} -> ${EXAMPLE.hop}. You are picking columns on the leaf.`,
        how: "* on the leaf loads every field of that related object.",
        example: `${EXAMPLE.hop} is nested under ${EXAMPLE.child}. Next goes to parent where.`,
      },
    }),
    w({
      id: "where",
      target: '[data-tour="wiz-childFields"]',
      nextLabel: "Add filter",
      copy: {
        title: "Where",
        what: "Parent filters decide which work-order rows return.",
        how: "This tour skips related-exists filters and extra sibling children - those are optional later screens.",
        example: `Next continues to Where, adds ${EXAMPLE.where}, ${EXAMPLE.timeline}, and ${EXAMPLE.domain}.`,
      },
      onNext: { action: "wiz-where", busy: "Filtering...", wait: '[data-tour="wiz-timeline"]' },
    }),
    w({
      id: "timeline",
      target: '[data-tour="wiz-timeline"]',
      lock: true,
      nextLabel: "Continue to sort",
      copy: {
        title: "Timeline",
        what: "Optional date-range on a DATE/DATETIME field (tlrange + tlattribute). Same two keys on child-row filters.",
        how: "Example: last 3 months of changed work orders is - 3 months on changedate. Both fields are required together. Domain-internal where is the card under it - internal coded values, not display labels.",
        example: `${EXAMPLE.timeline} and ${EXAMPLE.domain} are on. Next goes to sort.`,
      },
    }),
    w({
      id: "sort",
      target: '[data-tour="wiz-sort"]',
      nextLabel: "Add sort",
      copy: {
        title: "Sort",
        what: "Orders parent rows. Tap a field: + then - then clear.",
        how: "Sort is parent-only.",
        example: `Next sorts by ${EXAMPLE.sort} when that field is on the OS.`,
      },
      onNext: { action: "wiz-sort", busy: "Sorting...", wait: '[data-tour="wiz-sort"]' },
    }),
    w({
      id: "sort-on",
      target: '[data-tour="wiz-sort"]',
      lock: true,
      nextLabel: `Flatten ${EXAMPLE.child}`,
      copy: {
        title: "Sort is on",
        what: "Parent rows will come back in this order.",
        how: "The next screens are display flatten (optional) then page size.",
        example: `Next flattens ${EXAMPLE.child} onto parent columns - display only.`,
      },
      onNext: { action: "wiz-display", busy: "Updating...", wait: '[data-tour="wiz-displayNext"]' },
    }),
    w({
      id: "display-on",
      target: '[data-tour="wiz-displayNext"]',
      lock: true,
      nextLabel: "Set page size 10",
      copy: {
        title: "Flatten is on",
        what: `Checked ${EXAMPLE.child} fields become parent-table columns after you run the query.`,
        how: "You could add the hop as a second flatten. This tour keeps one.",
        example: `Next sets page size to ${EXAMPLE.pageSize} and opens the review.`,
      },
      onNext: { action: "wiz-page", busy: "Updating...", wait: '[data-tour="wiz-review"]' },
    }),
    w({
      id: "review",
      target: '[data-tour="wiz-review"]',
      align: "center",
      copy: {
        title: "Review",
        what: "The story so far. Open builder to see every knob, or run it live.",
        how: "This tour does not execute against Maximo.",
        example: "That's the same sample as the Builder tour. Done closes the walkthrough.",
      },
    }),
  ],
};

export const TOURS: Record<TourDef["id"], TourDef> = {
  builder: BUILDER_TOUR,
  wizard: WIZARD_TOUR,
};
