# Wizard

Use Wizard when you can describe the query in a sentence and want to be walked through object structure, columns, children, and filters.

## Flow

1. **Intent** — what you want (for example PM work orders waiting for approval, with asset).
2. **Saved query?** — reuse a Maximo saved query if you have one, or continue from schema.
3. **Object structure** — search (for example `mxapiwo`, `wo`). Assist, if on, searches for the **parent** record type, not a related noun after "with".
4. **Parent columns** — `*` all attributes, **Suggested** (identity/status fields plus words from intent), Browse, Clear. Selected fields stay visible while you search.
5. **Children** — pick relationships on this OS, then columns on that object. You can hop deeper (same idea as builder child options). Breadcrumb shows `Children / ASSET / SITE`. × trims the trail.
6. **Where** — conditions on the parent. Operators include `= != < > <= >= in like isnull isnotnull`.
7. **Related object** — EXISTS-style filters on another object. Same hop/back pattern.
8. **Child row filters** — WHERE on a child path (not only parent WHERE).
9. **Sort and page size** — then review.

The recipe rail on the side is a log of picks, not a second query language.

**Open builder** or **Run it** loads the same draft the builder hydrates. Nothing is executed until you run it in the builder (or choose run from review).

## Assist

Optional. See [Assist](/guide/assist). With Assist off, OS search and Suggested columns still work (keyword / CORE fields).
