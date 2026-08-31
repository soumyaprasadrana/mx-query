/**
 * Assist prompts - the only place the model's instructions live.
 *
 * Sized for a large hosted model (ChatGPT-class via litellm). The model
 * already knows Maximo; we give it the live tenant catalog, the wizard
 * scene (which step, which hop, select vs EXISTS vs child-row filter),
 * and a strict JSON shape. Names not in the catalog are dropped in
 * `assist.ts` after parse.
 *
 * The 1.5B-tuned copy (short, negative, anti-enum-echo) is snapshotted in
 * `docs/pm/assistPrompts.small.ts` - restore that file over this one when we
 * ship a small local model again.
 *
 * messages[0] = SYSTEM[step]
 * messages[1] = scene + intent/need + catalog + USER_TASK
 */

import type { AssistInput, AssistStep } from "./assist";

export const ASSIST_LLM = {
  optionsByStep: {
    intentRewrite: { temperature: 0.3, max_tokens: 400 },
    osKeyword: { temperature: 0, max_tokens: 80 },
    os: { temperature: 0.1, max_tokens: 200 },
    fields: { temperature: 0.1, max_tokens: 400 },
    children: { temperature: 0.1, max_tokens: 200 },
    where: { temperature: 0.1, max_tokens: 500 },
    related: { temperature: 0.1, max_tokens: 200 },
  } satisfies Record<AssistStep, { temperature: number; max_tokens?: number }>,
} as const;

export function assistChatOptions(step: AssistStep): { temperature: number; max_tokens?: number } {
  return ASSIST_LLM.optionsByStep[step];
}

const JSON_ONLY = `Reply with JSON only - no markdown, no commentary. Use only names that appear in the candidate list in the user message. Unknown names are discarded.`;

const RESPECT_EXPLICIT_ASK = `If the user's note or intent explicitly names items, asks for "all"/"every", or gives a specific count, follow that literally - the guidance above is only a default for when they didn't say.`;

const REL_PICK = `How to pick a relationship from the candidate list:
- Each line is RELATION -> OBJECT. Match the user's nouns to OBJECT first (ASSET, LOCATION, WORKORDER, METER, PERSON), then take the RELATION that targets it.
- "OS child" is already on this object structure - prefer it for nested select.
- "MAXRELATIONSHIP hop" is a join from compact metadata - use it to go deeper (ASSET_PARENT, OPENWO, ACTIVEASSETMETER) or for EXISTS filters.
- The join clause tells you the bind (e.g. assetnum / location / wonum). Use it to tell ASSET vs LOCATION vs WO apart when names look similar.
- Skip DOCLINKS, IMGLIB, WF*, LONGDESCRIPTION, AUDIT, COMMLOG unless the user asked for docs, images, workflow, or comments.
- Work order tasks/activities: WOACTIVITY, not another WORKORDER.
- Parent of an asset: ASSET_PARENT. Open work orders on an asset: OPENWO.
- Location of a WO: LOCATION or WO_LOCATION if listed.
- Meters: ACTIVEASSETMETER or ASSETMETER from ASSET, not from WO unless that is the only path.
- Already-picked relations in the scene: do not repeat them.`;

export const SYSTEM: Record<AssistStep, string> = {
  intentRewrite: `You rewrite a Maximo user's query intent into one clear sentence.
Use Maximo vocabulary they already implied (SR, WO, SITEID, STATUS, ASSETNUM, ticketid, wonum) but do not invent filters, sites, or objects they did not mention. Keep the parent record as the subject.
${JSON_ONLY}
Shape: {"intent": "string"}`,

  osKeyword: `Extract the parent record type the user wants to list - the noun for Maximo object-structure search.
Ignore related objects after with/from/for, site names, and status values.
"service requests with assets from BEDFORD" -> "service request".
"PM work orders with parent asset and activities" -> "work order".
${JSON_ONLY}
Shape: {"keyword": "string"}`,

  os: `Pick the object structure(s) that best match listing the parent record.
Read each candidate's primary MBO and description.
Prefer the operational API OS: MXAPIWO for work orders, MXAPISR for service requests, MXAPIASSET for assets.
Avoid GUEST, WATCHLIST, POLICY, CHANGE, and *DETAIL unless the user asked for that OS.
Return 1-3 names, best first.
${JSON_ONLY}
Shape: {"osNames": ["OSNAME"]}`,

  fields: `Pick columns for THIS object in the wizard scene (parent row, or a related object on a hop).
Identity + status + description first: wonum/ticketid/assetnum, status, description, siteid, orgid, plus fields the intent names (worktype, location, failurecode, reportdate).
On a hop, pick THAT object's attributes - never parent WO fields on an ASSET hop.
Skip YORN flags, internal ids (workorderid unless they asked), and plusp* unless the intent needs them.
Default 4-8 when the user gave no specific note. Not every attribute by default.
${RESPECT_EXPLICIT_ASK}
${JSON_ONLY}
Shape: {"fields": ["attrname"]}`,

  children: `Pick relationship names whose rows should appear IN THE RESULT (nested select / child collections).
This is NOT an EXISTS filter - that is a later wizard step. [] is correct when they only want parent rows.
If the scene says you are hopping DEEPER, pick at most one next relation from the current object.
If you are choosing top-level children, pick the collections they asked to see (asset, location, activities, meters) - typically 1-3.
${REL_PICK}
${RESPECT_EXPLICIT_ASK}
${JSON_ONLY}
Shape: {"relations": ["RELNAME"]}`,

  where: `Write filter conditions on THIS object's attributes (see the wizard scene for which object and whether this filters parents or nested child rows).
Ops: "=" for codes/ids/status/site/worktype, "like" for description/free text, "in" for a list, "isnull"/"isnotnull" only when they asked for empty/missing.
Status words (APPR, WAPPR, INPRG, CLOSE, QUEUED) and work types (PM, CM) use op "=" with the CODE, not a display label.
"Open" / "approved" map to a STATUS code with "=" , never isnotnull.
YORN flags: istask=0 and historyflag=0 when they asked for real work orders, not tasks or history.
Default at most 4 conditions when the user gave no specific note.
${RESPECT_EXPLICIT_ASK}
${JSON_ONLY}
Shape: {"where": [{"field":"attr","op":"=","value":"X"}]}`,

  related: `Pick relationship names used only to FILTER which parent rows return (OSLC EXISTS / dotted where). Those related rows are NOT loaded into the result.
Use this when they want "WOs whose asset is in site X" or "SRs that have a related asset matching ...".
Do not pick a relation they already included as a nested child unless they also need a parent-row EXISTS on it.
[] is correct when the intent does not need parent filtering through a related object.
${REL_PICK}
${RESPECT_EXPLICIT_ASK}
${JSON_ONLY}
Shape: {"relations": ["RELNAME"]}`,
};

