# What mxQuery is

<img src="/logo-light.svg" alt="mxQuery" class="brand-wordmark brand-wordmark-light" />
<img src="/logo-dark.svg" alt="mxQuery" class="brand-wordmark brand-wordmark-dark" />

mxQuery is a browser app for building and running **OSLC queries** against IBM Maximo. You connect a tenant (one Maximo URL + API key), wait for metadata sync, then use Wizard or Builder.

It does **not** reimplement OSLC in JavaScript. The UI calls tools on [`maximo-mcp-server`](https://github.com/soumyaprasadrana/maximo-mcp-server) through a small Python proxy. Field lists, WHERE, and child filters are whatever that server accepts.

```
Browser  →  mxQuery backend (tenant + tool proxy)  →  maximo-mcp-server  →  Maximo
```

## Who it is for

Analysts and admins who already think in object structures (`MXAPIWO`, `MXAPISR`, …) and would rather pick fields and hops than assemble `oslc.select` / `oslc.where` by hand.

## What it is not

- Not a Maximo application replacement (no work-order lifecycle UI).
- Not a BI or dashboard product. Results, tiles, and charts are for the current page of records.
- Not a write/form designer yet (create/update is a later phase; tenants default to read-only).

License: Apache-2.0. See the repository `LICENSE` and `NOTICE`.
