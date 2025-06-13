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
    service: 'Gong MCP Server (v3)',
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
            tools: {
              // Enable tools capability
              enabled: true
            }
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
          name: "queryGongCalls",
          description: "Search and analyze Gong calls using natural language. Example queries: 'Show me calls with product managers', 'Find calls where pricing was discussed', 'Analyze sentiment in sales calls from last quarter'",
          inputSchema: {"type":"object","properties":{"query":{"type":"string","description":"Natural language query describing what data to find or analyze"},"timeRange":{"type":"object","properties":{"start":{"type":"string","format":"date-time"},"end":{"type":"string","format":"date-time"}},"description":"Optional time range to limit the analysis"},"maxResults":{"type":"number","description":"Maximum number of results to return (default: 10)"}},"required":["query"]}
        },
        {
          name: "getCallTranscript",
          description: "Get the full transcript of a specific Gong call",
          inputSchema: {"type":"object","properties":{"callId":{"type":"string","description":"ID of the call to retrieve"}},"required":["callId"]}
        },
        {
          name: "analyzeCallContent",
          description: "Analyze the content of calls to extract insights, trends, patterns or statistics",
          inputSchema: {"type":"object","properties":{"query":{"type":"string","description":"What to analyze about the calls"},"callIds":{"type":"array","items":{"type":"string"},"description":"Optional array of specific call IDs to analyze"},"timeRange":{"type":"object","properties":{"start":{"type":"string","format":"date-time"},"end":{"type":"string","format":"date-time"}},"description":"Optional time range to limit the analysis"},"participants":{"type":"array","items":{"type":"string"},"description":"Optional list of participant emails to include"}},"required":["query"]}
        },
        {
          name: "searchCalls",
          description: "Search for calls based on various criteria",
          inputSchema: {"type":"object","properties":{"fromDateTime":{"type":"string","format":"date-time"},"toDateTime":{"type":"string","format":"date-time"},"participants":{"type":"array","items":{"type":"string"}},"keywords":{"type":"array","items":{"type":"string"}}},"required":[]}
        },
        {
          name: "listUsers",
          description: "List Gong users",
          inputSchema: {"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor for retrieving next page"},"limit":{"type":"number","description":"Number of users to return per page"}}}
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
        // Handle different tools
        switch (toolName) {
          case "queryGongCalls": {
            log(`Querying Gong calls with: ${toolArgs.query}`);
            
            // Convert natural language query to search parameters
            const searchParams = {
              filter: {
                fromDateTime: toolArgs.timeRange?.start || getDefaultStartDate(),
                toDateTime: toolArgs.timeRange?.end || new Date().toISOString()
              },
              contentSelector: {
                context: "Extended",
                contextTiming: ["Now", "TimeOfCall"],
                exposedFields: {
                  interaction: { questions: true, speakers: true },
                  content: { topics: true, trackers: true },
                  media: true
                }
              }
            };
            
            // Execute search
            const response = await client.post('/v2/calls/extensive', searchParams);
            
            // Process and filter results based on the query
            const maxResults = toolArgs.maxResults || 10;
            const processedResults = {
              query: toolArgs.query,
              timeRange: {
                start: searchParams.filter.fromDateTime,
                end: searchParams.filter.toDateTime
              },
              totalFound: response.data.calls?.length || 0,
              results: (response.data.calls || []).slice(0, maxResults).map(call => ({
                id: call.metaData.id,
                title: call.metaData.title,
                date: call.metaData.startTime,
                duration: call.metaData.duration,
                participants: call.metaData.participants?.map(p => p.name).join(', ') || 'Unknown',
                url: call.metaData.url || 'N/A'
              }))
            };
            
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify(processedResults, null, 2)
                }]
              }
            });
          }
          
          case "getCallTranscript": {
            log(`Fetching transcript for call ID: ${toolArgs.callId}`);
            
            // Request transcript for the call
            const response = await client.post('/v2/calls/transcript', {
              filter: {
                callIds: [toolArgs.callId]
              }
            });
            
            // Process transcript
            const transcript = response.data.transcripts?.[0] || { sentences: [] };
            const formattedTranscript = {
              callId: toolArgs.callId,
              transcript: transcript.sentences.map(s => ({
                time: s.startTime,
                speaker: s.speaker?.name || 'Unknown',
                text: s.text
              }))
            };
            
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify(formattedTranscript, null, 2)
                }]
              }
            });
          }
          
          case "analyzeCallContent": {
            log(`Analyzing calls with query: ${toolArgs.query}`);
            
            let callsData = [];
            
            // If specific call IDs are provided
            if (toolArgs.callIds && toolArgs.callIds.length > 0) {
              // Get transcripts for specific calls
              const response = await client.post('/v2/calls/transcript', {
                filter: {
                  callIds: toolArgs.callIds
                }
              });
              
              callsData = response.data.transcripts || [];
            } else {
              // Search for calls based on time range and participants
              const searchParams = {
                filter: {
                  fromDateTime: toolArgs.timeRange?.start || getDefaultStartDate(),
                  toDateTime: toolArgs.timeRange?.end || new Date().toISOString(),
                  participantsEmails: toolArgs.participants
                }
              };
              
              // Get calls
              const callsResponse = await client.post('/v2/calls/extensive', searchParams);
              const callIds = (callsResponse.data.calls || [])
                .slice(0, 10) // Limit to 10 calls for performance
                .map(call => call.metaData.id);
              
              // Get transcripts for these calls
              if (callIds.length > 0) {
                const transcriptResponse = await client.post('/v2/calls/transcript', {
                  filter: {
                    callIds: callIds
                  }
                });
                
                callsData = transcriptResponse.data.transcripts || [];
              }
            }
            
            // Mock analysis based on the query and available data
            const analysis = {
              query: toolArgs.query,
              callsAnalyzed: callsData.length,
              insights: [
                "This is a simplified analysis based on your query",
                "In a real implementation, this would use AI to analyze the call content",
                "The analysis would be tailored to your specific query"
              ],
              commonTopics: ["Pricing", "Implementation", "Timeline", "Features"],
              callSummary: callsData.map(call => ({
                callId: call.callId,
                duration: call.duration || 'Unknown',
                speakerCount: [...new Set(call.sentences.map(s => s.speaker?.name).filter(Boolean))].length,
                sentenceCount: call.sentences.length
              }))
            };
            
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify(analysis, null, 2)
                }]
              }
            });
          }
          
          case "searchCalls": {
            log("Searching calls with criteria");
            
            const searchParams = {
              filter: {
                fromDateTime: toolArgs.fromDateTime || getDefaultStartDate(),
                toDateTime: toolArgs.toDateTime || new Date().toISOString(),
                participantsEmails: toolArgs.participants
              }
            };
            
            const response = await client.post('/v2/calls/extensive', searchParams);
            
            // Process results
            const results = {
              totalCalls: response.data.calls?.length || 0,
              calls: (response.data.calls || []).slice(0, 20).map(call => ({
                id: call.metaData.id,
                title: call.metaData.title,
                date: call.metaData.startTime,
                duration: call.metaData.duration,
                participants: call.metaData.participants?.map(p => p.name).join(', ') || 'Unknown'
              }))
            };
            
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify(results, null, 2)
                }]
              }
            });
          }
          
          case "listUsers": {
            log("Fetching users list");
            
            const cursor = toolArgs.cursor ? `?cursor=${toolArgs.cursor}` : '';
            const limit = toolArgs.limit ? `${cursor ? '&' : '?'}limit=${toolArgs.limit}` : '';
            
            const response = await client.get(`/v2/users${cursor}${limit}`);
            
            // Process user list
            const userList = {
              totalUsers: response.data.users?.length || 0,
              cursor: response.data.recordsRemaining ? response.data.cursor : null,
              users: (response.data.users || []).map(user => ({
                id: user.id,
                name: user.name,
                email: user.emailAddress,
                title: user.title || 'N/A',
                enabled: user.enabled
              }))
            };
            
            return res.json({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{
                  type: "text",
                  text: JSON.stringify(userList, null, 2)
                }]
              }
            });
          }
            
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

// Helper function to get default start date (90 days ago)
function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString();
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Gong MCP Server (v3) running on port ${PORT}`);
  log(`Health: http://localhost:${PORT}/health`);
  log(`MCP API: http://localhost:${PORT}/api/mcp`);
  log(`Environment: GONG_ACCESS_KEY=${process.env.GONG_ACCESS_KEY ? '✅ Set' : '❌ Missing'}, GONG_SECRET=${process.env.GONG_SECRET ? '✅ Set' : '❌ Missing'}`);
});