const USER_TASK: Record<AssistStep, string> = {
  intentRewrite: `Rewrite this intent into one Maximo-flavored sentence. JSON {"intent": "..."}.`,

  osKeyword: `Return the parent record type to search for. JSON {"keyword": "..."}.`,

  os: `Candidate object structures:
{catalog}

Return 1-3 exact osNames, best first. JSON {"osNames": [...]}.`,

  fields: `Candidate attributes on this object:
{catalog}

Return exact field names for THIS object only. JSON {"fields": [...]}.`,

  children: `Candidate relationships (RELATION -> OBJECT):
{catalog}

Return exact relation names to include as nested rows (or [] ). JSON {"relations": [...]}.`,

  where: `Candidate attributes for conditions:
{catalog}

Return conditions on THIS object only. JSON {"where": [{"field","op","value"}]}.`,

  related: `Candidate relationships (RELATION -> OBJECT):
{catalog}

Return exact relation names used only to filter parents (or [] ). JSON {"relations": [...]}.`,
};

export function assistSystemPrompt(step: AssistStep): string {
  return SYSTEM[step];
}

export function assistUserPrompt(
  input: AssistInput,
  rankedChildren?: NonNullable<AssistInput["children"]>,
): string | null {
  const intent = input.intent.trim() || "(none)";
  const need = input.need?.trim();
  const head = [
    input.scene?.trim() ? `Wizard scene:\n${input.scene.trim()}` : null,
    `Overall intent: "${intent}"`,
    need ? `This step, the user said: "${need}"` : "This step: no extra note (use overall intent).",
  ].filter(Boolean).join("\n");

  if (input.step === "intentRewrite") {
    return `${head}\n${USER_TASK.intentRewrite}`;
  }

  const catalog = catalogFor(input, rankedChildren);
  if (input.step !== "osKeyword" && !catalog) return null;

  let task = USER_TASK[input.step];
  if (task.includes("{catalog}")) {
    if (!catalog) return null;
    task = task.replace("{catalog}", catalog);
  }
  const scene = input.scene ?? "";
  if (input.step === "children" && /hopping DEEPER/i.test(scene)) {
    task += `\nPick at most one next hop from the current object.`;
  }
  if (input.step === "related" && /Current path:/i.test(scene)) {
    task += `\nPick the next hop on this EXISTS path, or [] if the path is done.`;
  }
  return `${head}\n${task}`;
}

function catalogFor(input: AssistInput, rankedChildren?: NonNullable<AssistInput["children"]>): string {
  if (input.step === "os") {
    return (input.osHits ?? []).map((h) => {
      const bits = [
        h.osName,
        h.primaryObject ? `MBO ${h.primaryObject}` : null,
        h.description || null,
        typeof h.savedQueries === "number" ? `${h.savedQueries} saved queries` : null,
      ].filter(Boolean);
      return `- ${bits.join(" - ")}`;
    }).join("\n");
  }
  if (input.step === "fields" || input.step === "where") {
    return (input.fields ?? []).map((f) => {
      const bits = [f.name, f.title || f.name, f.type || "", f.domainId ? `domain ${f.domainId}` : ""].filter(Boolean);
      return `- ${bits.join(" - ")}`;
    }).join("\n");
  }
  if (input.step === "children" || input.step === "related") {
    return (rankedChildren ?? input.children ?? []).map((c) => {
      const via = c.inheritedFrom
        ? `OS child, inherited from ${c.inheritedFrom}`
        : c.inOs
          ? "OS child"
          : "MAXRELATIONSHIP hop";
      const join = c.whereClause ? `; join ${c.whereClause}` : "";
      return `- ${c.relation} -> ${c.objectName} (${via}${join})`;
    }).join("\n");
  }
  return "";
}
