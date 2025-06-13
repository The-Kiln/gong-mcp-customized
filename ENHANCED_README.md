# Enhanced Gong MCP Server

This enhanced version of the Gong MCP server adds natural language processing and AI capabilities for analyzing large datasets from Gong calls.

## New Features

- **Natural Language Queries**: Analyze call data using plain English questions
- **Large Dataset Processing**: Handle and analyze multiple calls at once
- **AI Integration**: Ready for integration with AI models like Claude

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

## Example Queries

Here are some examples of natural language queries you can use with the `/api/analyze` endpoint:

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

```json
{
  "query": "Find patterns in objections raised by enterprise customers in the last quarter",
  "participants": ["customer1@example.com", "customer2@example.com"]
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
3. Look at the server logs for detailed error information
4. Ensure you have sufficient memory for processing large datasets