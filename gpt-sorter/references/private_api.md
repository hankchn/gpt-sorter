# ChatGPT Project Private API Notes

These endpoints were observed from the ChatGPT web app and may change without notice.

## Base

Use the logged-in ChatGPT page context:

```text
https://chatgpt.com/backend-api
```

The request requires an `Authorization: Bearer <accessToken>` header. Do not read or persist browser cookies or storage. Fetch `/api/auth/session` inside the page context and use the access token only in memory for immediate requests.

## Endpoints

List owned projects:

```text
GET /backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0&limit=50
```

The endpoint accepts `limit=50`. The script attempts cursor or offset pagination when the response exposes it or when an `offset` query keeps returning new project IDs. If the endpoint ignores pagination or rejects a later page, the report marks `projectPagination.truncated: true`; treat `projectCount` as possibly truncated and re-check before executing broad plans.

List conversations:

```text
GET /backend-api/conversations?offset=0&limit=100&order=updated&is_archived=false&is_starred=false
```

The list endpoint is offset-paginated. Continue until the returned item count is smaller than the requested limit.

Before execute or rollback, the script scans all conversation-list metadata without archived/starred filters so every saved plan item can be checked even if its list position or flags changed. It still does not request conversation bodies.

Move a conversation into a project:

```text
PATCH /backend-api/conversation/{conversation_id}
Content-Type: application/json

{"gizmo_id":"g-p-..."}
```

Project IDs are the `gizmo.id` values from the project sidebar response. Existing project conversation records usually already include `gizmo_id`; skip those by default.

## Write Preconditions

- Execute reads exact conversation and target IDs from a fingerprinted preview report; it does not regenerate classification rules.
- Before a batch write, verify the current title hash, current `gizmo_id`, target Project ID, and target Project name.
- Abort the whole execute batch when any saved item changed after preview.
- For rollback, apply only items whose current `gizmo_id` still equals the execute target. Skip later user changes.
- Keep the execute report because its fingerprinted rollback manifest is required for safe restoration.

## Known Failure Modes

- `401 Unauthorized - Access token is missing`: the page is not logged in or the token was not fetched inside page context.
- `422` on project sidebar: the `limit` query must be no larger than `50`.
- CDP page list is empty: Chrome may have closed the debug page; reopen a ChatGPT page through the endpoint or ask the user to log in again.
- `--page-id` should resolve targets through `/json/list` first and use the returned `webSocketDebuggerUrl`. Only fall back to constructing a page WebSocket URL from the user-provided `--cdp` host when the target is not listed.
- ChatGPT may rate limit rapid conversation reads/writes. Use a delay between `PATCH` requests.
- If a private API fails during preview or execute, stop and run a fresh preview. Do not blindly retry write operations.
- Chrome stores login state in its `--user-data-dir` even though the script never reads or exports that data. Prefer a disposable profile and remove it only after Chrome closes.
