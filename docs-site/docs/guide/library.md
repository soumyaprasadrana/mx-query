# Saved queries

Library is `/library`. Queries are per tenant, on the server, not only files on disk.

## Folders

- **Stash** - unfiled queries (`folderId` null).
- Named folders, nested. Empty folder deletes the queries in it, not the folder itself, unless you delete the folder (queries are unfiled, not destroyed - see the confirm copy in the UI).

Search, tag, and object-structure filters apply to the list.

## Open

Each row: **Builder**, **Results**, **Report**, duplicate, edit metadata, delete.

Clear Stash, empty a folder, or clear all saved queries are bulk deletes. They cannot be undone.

Export from the builder **Save / query JSON** is the same shape the library stores, so import and save stay aligned. Results **Excel** (`.xlsx`) is a separate download from the results table; it is not stored on the saved query.
