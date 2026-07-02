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

Workspace **Kiwidev** → `2b2sj518avbj`. This workspace hosts multiple boards — always confirm the board name, not just the workspace, before pushing cards. (An earlier version of this doc pointed at the wrong board, **ETS2 Convoy Sync** `bgvwkbnsy152` — a different, unrelated project. That was a documentation bug, not a real target.)

Board **TV Time 2** → `2v4jlcbhpupd`

**Lists (columns):** Backlog `r1ptwlksblil` · To Do `6ma5v0zvls9y` · In Progress `bwblwuxiugfx` · Code Review `4v2haptf3mw6` · Done `nzkjau549quv`

**Labels:**

| Label | publicId | | Label | publicId |
|-------|----------|-|-------|----------|
| Bug | `r73vpfqa3bml` | | Epic 1 | `vsfp2d1s6380` |
| Feature | `ckj2il4v8qk9` | | Epic 2 | `dhvvhdtlputd` |
| Enhancement | `b2ya8d2vqwie` | | Epic 3 | `88esb3v5sgmt` |
| Critical | `oqmm6v9a2k2t` | | Epic 4 | `mgreb479pxu6` |
| Documentation | `x73z2b684po0` | | Epic 5 | `j6wd5fnbo2he` |
| | | | Epic 6 | `evd3jsen0cg5` |
| | | | Epic 7 | `u66ygzsmiy7g` |

**Ticket scheme:** one card per story from `_bmad-output/planning-artifacts/epics.md` (33 total), titled `{epic}.{story} — {title}` (e.g. `1.1 — Project foundation boots locally`), tagged with its `Epic N` label. All 33 live in **Backlog**. No Sprint/MVP/v1/v2 labels are used on this board — that scheme belonged to the ETS2 board and doesn't apply here.

### Recipe — create a card

Bash + `curl` + `jq` (this project's dev environment is Linux):

```bash
jq -n --arg title "1.7 — Example story" \
      --arg desc "markdown body, max 10000 chars" \
      --arg list "r1ptwlksblil" \
      --arg label "vsfp2d1s6380" \
      '{title:$title, description:$desc, listPublicId:$list, labelPublicIds:[$label], memberPublicIds:[], position:"end"}' \
  | curl -s -X POST "https://kanban.kiwidev.fr/api/v1/cards" \
      -H "Authorization: Bearer $KAN_KEY" -H "Content-Type: application/json" \
      -d @-
```

For anything with real markdown/quotes/backticks in the description, prefer a small Python script using `json.dumps` (via `urllib.request`) over hand-built JSON — safer escaping than shell quoting.

PowerShell (if working from a Windows box instead):

```powershell
$headers = @{ Authorization = "Bearer $env:KAN_KEY"; "Content-Type" = "application/json" }
$body = @{
  title           = "1.7 — Example story"
  description     = "..."
  listPublicId    = "r1ptwlksblil"        # Backlog
  labelPublicIds  = @("vsfp2d1s6380")     # Epic 1
  memberPublicIds = @()
  position        = "end"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "https://kanban.kiwidev.fr/api/v1/cards" -Method Post -Headers $headers -Body $body
```

> Inside a PowerShell here-string (`@"..."@`), double the `"` quotes.