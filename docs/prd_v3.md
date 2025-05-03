Below is a **fully-revised, self-contained PRD (v 1.2)** that rolls in every fix we just discovered:

* **Basic-Auth done once** via the OpenAPI security scheme (no hand-rolled header code).  
* **Correct request wrappers** (`filter`, `contentSelector`) for **both** POST endpoints.  
* **All five original endpoints** plus the new **Briefs API** (`/v2/askanything/generate-brief`).  
* A **single source-of-truth OpenAPI spec** you can paste into `spec/gong.yaml`.  
* A miniature **smoke-test harness** to run *before* regenerating the MCP.  

Copy this document into `docs/gong-mcp.md` and throw away older drafts.

---

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
  6. `GET  /v2/askanything/generate-brief`  ⬅ new  

---

## 1 Problem & Goals  

Same as v 1.1, plus: “Generate a brief for a deal or account” via the new endpoint.

---

## 2 Architecture (unchanged)  

```
Cursor LLM ⇄ Gong-MCP (stdio) ⇄ https://api.gong.io
```

---

## 3 Authentication (unchanged)  

`.env`  
```env
GONG_ACCESS_KEY=...
GONG_SECRET=...
```

---

## 4 OpenAPI spec  `spec/gong.yaml`

Paste **verbatim**.

```yaml
openapi: 3.1.0
info: { title: Gong API (subset), version: 1.2.0 }
servers: [ { url: https://api.gong.io } ]
security: [ { basicAuth: [] } ]

components:
  securitySchemes:
    basicAuth: { type: http, scheme: basic }

  # ---------- shared request pieces ----------
  schemas:
    CallsFilter:
      type: object
      properties:
        fromDateTime:     { type: string, format: date-time }
        toDateTime:       { type: string, format: date-time }
        callIds:          { type: array, items: { type: string } }
        primaryUserIds:   { type: array, items: { type: string } }
        participantsEmails:
          type: array
          items: { type: string, format: email }

    ContentSelector:
      type: object
      properties:
        context:         { type: string, enum: [None, Extended] }
        contextTiming:   { type: array, items: { type: string, enum: [Now, TimeOfCall] } }
        exposedFields:   { type: object, additionalProperties: { type: object } }

    CallsExtensiveRequest:
      type: object
      required: [ filter ]
      properties:
        filter:          { $ref: '#/components/schemas/CallsFilter' }
        contentSelector: { $ref: '#/components/schemas/ContentSelector' }
        cursor:          { type: string }

    TranscriptRequest:
      type: object
      required: [ filter ]
      properties:
        filter: { $ref: '#/components/schemas/CallsFilter' }
        cursor: { type: string }

    # ---------- brief endpoint ----------
    BriefRequestParams:
      type: object
      required:
        - workspace-id
        - brief-name
        - entity-type
        - crm-entity-id
        - period-type
      properties:
        workspace-id:   { type: string }
        brief-name:     { type: string }
        entity-type:    { type: string, enum: [Deal, Account] }
        crm-entity-id:  { type: string }
        period-type:
          type: string
          enum: [LAST_7DAYS, LAST_30DAYS, LAST_90DAYS, LAST_90_DAYS_SINCE_LAST_ACTIVITY,
                 LAST_YEAR_SINCE_LAST_ACTIVITY, LAST_YEAR, THIS_WEEK, THIS_MONTH,
                 THIS_YEAR, THIS_QUARTER, CUSTOM_RANGE]
        from-date-time: { type: string, format: date-time }
        to-date-time:   { type: string, format: date-time }

    # ---------- trimmed responses ----------
    SpecificCall:          { type: object, additionalProperties: true }
    Calls:                 { type: object, additionalProperties: true }
    CallTranscripts:       { type: object, additionalProperties: true }
    Users:                 { type: object, additionalProperties: true }
    EmailAddressReferences:{ type: object, additionalProperties: true }
    BriefResponse:         { type: object, additionalProperties: true }

paths:
  /v2/calls/{id}:
    get:
      summary: Retrieve a single call
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/SpecificCall' } } } }

  /v2/calls/extensive:
    post:
      summary: Filtered call list
      requestBody:
        required: true
        content:
          application/json: { schema: { $ref: '#/components/schemas/CallsExtensiveRequest' } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Calls' } } } }

  /v2/calls/transcript:
    post:
      summary: Download transcripts
      requestBody:
        required: true
        content:
          application/json: { schema: { $ref: '#/components/schemas/TranscriptRequest' } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/CallTranscripts' } } } }

  /v2/users:
    get:
      summary: List Gong users
      parameters: [ { name: cursor, in: query, schema: { type: string } } ]
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Users' } } } }

  /v2/data-privacy/data-for-email-address:
    get:
      summary: Activities for an email
      parameters:
        - { name: emailAddress, in: query, required: true, schema: { type: string, format: email } }
        - { name: cursor,      in: query, schema: { type: string } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/EmailAddressReferences' } } } }

  /v2/askanything/generate-brief:
    get:
      summary: Generate account/deal brief
      parameters:
        - { name: workspace-id,   in: query, required: true, schema: { type: string } }
        - { name: brief-name,     in: query, required: true, schema: { type: string } }
        - { name: entity-type,    in: query, required: true, schema: { type: string, enum: [Deal, Account] } }
        - { name: crm-entity-id,  in: query, required: true, schema: { type: string } }
        - { name: period-type,    in: query, required: true, schema: { type: string } }
        - { name: from-date-time, in: query, schema: { type: string, format: date-time } }
        - { name: to-date-time,   in: query, schema: { type: string, format: date-time } }
      responses:
        '200': { content: { application/json: { schema: { $ref: '#/components/schemas/BriefResponse' } } } }
```

