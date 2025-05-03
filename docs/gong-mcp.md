# Gong MCP - Implementation Documentation

This document consolidates all information about the Gong MCP implementation.

## ✨ Summary  

* Scaffold with **`openapi-mcp-generator@3.x`** → TypeScript MCP server.  
* Auth = **HTTP Basic** (`Access Key : Secret`) pulled from `.env`.  
* Transport = **stdio** (Cursor default).  
* Local Node path = `/opt/homebrew/bin/node` (stable on ARM Macs).  
* Six endpoints:  
  1. `GET  /v2/calls/{id}`  
  2. `POST /v2/calls/extensive`  
  3. `POST /v2/calls/transcript`  
  4. `GET  /v2/users`  
  5. `GET  /v2/data-privacy/data-for-email-address`  
  6. `GET  /v2/askanything/generate-brief`  

## Authentication

Authentication is handled through Basic Auth (Access Key : Secret). Credentials are stored in global Cursor MCP configuration.

```ts
// Basic auth implementation
const client = axios.create({
  baseURL: 'https://api.gong.io',
  auth: {
    username: process.env.GONG_ACCESS_KEY!,
    password: process.env.GONG_SECRET!
  }
});
```

## Endpoints

### 1. Get Call by ID

```
GET /v2/calls/{id}
```

### 2. Extensive Call List

```
POST /v2/calls/extensive
{
  "filter": { 
    "fromDateTime": "2025-04-30T00:00:00Z",
    "toDateTime": "2025-04-30T23:59:59Z"
  }
}
```

### 3. Call Transcript

```
POST /v2/calls/transcript
{
  "filter": { ... }
}
```

### 4. List Users

```
GET /v2/users
```

### 5. GDPR Data Lookup

```
GET /v2/data-privacy/data-for-email-address?emailAddress=example@domain.com
```

### 6. Generate Brief

```
GET /v2/askanything/generate-brief?workspace-id=123&brief-name=Name&entity-type=Deal&crm-entity-id=xyz&period-type=LAST_90DAYS
```

## Running Smoke Tests

```bash
npx jest tests/gongSmoke.test.ts
```

## Known Issues

* Brief endpoint may return 401 if your account doesn't have access to it
* Rate limits apply to the brief endpoint (max 5 req/min)

## Configuration

Using global MCP configuration at `~/.cursor/mcp.json` with the following structure:

```json
"gong-mcp": {
  "type": "stdio",
  "command": "/opt/homebrew/bin/node",
  "args": ["/Users/maxpaulus/Documents/GitHub/gong-mcp/build/index.js"],
  "cwd": "/Users/maxpaulus/Documents/GitHub/gong-mcp",
  "environment": {
    "GONG_ACCESS_KEY": "***",
    "GONG_SECRET": "***"
  }
}
``` 