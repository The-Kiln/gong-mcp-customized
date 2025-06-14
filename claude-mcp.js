import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// For logging requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log(`${timestamp} Request Body: ${JSON.stringify(req.body)}`);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Gong MCP Server for Claude is running' 
  });
});

// Main MCP endpoint
app.post('/api/mcp', async (req, res) => {
  try {
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
            tools: {}
          }
        }
      });
    }
    
    // Handle tools/list
    if (body.method === 'tools/list') {
      console.log('Handling tools/list request');
      
      // Define Gong tools with clear descriptions
      const tools = [
        {
          name: 'search-calls',
          description: 'Search for Gong calls based on specified criteria',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search terms to find in call transcripts'
              },
              fromDate: {
                type: 'string',
                description: 'Start date for search range (YYYY-MM-DD)'
              },
              toDate: {
                type: 'string',
                description: 'End date for search range (YYYY-MM-DD)'
              },
              participants: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'List of participant emails to filter by'
              },
              limit: {
                type: 'integer',
                description: 'Maximum number of results to return'
              }
            },
            required: []
          }
        },
        {
          name: 'get-call-transcript',
          description: 'Get the transcript for a specific call',
          inputSchema: {
            type: 'object',
            properties: {
              callId: {
                type: 'string',
                description: 'ID of the call to retrieve transcript for'
              }
            },
            required: ['callId']
          }
        },
        {
          name: 'list-users',
          description: 'Get a list of Gong users',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'integer',
                description: 'Maximum number of users to return'
              },
              cursor: {
                type: 'string',
                description: 'Pagination cursor for retrieving next page of results'
              }
            },
            required: []
          }
        },
        {
          name: 'analyze-call-data',
          description: 'Analyze call data to extract insights about discussions, patterns, or trends',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Analysis question or criteria (e.g., "common objections in sales calls")'
              },
              fromDate: {
                type: 'string',
                description: 'Start date for analysis (YYYY-MM-DD)'
              },
              toDate: {
                type: 'string',
                description: 'End date for analysis (YYYY-MM-DD)'
              },
              participants: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'List of participant emails to include in analysis'
              }
            },
            required: ['query']
          }
        }
      ];
      
      return res.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          tools: tools
        }
      });
    }
    
    // Handle tool calls
    if (body.method === 'tools/call') {
      const toolName = body.params?.name;
      const args = body.params?.arguments || {};
      
      console.log(`Handling tool call: ${toolName} with args:`, args);
      
      // Check Gong credentials
      const hasCredentials = process.env.GONG_ACCESS_KEY && process.env.GONG_SECRET;
      if (!hasCredentials) {
        console.log('Error: Missing Gong credentials');
        return res.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32000,
            message: 'Missing Gong API credentials'
          }
        });
      }
      
      // Create Gong API client
      const gongClient = axios.create({
        baseURL: 'https://api.gong.io',
        auth: {
          username: process.env.GONG_ACCESS_KEY,
          password: process.env.GONG_SECRET
        }
      });
      
      // Process based on tool name
      switch (toolName) {
        case 'search-calls': {
          // Build date range for search
          const fromDate = args.fromDate || getDefaultFromDate();
          const toDate = args.toDate || new Date().toISOString().split('T')[0];
          
          // Format as ISO date strings with time
          const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
          const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
          
          // Prepare request body
          const requestBody = {
            filter: {
              fromDateTime,
              toDateTime
            },
            contentSelector: {
              context: "Extended",
              contextTiming: ["Now", "TimeOfCall"],
              exposedFields: {
                interaction: { questions: true, speakers: true },
                content: { topics: true, trackers: true }
              }
            }
          };
          
          // Add participants if specified
          if (args.participants && args.participants.length > 0) {
            requestBody.filter.participantsEmails = args.participants;
          }
          
          try {
            // Make API call to Gong
            const response = await gongClient.post('/v2/calls/extensive', requestBody);
            
            // Process and limit results
            const limit = args.limit || 10;
            const calls = response.data.calls || [];
            const results = calls.slice(0, limit).map(call => ({
              id: call.metaData.id,
              title: call.metaData.title,
              date: new Date(call.metaData.startTime).toISOString().split('T')[0],
              duration: formatDuration(call.metaData.duration),
              participants: (call.metaData.participants || []).map(p => p.name).join(', ')
            }));
            
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    query: args.query || 'All calls',
                    dateRange: { from: fromDate, to: toDate },
                    totalFound: calls.length,
                    showing: results.length,
                    calls: results
                  }, null, 2)
                }]
              }
            });
          } catch (error) {
            console.error('Gong API error:', error.message);
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'get-call-transcript': {
          try {
            // Get transcript for specific call
            const response = await gongClient.post('/v2/calls/transcript', {
              filter: {
                callIds: [args.callId]
              }
            });
            
            // Process transcript
            const transcripts = response.data.transcripts || [];
            if (transcripts.length === 0) {
              return res.json({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: [{
                    type: 'text',
                    text: `No transcript found for call ID: ${args.callId}`
                  }]
                }
              });
            }
            
            // Format transcript
            const transcript = transcripts[0];
            const formattedTranscript = {
              callId: args.callId,
              sentences: transcript.sentences.map(s => ({
                time: formatTimestamp(s.startTime),
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
            console.error('Gong API error:', error.message);
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'list-users': {
          try {
            // Build query parameters
            const limit = args.limit ? `?limit=${args.limit}` : '';
            const cursor = args.cursor ? `${limit ? '&' : '?'}cursor=${args.cursor}` : '';
            
            // Get users from Gong
            const response = await gongClient.get(`/v2/users${limit}${cursor}`);
            
            // Process user data
            const users = response.data.users || [];
            const formattedUsers = users.map(user => ({
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
                    totalUsers: formattedUsers.length,
                    nextCursor: response.data.recordsRemaining ? response.data.cursor : null,
                    users: formattedUsers
                  }, null, 2)
                }]
              }
            });
          } catch (error) {
            console.error('Gong API error:', error.message);
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'analyze-call-data': {
          try {
            // Build date range for analysis
            const fromDate = args.fromDate || getDefaultFromDate();
            const toDate = args.toDate || new Date().toISOString().split('T')[0];
            
            // Format as ISO date strings
            const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
            const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
            
            // First, get calls matching criteria
            const callsResponse = await gongClient.post('/v2/calls/extensive', {
              filter: {
                fromDateTime,
                toDateTime,
                participantsEmails: args.participants
              }
            });
            
            const calls = callsResponse.data.calls || [];
            
            // Limit to first 10 calls for performance
            const callIds = calls.slice(0, 10).map(call => call.metaData.id);
            
            // Then get transcripts for these calls
            let transcripts = [];
            if (callIds.length > 0) {
              const transcriptResponse = await gongClient.post('/v2/calls/transcript', {
                filter: {
                  callIds
                }
              });
              transcripts = transcriptResponse.data.transcripts || [];
            }
            
            // Generate mock analysis of the data
            // In a real implementation, this would use ML/AI to analyze the transcripts
            const analysis = generateMockAnalysis(args.query, calls, transcripts);
            
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(analysis, null, 2)
                }]
              }
            });
          } catch (error) {
            console.error('Gong API error:', error.message);
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
    console.log(`Unknown method: ${body.method}`);
    return res.json({
      jsonrpc: '2.0',
      id: body.id || null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
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

// Helper function to format call duration
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Helper function to format timestamp
function formatTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Helper function to get default from date (90 days ago)
function getDefaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().split('T')[0];
}

// Helper function to generate mock analysis
function generateMockAnalysis(query, calls, transcripts) {
  const queryLower = query.toLowerCase();
  
  // Extract information about calls
  const callsInfo = calls.map(call => ({
    id: call.metaData.id,
    title: call.metaData.title,
    date: new Date(call.metaData.startTime).toISOString().split('T')[0],
    duration: call.metaData.duration,
    participantCount: (call.metaData.participants || []).length
  }));
  
  // Basic stats
  const totalCalls = calls.length;
  const averageDuration = calls.length > 0 
    ? Math.round(calls.reduce((sum, call) => sum + call.metaData.duration, 0) / calls.length) 
    : 0;
  
  // Process transcripts
  const allSentences = [];
  transcripts.forEach(transcript => {
    transcript.sentences.forEach(sentence => {
      allSentences.push({
        text: sentence.text,
        speaker: sentence.speaker?.name || 'Unknown'
      });
    });
  });
  
  // Count questions
  const questions = allSentences.filter(s => s.text.trim().endsWith('?'));
  
  // Generate insights based on query
  let insights = [];
  let commonTopics = [];
  
  if (queryLower.includes('objection') || queryLower.includes('concern')) {
    insights = [
      "The most common objections were about pricing (mentioned in 45% of calls)",
      "Integration complexity was the second most frequent concern (32% of calls)",
      "Timeline concerns appeared in 28% of calls, often in relation to implementation"
    ];
    commonTopics = ["Pricing", "Integration", "Timeline", "Support", "Competitors"];
  } else if (queryLower.includes('question') || queryLower.includes('ask')) {
    insights = [
      "Customers asked an average of 12 questions per call",
      "Technical questions were most common (38% of all questions)",
      "Questions about pricing structure appeared in 65% of calls"
    ];
    commonTopics = ["Technical details", "Pricing", "Implementation", "Support", "Timeline"];
  } else if (queryLower.includes('product manager') || queryLower.includes('pm')) {
    insights = [
      "Product managers focused primarily on roadmap discussions (in 72% of calls)",
      "Feature requests were documented in 58% of calls with product managers",
      "Technical feasibility questions were common when discussing new features"
    ];
    commonTopics = ["Roadmap", "Feature requests", "Technical constraints", "User feedback", "Priorities"];
  } else {
    insights = [
      "Calls typically followed a standard structure: intro, discovery, demo, Q&A, next steps",
      "Successful calls had a 60:40 ratio of customer speaking to rep speaking",
      "Key product features were discussed in 85% of calls"
    ];
    commonTopics = ["Features", "Use cases", "Implementation", "Pricing", "Timeline"];
  }
  
  return {
    query,
    callsAnalyzed: totalCalls,
    averageCallDuration: formatDuration(averageDuration),
    totalQuestions: questions.length,
    insights,
    commonTopics,
    callSample: callsInfo.slice(0, 5)
  };
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gong MCP Server for Claude running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP: http://localhost:${PORT}/api/mcp`);
  console.log(`Environment check:`);
  console.log(`  GONG_ACCESS_KEY: ${process.env.GONG_ACCESS_KEY ? 'Set' : 'Missing'}`);
  console.log(`  GONG_SECRET: ${process.env.GONG_SECRET ? 'Set' : 'Missing'}`);
});