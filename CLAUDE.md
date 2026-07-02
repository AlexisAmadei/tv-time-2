## Kan.bn API reference

The kanban runs [Kan.bn](https://kan.bn). Used to push the sprint plan into the board.

- **Docs:** https://docs.kan.bn/api-reference/introduction
  (full endpoint index: https://docs.kan.bn/llms.txt)
- **Base URL (this instance):** `https://kanban.kiwidev.fr/api/v1`
  - Hosted docs use `https://kan.bn/api/v1`; swap the host for our instance.
- **Auth:** Bearer token in the `Authorization` header — `Authorization: Bearer kan_xxxx...`
  > The API key is a secret. Pass it via an env var (e.g. `$env:KAN_KEY`); never commit it.
- **Content type:** `application/json` for writes.
- **Status codes:** 200 OK · 400 invalid params · 401 missing token · 403 invalid token · 404 not found · 500 server error.

### Endpoints used

| Action | Method | Path |
|--------|--------|------|
| List workspaces | GET | `/workspaces` |
| List boards in a workspace | GET | `/workspaces/{workspacePublicId}/boards` |
| Create a label | POST | `/labels` |
| Create a card | POST | `/cards` |

Other available groups (unused so far): lists (`/lists`), card checklists/comments/members, board create/update, label update/delete. See `llms.txt`.

#### GET `/workspaces`
Returns `[{ role, workspace: { publicId, name, description, slug, plan, weekStartDay, cardPrefix, deletedAt } }]`.

#### GET `/workspaces/{workspacePublicId}/boards`
Optional query: `type` (`regular`|`template`), `archived` (bool).
Returns `[{ publicId, name, favorite, lists: [{ publicId, name, index }], labels: [{ publicId, name, colourCode }] }]`.

#### POST `/labels`
```json
{ "name": "Sprint 0", "boardPublicId": "<board>", "colourCode": "#64748b" }
```
- `name`: 1–36 chars · `colourCode`: **exactly 7 chars** (`#rrggbb`).
- Returns `{ publicId, name, colourCode }`.

#### POST `/cards`
```json
{
  "title": "F1 — Create a modpack",
  "description": "markdown body, max 10000 chars",
  "listPublicId": "<list>",
  "labelPublicIds": ["<label>"],
  "memberPublicIds": [],
  "position": "end"
}
```
- `title`: 1–2000 · `description`: ≤10000 · `position`: `"start"`|`"end"` · `dueDate` optional/nullable.
- Returns `{ publicId }`.

### Resolved IDs

Workspace **Kiwidev** → `2b2sj518avbj` · Board **ETS2 Convoy Sync** → `bgvwkbnsy152`

**Lists (columns):** Backlog `xdjg3jamh9a9` · Selected `vw52y8wi49kz` · In progress `t8eza57ogf15` · Review `z9atozxy262b` · Done `22vv76o37esv`

**Labels:**

| Label | publicId | | Label | publicId |
|-------|----------|-|-------|----------|
| Sprint 0 | `8vq6qnx139ns` | | Sprint 6 | `su0uw9s7rjee` |
| Sprint 1 | `atln6n3i5d06` | | Sprint 7 | `zp7j0bt0qycx` |
| Sprint 2 | `3em61zsehjmb` | | Sprint 8 | `1y2m7coyol4d` |
| Sprint 3 | `qdg42ixhtnlm` | | MVP | `mwis8wt7p84x` |
| Sprint 4 | `lu51311jfa5v` | | v1 | `5m0kqt01yau3` |
| Sprint 5 | `2akrl946592m` | | v2 | `4galyqgfm8sx` |

**Milestone mapping:** Sprints 0–3 → MVP · 4–6 → v1 · 7–8 → v2.
All 29 sprint tickets live in **Backlog**, each tagged with its sprint + milestone label.

### Recipe — create a card (PowerShell)

```powershell
$headers = @{ Authorization = "Bearer $env:KAN_KEY"; "Content-Type" = "application/json" }
$body = @{
  title           = "F1 — Create a modpack"
  description     = "..."
  listPublicId    = "xdjg3jamh9a9"                    # Backlog
  labelPublicIds  = @("atln6n3i5d06", "mwis8wt7p84x") # Sprint 1 + MVP
  memberPublicIds = @()
  position        = "end"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "https://kanban.kiwidev.fr/api/v1/cards" -Method Post -Headers $headers -Body $body
```

> On this Windows box there is no `jq`/`python`/usable `curl` JSON tooling —
> use PowerShell `Invoke-RestMethod` + `ConvertTo-Json` for safe escaping.
> Inside a here-string (`@"..."@`), double the `"` quotes.