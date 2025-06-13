import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// Configure logging
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Gong API configuration
const GONG_API_URL = 'https://api.gong.io';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Gong MCP server is running' });
});

// Main MCP endpoint
app.post('/api/mcp', async (req, res) => {
  const body = req.body;
  log(`Received request: ${JSON.stringify(body)}`);

  try {
    // Handle notification messages (no response needed)
    if (body.method?.startsWith('notifications/')) {
      log(`Handling notification: ${body.method}`);
      return res.status(204).end();
    }

    // Handle initialization
    if (body.method === 'initialize') {
      log('Handling initialize request');
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
      log('Handling tools/list request');
      
      return res.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          tools: [
            {
              name: 'get-calls',
              description: 'Retrieve Gong calls',
              inputSchema: {
                type: 'object',
                properties: {
                  fromDate: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format'
                  },
                  toDate: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format'
                  },
                  limit: {
                    type: 'integer',
                    description: 'Maximum number of calls to return'
                  }
                }
              }
            },
            {
              name: 'get-call-transcript',
              description: 'Get transcript for a specific call',
              inputSchema: {
                type: 'object',
                properties: {
                  callId: {
                    type: 'string',
                    description: 'ID of the call'
                  }
                },
                required: ['callId']
              }
            },
            {
              name: 'get-users',
              description: 'List Gong users',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'integer',
                    description: 'Maximum number of users to return'
                  }
                }
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
      
      log(`Handling tool call: ${toolName}`);

      // Check if Gong credentials are set
      if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
        return res.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32000,
            message: 'Gong credentials not configured'
          }
        });
      }

      // Create Gong API client
      const gongClient = axios.create({
        baseURL: GONG_API_URL,
        auth: {
          username: process.env.GONG_ACCESS_KEY,
          password: process.env.GONG_SECRET
        }
      });

      // Process different tools
      switch (toolName) {
        case 'get-calls': {
          try {
            // Format dates for Gong API
            const today = new Date().toISOString().split('T')[0];
            const fromDate = args.fromDate || today;
            const toDate = args.toDate || today;
            
            const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
            const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
            
            log(`Getting calls from ${fromDate} to ${toDate}`);

            // Call Gong API
            const response = await gongClient.post('/v2/calls/extensive', {
              filter: {
                fromDateTime,
                toDateTime
              },
              contentSelector: {
                context: "Extended",
                contextTiming: ["TimeOfCall"],
                exposedFields: {
                  interaction: { questions: true, speakers: true },
                  content: { topics: true }
                }
              }
            });

            // Format response
            const calls = response.data.calls || [];
            const limit = args.limit || 10;
            
            const formattedCalls = calls.slice(0, limit).map(call => ({
              id: call.metaData.id,
              title: call.metaData.title,
              date: new Date(call.metaData.startTime).toISOString().split('T')[0],
              duration: Math.floor(call.metaData.duration / 60) + 'm ' + (call.metaData.duration % 60) + 's',
              participants: (call.metaData.participants || []).map(p => p.name).join(', ')
            }));

            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    dateRange: { from: fromDate, to: toDate },
                    totalFound: calls.length,
                    calls: formattedCalls
                  }, null, 2)
                }]
              }
            });
          } catch (error) {
            log(`Error getting calls: ${error.message}`);
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'get-call-transcript': {
          try {
            const { callId } = args;
            
            if (!callId) {
              return res.json({
                jsonrpc: '2.0',
                id: body.id,
                error: {
                  code: -32602,
                  message: 'Missing callId parameter'
                }
              });
            }

            log(`Getting transcript for call: ${callId}`);

            // Call Gong API
            const response = await gongClient.post('/v2/calls/transcript', {
              filter: {
                callIds: [callId]
              }
            });

            const transcripts = response.data.transcripts || [];
            
            if (transcripts.length === 0) {
              return res.json({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: [{
                    type: 'text',
                    text: `No transcript found for call ID: ${callId}`
                  }]
                }
              });
            }

            // Format transcript
            const transcript = transcripts[0];
            const formattedTranscript = {
              callId,
              title: transcript.title || 'Unknown',
              transcript: transcript.sentences.map(s => ({
                time: formatTime(s.startTime),
                speaker: s.speaker?.name || 'Unknown',
                text: s.text
              }))
            };

            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(formattedTranscript, null, 2)
                }]
              }
            });
          } catch (error) {
            log(`Error getting transcript: ${error.message}`);
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'get-users': {
          try {
            const limit = args.limit || 20;
            
            log(`Getting users (limit: ${limit})`);

            // Call Gong API
            const response = await gongClient.get('/v2/users');

            // Format response
            const users = response.data.users || [];
            const formattedUsers = users.slice(0, limit).map(user => ({
              id: user.id,
              name: user.name,
              email: user.emailAddress,
              title: user.title || 'N/A'
            }));

            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    totalUsers: users.length,
                    users: formattedUsers
                  }, null, 2)
                }]
              }
            });
          } catch (error) {
            log(`Error getting users: ${error.message}`);
            return handleApiError(res, body.id, error);
          }
        }

        default:
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          });
      }
    }

    // Handle unknown methods
    return res.json({
      jsonrpc: '2.0',
      id: body.id || null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  } catch (error) {
    log(`Server error: ${error.message}`);
    return res.status(500).json({
      jsonrpc: '2.0',
      id: body.id || null,
      error: {
        code: -32000,
        message: 'Internal server error',
        data: error.message
      }
    });
  }
});

// Helper function to handle API errors
function handleApiError(res, id, error) {
  const errorMessage = error.response
    ? `API Error: ${error.response.status} - ${JSON.stringify(error.response.data || {}).substring(0, 200)}`
    : `Error: ${error.message}`;
  
  return res.json({
    jsonrpc: '2.0',
    id: id,
    result: {
      content: [{
        type: 'text',
        text: errorMessage
      }]
    }
  });
}

// Helper function to format time from seconds
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Gong MCP Server running on port ${PORT}`);
  log(`Health check: http://localhost:${PORT}/health`);
  log(`MCP endpoint: http://localhost:${PORT}/api/mcp`);
  log(`Environment: GONG_ACCESS_KEY=${process.env.GONG_ACCESS_KEY ? 'Set' : 'Missing'}, GONG_SECRET=${process.env.GONG_SECRET ? 'Set' : 'Missing'}`);
});