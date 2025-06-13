# Enhanced Gong MCP Server (v2)

This enhanced version of the Gong MCP server adds natural language processing and AI capabilities for analyzing large datasets from Gong calls, with improved pagination and logging features.

## New Features

- **Natural Language Queries**: Analyze call data using plain English questions
- **Large Dataset Processing**: Handle and analyze multiple calls at once
- **AI Integration**: Ready for integration with AI models like Claude
- **Pagination Support**: Process larger datasets across multiple pages
- **Comprehensive Logging**: Track all queries and results for auditing

## Setup

1. Clone this repository (if you haven't already)
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the TypeScript code:
   ```bash
   pnpm build
   ```
4. Configure your environment variables:
   - Create a `.env` file with your Gong credentials:
     ```
     GONG_ACCESS_KEY=your-access-key
     GONG_SECRET=your-secret
     PORT=3000
     ```

## Running the Enhanced Server

Start the enhanced server with:

```bash
pnpm start:enhanced
```

This will:
1. Build the TypeScript code
2. Start the HTTP server on port 3000 (or the port specified in your `.env` file)
3. Enable all standard MCP functionality plus the new natural language features

## API Endpoints

### Standard MCP Endpoints
- `POST /api/mcp`: Standard MCP request handling
- `GET /api/tools`: List of available tools

### New AI/NLP Endpoints
- `POST /api/analyze`: Process natural language queries about Gong call data
- `POST /api/ai/query`: Direct AI integration endpoint

### Logging Endpoints
- `GET /api/logs`: List all available log files
- `GET /api/logs/{logName}`: Download a specific log file

## Example Queries

Here are some examples of natural language queries you can use with the `/api/analyze` endpoint:

### Basic Query
```json
{
  "query": "Analyze all calls we've ever had with product managers, and give me a general overview of their common questions",
  "timeRange": {
    "start": "2025-01-01T00:00:00Z",
    "end": "2025-06-01T23:59:59Z"
  },
  "maxCalls": 200
}
```

### Query with Participant Filtering
```json
{
  "query": "Find patterns in objections raised by enterprise customers in the last quarter",
  "participants": ["customer1@example.com", "customer2@example.com"]
}
```

### Query with Pagination
```json
{
  "query": "Analyze all calls with product managers and summarize common questions",
  "page": 1,
  "pageSize": 50,
  "logResults": true
}
```

### Continuing from Previous Page (Pagination)
```json
{
  "query": "Analyze all calls with product managers and summarize common questions",
  "page": 2,
  "pageSize": 50,
  "cursor": "eyJsYXN0SWQiOiIxMjM0NTY3ODkwIiwibGFzdFRpbWVzdGFtcCI6IjIwMjUtMDYtMDFUMDA6MDA6MDBaIn0="
}
```

## Logging System

The enhanced server automatically logs all queries and results to the `logs` directory. This helps with debugging and provides a record of all analysis performed.

### Available Log Types:
- `incoming_queries.log`: Records all incoming NLP queries
- `ai_queries.log`: Records AI integration requests
- `info_YYYY-MM-DD.log`: Daily information logs
- `error_YYYY-MM-DD.log`: Error logs
- `result_[timestamp].json`: Complete result data for each query
- `analysis_[timestamp].json`: Detailed analysis results

### Accessing Logs via API

You can access logs through these endpoints:

- `GET /api/logs`: Lists all available log files
- `GET /api/logs/{logName}`: Downloads a specific log file

This is particularly useful when working with large datasets where results might be truncated in the API response.

## Pagination

For large datasets, you can use pagination to process calls in manageable chunks:

1. Make your initial request with `page=1` and your desired `pageSize`
2. Check the response's `pagination` object for:
   - `totalPages`: Total number of pages available
   - `hasMore`: Boolean indicating if there are more pages
   - `nextCursor`: Optional cursor for more efficient pagination
3. To fetch the next page, send another request with `page` incremented
4. For better performance with large datasets, include the `cursor` value from the previous response

Example pagination response:
```json
{
  "query": "...",
  "callsAnalyzed": 50,
  "totalCallsFound": 432,
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalPages": 9,
    "hasMore": true,
    "nextCursor": "eyJsYXN0SWQiOiIxMjM0NTY3ODkwIiwibGFzdFRpbWVzdGFtcCI6IjIwMjUtMDYtMDFUMDA6MDA6MDBaIn0="
  },
  "analysis": { ... }
}
```

## Hosting

To host this server and integrate it with Anthropic:

1. Deploy to a server hosting platform (AWS, Azure, GCP, Heroku, etc.)
2. Make sure your server is accessible via HTTPS
3. Configure your Anthropic account to use your server's URL as the MCP endpoint
4. Ensure your environment variables are set on the hosting platform

## Security Notes

- Keep your Gong API credentials secure
- Use environment variables for sensitive information
- Consider implementing rate limiting for production use
- Add authentication for the HTTP endpoints if exposed publicly

## Troubleshooting

If you encounter issues:

1. Check your Gong API credentials
2. Verify that your server has internet access to reach api.gong.io
3. Examine the logs in the `logs` directory for detailed error information
4. Check the logs endpoint `GET /api/logs` to view all available logs
5. Ensure you have sufficient memory for processing large datasets
6. If you're getting truncated results, use pagination with a smaller page size