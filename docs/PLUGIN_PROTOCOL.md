# Plugin Adapter Protocol

The Go engine communicates with TypeScript plugin implementations over a JSON-RPC 2.0 protocol on stdin/stdout. Each plugin adapter is a long-running Node.js process.

## Transport

- **Format:** newline-delimited JSON (one JSON object per line)
- **Direction:** Go engine writes requests to the adapter's stdin; adapter writes responses to stdout
- **Multiplexing:** Requests carry a numeric `id`; responses are matched by the same `id`. Multiple in-flight requests are allowed.

## Request Format

```json
{"jsonrpc":"2.0","id":1,"method":"isProcessRunning","params":{"sessionId":"abc","runtimeHandle":{}}}
```

| Field     | Type           | Description                        |
|-----------|----------------|------------------------------------|
| `jsonrpc` | `"2.0"`        | Protocol version (always `"2.0"`)  |
| `id`      | integer        | Monotonically increasing request ID |
| `method`  | string         | Method name to invoke               |
| `params`  | object         | Method-specific parameters          |

## Response Format

### Success

```json
{"jsonrpc":"2.0","id":1,"result":true}
```

### Error

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"process not found"}}
```

| Field           | Type    | Description                          |
|-----------------|---------|--------------------------------------|
| `jsonrpc`       | `"2.0"` | Protocol version                     |
| `id`            | integer | Matches the request `id`             |
| `result`        | any     | Return value (present on success)    |
| `error`         | object  | Error details (present on failure)   |
| `error.code`    | integer | Application error code (e.g. -32000) |
| `error.message` | string  | Human-readable error message         |

## Agent Plugin Methods

Each agent plugin adapter must implement the following methods.

### `isProcessRunning`

Check whether a session's agent process is still alive.

**Params:**
```json
{"sessionId": "string", "runtimeHandle": {}}
```

**Result:** `boolean`

---

### `getActivityState`

Return the current activity detection for a session.

**Params:**
```json
{
  "sessionId": "string",
  "workspacePath": "string",
  "runtimeHandle": {},
  "readyThresholdMs": 300000
}
```

**Result:** `ActivityDetection | null`

```json
{"state": "active", "timestamp": 1700000000000}
```

Possible states: `active`, `ready`, `idle`, `waiting_input`, `blocked`, `exited`.

---

### `detectActivity`

Classify a string of terminal output into an activity state.

**Params:**
```json
{"terminalOutput": "string"}
```

**Result:** `ActivityState` — one of `"active"`, `"idle"`, `"waiting_input"`, `"blocked"`

## Runtime Plugin Methods

Each runtime plugin adapter must implement the following methods.

### `send`

Send a message (keystrokes/text) to a session's runtime.

**Params:**
```json
{"sessionId": "string", "runtimeHandle": {}, "message": "string"}
```

**Result:** `null`

---

### `kill`

Terminate a session's runtime process.

**Params:**
```json
{"sessionId": "string", "runtimeHandle": {}}
```

**Result:** `null`

## Error Codes

| Code   | Meaning                       |
|--------|-------------------------------|
| -32700 | Parse error (malformed JSON)  |
| -32600 | Invalid request               |
| -32601 | Method not found              |
| -32000 | Application error             |
