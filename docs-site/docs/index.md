---
layout: home

hero:
  name: mxQuery
  text: Query Maximo without writing OSLC by hand
  tagline: Point it at an instance, pick an object structure, add fields and filters, run the query. The browser talks to maximo-mcp-server. It does not rebuild Maximo's query language.
  image:
    src: /logo.svg
    alt: mxQuery
  actions:
    - theme: brand
      text: Install
      link: /getting-started
    - theme: alt
      text: Using the app
      link: /guide/screens

features:
  - title: Wizard
    details: One question at a time from intent to a runnable query. Open the same draft in the builder when you need the full console.
  - title: Builder
    details: Object-structure search, parent and child columns, WHERE, nested child-row filters, Excel export of results, and import of pasted tool-call JSON or an OSLC GET.
  - title: Saved queries
    details: Folders, tags, Stash, and open in builder, results, or a report view. Stored per tenant on the server.
  - title: Assist (optional)
    details: Suggests names from the live tenant catalog only. Off until an admin configures an LLM provider. Never invents fields or OSLC.
---
