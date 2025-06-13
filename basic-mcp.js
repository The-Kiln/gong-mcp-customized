import express from 'express';
import cors from 'cors';

// Create Express app
const app = express();
app.use(express.json());
app.use(cors());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log(`Request Body: ${JSON.stringify(req.body)}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Main MCP endpoint
app.post('/api/mcp', (req, res) => {
  const body = req.body;
  
  // Handle notification messages (no response needed)
  if (body.method && body.method.startsWith('notifications/')) {
    console.log(`Handling notification: ${body.method}`);
    return res.status(204).end();
  }
  
  // Handle initialization
  if (body.method === 'initialize') {
    console.log('Handling initialize request');
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'gong-mcp',
          version: '1.0.0'
        },
        capabilities: {
          tools: {
            enabled: true
          }
        }
      }
    });
  }
  
  // Handle tools/list
  if (body.method === 'tools/list') {
    console.log('Handling tools/list request');
    
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        tools: [
          {
            name: 'search-calls',
            description: 'Search for Gong calls based on criteria',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query'
                }
              },
              required: []
            }
          }
        ]
      }
    });
  }
  
  // Handle tool calls
  if (body.method === 'tools/call') {
    const toolName = body.params?.name;
    const args = body.params?.arguments || {};
    
    console.log(`Handling tool call: ${toolName} with args:`, args);
    
    if (toolName === 'search-calls') {
      return res.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query || 'All calls',
              results: [
                {
                  id: 'call-1',
                  title: 'Call with Product Team',
                  date: '2025-06-13',
                  participants: 'John Smith, Jane Doe'
                },
                {
                  id: 'call-2',
                  title: 'Sales Discovery Call',
                  date: '2025-06-13',
                  participants: 'Alice Johnson, Bob Miller'
                }
              ]
            }, null, 2)
          }]
        }
      });
    }
    
    // Unknown tool
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32601,
        message: `Unknown tool: ${toolName}`
      }
    });
  }
  
  // Default response for unknown methods
  return res.json({
    jsonrpc: '2.0',
    id: body.id || null,
    error: {
      code: -32601,
      message: 'Method not found'
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Basic MCP Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP: http://localhost:${PORT}/api/mcp`);
});