---

## 5 Implementation Steps (delta)  

*Delete* the custom header logic. Replace with:

```ts
const client = axios.create({
  baseURL: 'https://api.gong.io',
  auth: {
    username: process.env.GONG_ACCESS_KEY!,
    password: process.env.GONG_SECRET!
  }
});
```

Generator will mirror that for every call.

---

## 6 Pre-MCP Smoke Tests (`tests/gongSmoke.test.ts`)

```ts
import axios from 'axios';
import dotenv from 'dotenv'; dotenv.config();

const api = axios.create({
  baseURL: 'https://api.gong.io',
  auth: { username: process.env.GONG_ACCESS_KEY!, password: process.env.GONG_SECRET! }
});

test('auth works', async () => {
  const { status } = await api.get('/v2/users?limit=1');
  expect(status).toBe(200);
});

test('extensive wrapper', async () => {
  const { status } = await api.post('/v2/calls/extensive', {
    filter: { fromDateTime: '2025-04-30T00:00:00Z', toDateTime: '2025-04-30T23:59:59Z' }
  });
  expect(status).toBe(200);
});

test('brief endpoint', async () => {
  const { status } = await api.get('/v2/askanything/generate-brief', {
    params: {
      'workspace-id': '123',
      'brief-name': 'Churn risk signals',
      'entity-type': 'Deal',
      'crm-entity-id': '006Pc0000093OGjIAA',
      'period-type': 'LAST_90DAYS'
    }
  });
  // Gong returns 202 if async; accept either
  expect([200, 202]).toContain(status);
});
```

Run `npm t` before every MCP build.

---

## 7 Testing Matrix (add brief)  

| Scenario | Expected |
|----------|----------|
| brief request | 200/202 and JSON with `summaryBullets` array |

---

## 8 Risks & Mitigations (unchanged + brief rate-limit)  

* Gong brief endpoint is compute-heavy → 429 if > 5 req/min → add retry logic later.

---

**Done.**  This PRD now contains:

* Correct wrapper schemas  
* Built-in Basic-Auth  
* All six endpoints (calls, transcripts, users, GDPR, brief)  
* Smoke-test harness to catch 401/400 *before* MCP generation.

Regenerate (`openapi-mcp-generator@3 …`), rebuild, run the tests—then reload your MCP in Cursor.