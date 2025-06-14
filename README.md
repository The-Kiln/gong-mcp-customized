# Gong MCP

MCP integration for Gong API, enabling AI assistants to interact with Gong call recordings, transcripts, and analytics.

## Features

- Authentication via secure Basic Auth
- Access to calls, transcripts, users, and more
- **Automatic pagination** support for paginated endpoints
- Compatible with Cursor AI assistant
- Includes brief generation capability

## Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended) or npm
- Gong API credentials (Access Key and Secret)

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the TypeScript code:
   ```bash
   pnpm build
   ```
4. Configure your global Cursor MCP config at `~/.cursor/mcp.json` with your Gong credentials:
   ```json
   {
     "mcpServers": {
       "gong-mcp": {
         "type": "stdio",
         "command": "/opt/homebrew/bin/node",
         "args": ["/path/to/gong-mcp/build/index.js"],
         "cwd": "/path/to/gong-mcp",
         "environment": {
           "GONG_ACCESS_KEY": "your-access-key",
           "GONG_SECRET": "your-secret"
         }
       }
     }
   }
   ```

## Environment Variables

The following environment variables are required:
- `GONG_ACCESS_KEY`: Your Gong API access key
- `GONG_SECRET`: Your Gong API secret

These can be set either in your environment or in the Cursor MCP config.

## Documentation

- [Main Documentation](docs/gong-mcp.md) - Detailed API and usage documentation
- [Pagination Guide](docs/pagination.md) - How to use the pagination feature
- [Sample Requests](docs/sample_requests.md) - Example API requests and responses

## Development

Available npm scripts:
```bash
pnpm build        # Build the TypeScript code
pnpm dev          # Watch mode for development
pnpm test         # Run all tests
pnpm test:smoke   # Run smoke tests only
pnpm lint         # Run ESLint
```

## Testing

Run the smoke tests to validate your setup:
```bash
pnpm test:smoke
```
Note: Make sure to have `GONG_ACCESS_KEY` and `GONG_SECRET` environment variables set before running tests.

## Usage with Cursor

Once configured in your global Cursor MCP settings, the AI assistant can:
- Retrieve call recordings and transcripts
- Search for calls by date range or participants
- Access user information
- Generate briefs for deals/accounts
- Analyze call patterns and metrics
- Automatically fetch all pages of paginated data