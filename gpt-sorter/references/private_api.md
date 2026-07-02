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

List conversations:

```text
GET /backend-api/conversations?offset=0&limit=100&order=updated&is_archived=false&is_starred=false
```

The list endpoint is offset-paginated. Continue until the returned item count is smaller than the requested limit.

Move a conversation into a project:

```text
PATCH /backend-api/conversation/{conversation_id}
Content-Type: application/json

{"gizmo_id":"g-p-..."}
```

Project IDs are the `gizmo.id` values from the project sidebar response. Existing project conversation records usually already include `gizmo_id`; skip those by default.

## Known Failure Modes

- `401 Unauthorized - Access token is missing`: the page is not logged in or the token was not fetched inside page context.
- `422` on project sidebar: the `limit` query must be no larger than `50`.
- CDP page list is empty: Chrome may have closed the debug page; reopen a ChatGPT page through the endpoint or ask the user to log in again.
- ChatGPT may rate limit rapid conversation reads/writes. Use a delay between `PATCH` requests.
