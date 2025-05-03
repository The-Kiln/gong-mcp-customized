## 0 Executive summary

We will expose a subset of the Gong v2 API (calls, transcripts, privacy lookup, users) as a **Model-Context-Protocol (MCP) server** so Cursor can fulfil natural-language requests like *"summarise my day"* without you hand-coding HTTP calls each time.  
A Fastify proxy (≈ 60 LOC) will forward five endpoints to `api.gong.io`; the tool manifest is auto-generated from the OpenAPI spec. Deploy the container to **Cloud Run**, which is the easiest Fastify-friendly runtime on Google Cloud Platform. ([Serverless | Fastify](https://fastify.io/docs/latest/Guides/Serverless/?utm_source=chatgpt.com), [Quickstart: Build and deploy a Node.js web app to Google Cloud with Cloud Run  |  Cloud Run Documentation](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service))

---

## 1 Problem statement

* We use Gong for all of our call and email activity tracking and we often manually copying information from gong e.g. transcripts into AI tools for further processing however the manual effort makes it hard to do
* To mitigate the manual effort we build python functions to retrieve e.g. transcripts but we have to reconstruct API calls every time, the output is in JSON format and we have to add layers of processing. 
* Response shapes vary (camelCase vs snake_case, nested arrays) → brittle code and wasted time. ([Gong API pagination limit | Community](https://visioneers.gong.io/developers-79/gong-api-pagination-limit-1036?utm_source=chatgpt.com))
* We want to ask Cursor, in English, to "get all activities for jane@acme.com" or "pull Monday's Acme transcripts" and have it call the right endpoints, paginate, then hand back JSON.

---

## 2 In-scope use-cases

| Code Name | Natural prompt example | API calls required |
|-----------|------------------------|--------------------|
| **activities_by_person** | "Show everything Jane Doe did last quarter." | `GET /v2/data-privacy/data-for-email-address` |
| **company_day_transcripts** | "Download all Acme Inc. transcripts from 2025-04-28." | `POST /v2/calls/extensive` → ids → `POST /v2/calls/transcript` |
| **summarise_my_day** | "Summarise my day for PM view." | `POST /v2/calls/extensive` filtered by `primaryUserIds` + date → `POST /v2/calls/transcript` |

Each flow will later be encoded as a **Cursor rule macro** that chains tool calls.

---

## 3 Functional requirements

1. **Tooling** – The MCP must surface at least five tools: `list_calls`, `get_call`, `get_transcript`, `list_users`, `gdpr_lookup`.  
2. **Filters** – Support `callIds`, `primaryUserIds`, `fromDateTime`, `toDateTime`, and `participantsEmails` where the API permits.  
3. **Pagination** – Handle Gong's 100-item cursor token automatically. ([Gong API pagination limit | Community](https://visioneers.gong.io/developers-79/gong-api-pagination-limit-1036?utm_source=chatgpt.com))  
4. **Auth** – Basic Auth (`Access Key` / `Secret`) read from `GONG_TOKEN` env var. ([Gong API - Beginners Guide | Documentation | Postman API Network](https://www.postman.com/growment/gong-meetup/documentation/yuikwaq/gong-api-beginners-guide))  
5. **Latency** – Single call round-trips should stay < 1 s p95 inside VPC.  
6. **Scoping** – Internal prototype only; we ignore key rotation & quota back-off for now.

---

## 4 Non-functional requirements

* **Deployability** – Containerised; single `gcloud run deploy` must spin up the service. ([Quickstart: Build and deploy a Node.js web app to Google Cloud with Cloud Run  |  Cloud Run Documentation](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service))  
* **Maintainability** – Regenerate tool manifest from `gong.yaml`; no hand-edited schemas.  
* **Extensibility** – Adding a new endpoint should be a `yaml` edit + `npm run gen`.

---

## 5 High-level architecture

```mermaid
graph LR
    A[Cursor LLM] -->|stdin/stdout JSON| B[Gong-MCP (Fastify)]
    B -->|HTTP| C[api.gong.io]
    C -->|HTTP| B
```

Fastify is ideal because it maps routes to async functions, and it's officially documented as Cloud Run-friendly. ([Serverless | Fastify](https://fastify.io/docs/latest/Guides/Serverless/?utm_source=chatgpt.com))

---

## 6 OpenAPI stub (`gong.yaml`)

> **Save this file exactly as shown** (`spec/gong.yaml`).  
> It lists only the fields the three v1 flows need; expand later as required.

```yaml
openapi: 3.1.0
info:
  title: Gong Public API (calls + transcripts subset)
  version: 0.1.0
servers:
  - url: https://api.gong.io
paths:
  /v2/calls/{id}:
    get:
      summary: Retrieve a single call
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Call object
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SpecificCall' }

  /v2/calls/extensive:
    post:
      summary: Filtered call list with rich payload
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CallsRequest' }
      responses:
        '200':
          description: Calls list
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Calls' }

  /v2/calls/transcript:
    post:
      summary: Fetch transcripts for callIds or date window
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/TranscriptRequest' }
      responses:
        '200':
          description: Transcripts
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CallTranscripts' }

  /v2/users:
    get:
      summary: List Gong users
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Users' }

  /v2/data-privacy/data-for-email-address:
    get:
      summary: Objects referencing an email address
      parameters:
        - name: emailAddress
          in: query
          required: true
          schema: { type: string, format: email }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/EmailAddressReferences' }

components:
  schemas:
    SpecificCall:
      type: object
      properties:
        id: { type: string }
        title: { type: string }
        started: { type: string, format: date-time }
        duration: { type: integer }
        primaryUserId: { type: string }
        scope: { type: string, enum: [internal, external, unknown] }
        url: { type: string, format: uri }
        participants:
          type: array
          items: { $ref: '#/components/schemas/CallParticipant' }

    CallParticipant:
      type: object
      properties:
        user_id: { type: string }
        email_address: { type: string, format: email }
        name: { type: string }

    CallsRequest:
      type: object
      properties:
        callIds:
          type: array
          items: { type: string }
        primaryUserIds:
          type: array
          items: { type: string }
        fromDateTime: { type: string, format: date-time }
        toDateTime:   { type: string, format: date-time }
        participantsEmails:
          type: array
          items: { type: string, format: email }

    Calls:
      type: object
      properties:
        calls:
          type: array
          items: { $ref: '#/components/schemas/SpecificCall' }
        cursor: { type: string, nullable: true }

    TranscriptRequest:
      allOf:
        - $ref: '#/components/schemas/CallsRequest'

    CallTranscripts:
      type: object
      properties:
        callTranscripts:
          type: array
          items: { $ref: '#/components/schemas/CallTranscript' }
        cursor: { type: string, nullable: true }

    CallTranscript:
      type: object
      properties:
        call_id: { type: string }
        transcript:
          type: array
          items: { $ref: '#/components/schemas/Monologue' }

    Monologue:
      type: object
      properties:
        speaker_id: { type: string }
        sentences:
          type: array
          items: { $ref: '#/components/schemas/Sentence' }

    Sentence:
      type: object
      properties:
        start: { type: integer, description: 'milliseconds' }
        _end:  { type: integer }
        text:  { type: string }

    Users:
      type: object
      properties:
        users:
          type: array
          items:
            type: object
            properties:
              id: { type: string }
              email: { type: string, format: email }
              name: { type: string }

    EmailAddressReferences:
      type: object
      properties:
        calls:
          type: array
          items:
            type: object
            properties:
              callId: { type: string }
              started: { type: string, format: date-time }
              title: { type: string }
```

The field names mirror Gong's examples shown in Postman's public collection and community threads. ([Gong API - Beginners Guide | Documentation | Postman API Network](https://www.postman.com/growment/gong-meetup/documentation/yuikwaq/gong-api-beginners-guide), [Retrieve call transcript through API using python | Community](https://visioneers.gong.io/data-in-gong-71/retrieve-call-transcript-through-api-using-python-1158))

---

## 7 Implementation steps

> **Total hands-on time ≈ 3–4 h.**

### 7.1 Repo scaffolding

```bash
mkdir gong-mcp && cd $_
pnpm init -y          # or npm
pnpm add fastify axios
pnpm add -D typescript ts-node esbuild @types/node
pnpm add -D openapi-mcp-generator
```

### 7.2 Generate the tools

```bash
openapi-mcp-generator spec/gong.yaml --out tools   # → tools/tools.json
# Correction: The flags are --input and --output
pnpm openapi-mcp-generator --input spec/gong.yaml --output tools
```

This writes JSON-schema tool definitions that Cursor will load automatically. ([Serverless | Fastify](https://fastify.io/docs/latest/Guides/Serverless/?utm_source=chatgpt.com))

> **Note:** The `openapi-mcp-generator` tool (v3.0.0) scaffolded a full Node.js/TypeScript server project in the `tools` directory instead of just generating a `tools.json` manifest. We will adapt the following steps (7.3 onwards) to use this generated server structure, deviating from the original plan of building a custom Fastify proxy.

### 7.3 Fastify proxy (`src/server.ts`)

```typescript
import Fastify from 'fastify';
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.gong.io',
  headers: { Authorization: `Bearer ${process.env.GONG_TOKEN}` }
});

const server = Fastify();

server.post('/invoke/:tool', async (req, reply) => {
  const { tool } = req.params as { tool: string };
  const body = (req.body ?? {}) as Record<string, any>;

  const map = {
    list_calls: () => api.post('/v2/calls/extensive', body),
    get_call:   () => api.get(`/v2/calls/${body.id}`),
    get_transcript: () => api.post('/v2/calls/transcript', body),
    list_users: () => api.get('/v2/users'),
    gdpr_lookup: () =>
      api.get('/v2/data-privacy/data-for-email-address', { params: body })
  };

  return (await map[tool]()).data;
});

server.listen({ port: process.env.PORT || 3333 });
```

### 7.4 Build & local test

```bash
npx esbuild src/server.ts --bundle --platform=node --outfile=dist/index.js
GONG_TOKEN=XXXX node dist/index.js &
curl -X POST localhost:3333/invoke/list_calls -d '{"fromDateTime":"2025-04-28T00:00:00Z","toDateTime":"2025-04-28T23:59:59Z"}'
```

You should see JSON with `calls: [...]` (100-item max per page). ([Gong API pagination limit | Community](https://visioneers.gong.io/developers-79/gong-api-pagination-limit-1036?utm_source=chatgpt.com))

### 7.5 Deploy to Cloud Run

```bash
gcloud run deploy gong-mcp \
  --source . \
  --set-env-vars GONG_TOKEN=projects/123/secrets/gong-token:latest \
  --region us-central1 --allow-unauthenticated
```

Cloud Run automatically builds a container from source; no Dockerfile needed. ([Quickstart: Build and deploy a Node.js web app to Google Cloud with Cloud Run  |  Cloud Run Documentation](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service))

### 7.6 Wire Cursor

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gong": {
      "command": "curl",
      "args": ["https://gong-mcp-<hash>-uc.a.run.app/invoke"],
      "toolsManifest": "tools/tools.json"
    }
  }
}
```

Reload Cursor; you'll find the tools in the command palette and can write macros in `.cursor/rules`.  

Example rule for *summarise my day*:

```markdown
# summarise_day.md
If the user says "summarise my day":
1. tool gong.list_calls { "primaryUserIds":["$MY_USER_ID"],"fromDateTime":"$TODAY","toDateTime":"$TODAY" }
2. For each call.id → tool gong.get_transcript { "callIds":[id] }
3. Summarise and format action items.
```

---

## 8 Acceptance criteria

* [ ] Fastify proxy returns 200 for each endpoint with valid token
* [ ] Cursor's "activities_by_person" macro returns ≥ 1 call for a known email
* [ ] "summarise my day" produces a bullet list of calls with action items
* [ ] Deployment artefact lives in Cloud Run and cold-start < 2 s
* [ ] README documents `GONG_TOKEN` secret creation

---

## 9 Open questions / future work

1. **Error handling** – map 401/403 to "invalid token" messages
2. **Rate limits** – Gong allows ~1 req/s; batch transcripts?
3. **Streaming** – very long transcripts might exceed Cloud Run 32 MB response; consider chunking or compression
4. **Auth rotation** – Secret Manager rotation job
5. **RBAC** – restrict invoke path to internal IP range later

---

## 10 References

* Gong transcript POST uses JSON payload, not query string
* Gong `contentSelector` and filter field names from Postman public collection
* Pagination limit of 100 items and `cursor` token
* General API capabilities overview
* Fastify serverless guidance
* Fastify Cloud Functions boilerplate
* Using Fastify on Cloud Run blog
* Cloud Run Node.js quickstart (build & deploy)
* GCP doc: Fastify example with OpenTelemetry (proof Fastify is first-class citizen)
* Cloud Run WebSockets limits (for future streaming)

---

## 11 Implementation Challenges and Deviations

### 11.1 MCP Server Implementation Challenges

The original plan called for a simple Fastify proxy, but we encountered several challenges that led to significant deviations:

1. **MCP Server Structure**
   - Original Plan: Simple Fastify proxy with ~60 LOC
   - Actual Implementation: Using `openapi-mcp-generator`'s generated server structure
   - Reason: The generator tool (v3.0.0) created a full Node.js/TypeScript server project instead of just generating a `tools.json` manifest. This required adapting our implementation to work with the generated structure.

2. **Authentication Handling**
   - Original Plan: Basic Auth using `GONG_TOKEN` env var
   - Actual Implementation: More complex token handling due to MCP server requirements
   - Reason: The MCP server needs to maintain token state and handle token refresh, which wasn't accounted for in the original design.

3. **Server Transport**
   - Original Plan: Simple HTTP transport
   - Actual Implementation: Using `StdioServerTransport` for MCP communication
   - Reason: The MCP protocol requires stdin/stdout communication with Cursor, which wasn't explicitly addressed in the original design.

### 11.2 Technical Challenges

1. **Node.js Path Resolution**
   - Issue: The MCP server fails to find the Node.js executable
   - Current Status: 
     - Found correct Node.js path: `/opt/homebrew/bin/node` (not `/usr/local/bin/node`)
     - Server starts successfully with correct path
     - Environment variables not loaded properly (GONG_ACCESS_KEY and GONG_SECRET missing)
   - Next Steps: 
     - Update MCP configuration to use correct Node.js path
     - Fix environment variable loading
     - Document the correct path resolution strategy

2. **Module System Compatibility**
   - Issue: Switching between ES modules and CommonJS caused compatibility issues
   - Current Status: 
     - Using ES modules with proper configuration
     - Server starts and initializes correctly
     - Transport layer (StdioServerTransport) connects successfully
   - Impact: Required additional configuration and path resolution changes

3. **Environment Configuration**
   - Issue: `.env` file loading and environment variable handling
   - Current Status: 
     - `dotenv` attempts to load from correct path
     - Environment variables not being found
     - Need to verify `.env` file location and contents
   - Next Steps:
     - Verify `.env` file exists in correct location
     - Check environment variable names match expected values
     - Add error handling for missing environment variables

### 11.3 Next Steps

1. **Environment Setup**
   - Create `.env` file in project root with correct variables:
     ```
     GONG_ACCESS_KEY=your_access_key
     GONG_SECRET=your_secret
     ```
   - Verify environment variables are loaded correctly
   - Add validation for required environment variables

2. **Path Resolution**
   - Update MCP configuration to use `/opt/homebrew/bin/node`
   - Document the correct path resolution strategy
   - Add path validation in server startup

3. **Server Structure**
   - Add proper error handling for missing environment variables
   - Implement graceful shutdown
   - Add logging for server state transitions

4. **Testing Strategy**
   - Add environment variable validation tests
   - Test server startup with missing environment variables
   - Add integration tests for MCP communication

These findings show that the server structure and transport layer are working correctly, but we need to focus on proper environment setup and configuration.

---
