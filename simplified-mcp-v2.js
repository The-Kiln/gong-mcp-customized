import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Logging directory
const logDir = join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Simple logging function
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(logMessage);
  
  const logFile = join(logDir, `mcp_${type}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Gong MCP Server (Simplified v2)',
    timestamp: new Date().toISOString()
  });
});

// Main MCP endpoint
app.post('/api/mcp', async (req, res) => {
  try {
    const body = req.body;
    log(`Received MCP request: ${JSON.stringify(body)}`);
    
    // Handle notification messages (no response expected)
    if (body.method && body.method.startsWith('notifications/')) {
      log(`Handling notification: ${body.method}`);
      return res.status(204).end(); // Return 204 No Content for notifications
    }
    
    // Ensure we have a proper JSON-RPC request
    if (!body.jsonrpc || !body.method) {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: body.id || null,
        error: {
          code: -32600,
          message: "Invalid Request"
        }
      });
    }
    
    // Handle initialization
    if (body.method === "initialize") {
      log("Handling initialize request");
      return res.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "gong-mcp",
            version: "1.2.0"
          },
          capabilities: {
            tools: {}
          }
        }
      });
    }
    
    // Handle tools/list request
    if (body.method === "tools/list") {
      log("Handling tools/list request");
      
      // Define available tools
      const tools = [
        {
          name: "getv2callsbyid",
          description: "Retrieve a single call",
          inputSchema: {"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}
        },
        {
          name: "postv2callsextensive",
          description: "Filtered call list with rich payload",
          inputSchema: {"type":"object","properties":{"requestBody":{"type":"object","required":["filter"],"properties":{"filter":{"type":"object","properties":{"fromDateTime":{"type":"string","format":"date-time"},"toDateTime":{"type":"string","format":"date-time"},"callIds":{"type":"array","items":{"type":"string"}},"primaryUserIds":{"type":"array","items":{"type":"string"}},"participantsEmails":{"type":"array","items":{"type":"string","format":"email"}}}},"contentSelector":{"type":"object","properties":{"context":{"type":"string","enum":["None","Extended"]},"contextTiming":{"type":"array","items":{"type":"string","enum":["Now","TimeOfCall"]}},"exposedFields":{"type":"object","additionalProperties":{"type":"object"}}}},"cursor":{"type":"string"}},"description":"The JSON request body."}},"required":["requestBody"]}
        },
        {
          name: "postv2callstranscript",
          description: "Download transcripts",
          inputSchema: {"type":"object","properties":{"requestBody":{"type":"object","required":["filter"],"properties":{"filter":{"type":"object","properties":{"fromDateTime":{"type":"string","format":"date-time"},"toDateTime":{"type":"string","format":"date-time"},"callIds":{"type":"array","items":{"type":"string"}},"primaryUserIds":{"type":"array","items":{"type":"string"}},"participantsEmails":{"type":"array","items":{"type":"string","format":"email"}}}},"cursor":{"type":"string"}},"description":"The JSON request body."}},"required":["requestBody"]}
        },
        {
          name: "getv2users",
          description: "List Gong users (100-row pages)",
          inputSchema: {"type":"object","properties":{"cursor":{"type":"string"}}}
        },
        {
          name: "analyzeCallsWithNlp",
          description: "Analyze Gong call data using natural language queries",
          inputSchema: {"type":"object","properties":{"query":{"type":"string","description":"Natural language query describing what to analyze"},"timeRange":{"type":"object","properties":{"start":{"type":"string","format":"date-time"},"end":{"type":"string","format":"date-time"}},"description":"Optional time range to limit the analysis"},"maxCalls":{"type":"number","description":"Maximum number of calls to analyze (default: 100)"},"participants":{"type":"array","items":{"type":"string"},"description":"Optional list of participant emails to filter by"}},"required":["query"]}
        }
      ];
      
      return res.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: tools
        }
      });
    }
    
    // Handle tool call
    if (body.method === "tools/call") {
      log(`Handling tool call: ${body.params?.name}`);
      
      if (!body.params || !body.params.name) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32602,
            message: "Invalid params: missing tool name"
          }
        });
      }
      
      // Check for Gong credentials
      if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
        log("Missing Gong credentials", "error");
        return res.json({
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: -32000,
            message: "Missing Gong credentials"
          }
        });
      }
      
      const toolName = body.params.name;
      const toolArgs = body.params.arguments || {};
      
      // Create Gong API client
      const client = axios.create({
        baseURL: 'https://api.gong.io',
        auth: {
          username: process.env.GONG_ACCESS_KEY,
          password: process.env.GONG_SECRET
        }
      });
      
      try {
        let response;
        
        // Handle different tools
        switch (toolName) {
          case "getv2callsbyid":
            log(`Fetching call with ID: ${toolArgs.id}`);
            response = await client.get(`/v2/calls/${toolArgs.id}`);
            break;
            
          case "postv2callsextensive":
            log("Fetching extensive call list");
            response = await client.post('/v2/calls/extensive', toolArgs.requestBody);
            break;
            
          case "postv2callstranscript":
            log("Fetching call transcript");
            response = await client.post('/v2/calls/transcript', toolArgs.requestBody);
            break;
            
          case "getv2users":
            log("Fetching users list");
            const cursor = toolArgs.cursor ? `?cursor=${toolArgs.cursor}` : '';
            response = await client.get(`/v2/users${cursor}`);
            break;
            
          case "analyzeCallsWithNlp":
            log(`Analyzing calls with query: ${toolArgs.query}`);
            // This is where you'd call your NLP analysis logic
            // For now, return a simplified mock response
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    query: toolArgs.query,
                    summary: `Analysis of calls for query: "${toolArgs.query}"`,
                    keyInsights: [
                      "This is a simplified mock response",
                      "In production, this would connect to your full NLP analysis"
                    ]
                  }, null, 2)
                }]
              }
            });
            
          default:
            log(`Unknown tool: ${toolName}`, "error");
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`
              }
            });
        }
        
        // Format and return response
        return res.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{
              type: "text",
              text: JSON.stringify(response.data, null, 2)
            }]
          }
        });
        
      } catch (apiError) {
        log(`API error: ${apiError.message}`, "error");
        
        // Format API error for client
        const errorMessage = apiError.response 
          ? `API Error: ${apiError.response.status} - ${JSON.stringify(apiError.response.data).substring(0, 200)}`
          : apiError.message;
          
        return res.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{
              type: "text",
              text: errorMessage
            }]
          }
        });
      }
    }
    
    // Handle unknown method
    log(`Unknown method: ${body.method}`, "error");
    return res.json({
      jsonrpc: "2.0",
      id: body.id,
      error: {
        code: -32601,
        message: "Method not found"
      }
    });
    
  } catch (error) {
    log(`Unhandled error: ${error.message}`, "error");
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: "Internal server error",
        data: error.message
      }
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Simplified Gong MCP Server (v2) running on port ${PORT}`);
  log(`Health: http://localhost:${PORT}/health`);
  log(`MCP API: http://localhost:${PORT}/api/mcp`);
  log(`Environment: GONG_ACCESS_KEY=${process.env.GONG_ACCESS_KEY ? '✅ Set' : '❌ Missing'}, GONG_SECRET=${process.env.GONG_SECRET ? '✅ Set' : '❌ Missing'}`);
});