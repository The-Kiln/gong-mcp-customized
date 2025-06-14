# Gong MCP - Pagination Support

This document explains how to use the pagination feature in the Gong MCP implementation.

## Endpoints with Pagination Support

The following endpoints support pagination:

1. `POST /v2/calls/extensive`
2. `POST /v2/calls/transcript`
3. `GET /v2/users`
4. `GET /v2/data-privacy/data-for-email-address`

## How to Use Pagination

### Automatic Pagination

To automatically fetch all pages and get the complete result set in a single response, add the `paginate` parameter to your request:

```json
{
  "paginate": true,
  "requestBody": {
    "filter": {
      "fromDateTime": "2025-04-01T00:00:00Z",
      "toDateTime": "2025-04-30T23:59:59Z"
    }
  }
}
```

When you set `paginate: true`, the MCP server will:

1. Make the initial request to the Gong API
2. Detect if there are more pages by looking for a cursor in the response
3. Automatically fetch all subsequent pages
4. Combine the results from all pages into a single response

The combined response will include a `_paginationInfo` object with metadata about the pagination process:

```json
{
  "calls": [...],
  "nextPageCursor": null,
  "_paginationInfo": {
    "hasMorePages": false,
    "totalPages": 3,
    "currentPage": 3
  }
}
```

### Manual Pagination

If you prefer to handle pagination manually, you can use the cursor returned in the response to fetch subsequent pages:

1. Make the initial request without a cursor
2. Extract the `nextPageCursor` from the response
3. Make subsequent requests with the cursor parameter

For GET endpoints, add the cursor as a query parameter:

```
GET /v2/users?cursor=eyJpZCI6IjEyMzQ1Njc4OTAifQ==
```

For POST endpoints, include the cursor in the request body:

```json
{
  "requestBody": {
    "filter": {
      "fromDateTime": "2025-04-01T00:00:00Z",
      "toDateTime": "2025-04-30T23:59:59Z"
    },
    "cursor": "eyJpZCI6IjEyMzQ1Njc4OTAifQ=="
  }
}
```

## Examples

### Example 1: List all users (automatic pagination)

```json
{
  "paginate": true
}
```

### Example 2: Get all calls in a date range (automatic pagination)

```json
{
  "paginate": true,
  "requestBody": {
    "filter": {
      "fromDateTime": "2025-04-01T00:00:00Z",
      "toDateTime": "2025-04-30T23:59:59Z"
    }
  }
}
```

### Example 3: Get activities for an email address (automatic pagination)

```json
{
  "paginate": true,
  "emailAddress": "user@example.com"
}
```

## Pagination Response Structure

The structure of the pagination response depends on the endpoint:

1. For endpoints that return data in a `records` array:
   - All records are merged into a single `records` array
   - The final `nextPageCursor` is included (will be `null` with automatic pagination)

2. For endpoints that return data in specific arrays like `calls` or `users`:
   - All items are merged into a single array under the same key
   - The final cursor is included

3. For other response structures:
   - Additional pages are stored in an `additionalPages` array

In all cases, pagination metadata is added in a `_paginationInfo` object.