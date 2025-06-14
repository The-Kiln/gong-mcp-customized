const express = require('express');
const cors = require('cors');
const app = express();

// Essential middleware
app.use(express.json());
app.use(cors());

// For logging requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log('Body:', JSON.stringify(req.body));
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
    return res.status(204).end();
  }
  
  // Handle initialization
  if (body.method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'minimal-gong-mcp',
          version: '1.0.0'
        },
        capabilities: {
          tools: {}
        }
      }
    });
  }
  
  // Handle tools/list
  if (body.method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        tools: [
          {
            name: 'gongSearch',
            description: 'Search Gong calls and get information about calls, transcripts, and users',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'What you want to search for or analyze in Gong'
                }
              },
              required: ['query']
            }
          }
        ]
      }
    });
  }
  
  // Handle tool call
  if (body.method === 'tools/call') {
    const toolName = body.params.name;
    const args = body.params.arguments || {};
    
    if (toolName === 'gongSearch') {
      return res.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: args.query,
                results: [
                  {
                    type: 'call',
                    id: 'call-1',
                    title: 'Sample Call with Enterprise Client',
                    date: '2025-06-01T14:30:00Z',
                    participants: ['John Doe', 'Jane Smith'],
                    summary: 'Discussion about pricing and implementation timeline'
                  },
                  {
                    type: 'call',
                    id: 'call-2',
                    title: 'Product Demo with Prospect',
                    date: '2025-06-05T10:15:00Z',
                    participants: ['Sarah Johnson', 'Mike Brown'],
                    summary: 'Demonstration of key features and addressing technical questions'
                  }
                ]
              }, null, 2)
            }
          ]
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Minimal MCP Server running on port ${PORT}`);
});