import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

// MCP Server info
const SERVER_NAME = "gong-mcp";
const SERVER_VERSION = "1.0.0";
const API_BASE_URL = "https://api.gong.io";

// Create server
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// Tool definitions
const tools = [
  {
    name: "getCalls",
    description: "Retrieve a list of Gong calls",
    inputSchema: {
      type: "object",
      properties: {
        fromDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (defaults to 30 days ago)"
        },
        toDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format (defaults to today)"
        },
        limit: {
          type: "integer",
          description: "Maximum number of calls to return (default: 10)"
        },
        page: {
          type: "integer",
          description: "Page number for pagination (default: 1)"
        },
        pageSize: {
          type: "integer",
          description: "Number of items per page (default: 10)"
        }
      }
    }
  },
  {
    name: "getCallTranscript",
    description: "Get transcript for a specific call",
    inputSchema: {
      type: "object",
      properties: {
        callId: {
          type: "string",
          description: "ID of the call"
        }
      },
      required: ["callId"]
    }
  },
  {
    name: "getUsers",
    description: "List Gong users",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of users to return"
        },
        cursor: {
          type: "string", 
          description: "Cursor for pagination"
        }
      }
    }
  },
  {
    name: "analyzeCallsWithKeyword",
    description: "Find and analyze calls containing specific keywords",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Keyword to search for in calls"
        },
        fromDate: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (defaults to 30 days ago)"
        },
        toDate: {
          type: "string",
          description: "End date in YYYY-MM-DD format (defaults to today)"
        },
        limit: {
          type: "integer",
          description: "Maximum number of calls to analyze (default: 20)"
        }
      },
      required: ["keyword"]
    }
  }
];

// List tools request handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log("Handling tools/list request");
  return { tools };
});

// Call tool request handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.log(`Handling tool call: ${request.params.name}`);
  const { name: toolName, arguments: args = {} } = request.params;

  // Check Gong credentials
  if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
    console.error("Missing Gong credentials");
    return {
      content: [
        {
          type: "text",
          text: "Error: Gong API credentials are not configured."
        }
      ]
    };
  }

  // Create Gong API client
  const gongClient = axios.create({
    baseURL: API_BASE_URL,
    auth: {
      username: process.env.GONG_ACCESS_KEY,
      password: process.env.GONG_SECRET
    }
  });

  try {
    // Process based on tool name
    switch (toolName) {
      case "getCalls": {
        // Format dates for Gong API
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const fromDate = args.fromDate || thirtyDaysAgo.toISOString().split("T")[0];
        const toDate = args.toDate || today.toISOString().split("T")[0];
        
        const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
        const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
        
        console.log(`Getting calls from ${fromDate} to ${toDate}`);

        // Call Gong API
        const response = await gongClient.post("/v2/calls/extensive", {
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

        // Format response with pagination
        const calls = response.data.calls || [];
        const limit = args.limit || 10;
        const page = args.page || 1;
        const pageSize = args.pageSize || 10;
        
        // Calculate pagination
        const totalCalls = calls.length;
        const totalPages = Math.ceil(totalCalls / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalCalls);
        
        // Get page of calls
        const paginatedCalls = calls.slice(startIndex, endIndex);
        
        const formattedCalls = paginatedCalls.map(call => ({
          id: call.metaData.id,
          title: call.metaData.title,
          date: new Date(call.metaData.startTime).toISOString().split("T")[0],
          duration: formatDuration(call.metaData.duration),
          participants: (call.metaData.participants || []).map(p => p.name).join(", ")
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dateRange: { from: fromDate, to: toDate },
                pagination: {
                  currentPage: page,
                  pageSize: pageSize,
                  totalPages: totalPages,
                  totalCalls: totalCalls,
                  hasNextPage: page < totalPages,
                  hasPreviousPage: page > 1
                },
                calls: formattedCalls
              }, null, 2)
            }
          ]
        };
      }
      
      case "getCallTranscript": {
        const { callId } = args;
        
        if (!callId) {
          return {
            content: [
              {
                type: "text",
                text: "Error: callId is required"
              }
            ]
          };
        }

        console.log(`Getting transcript for call: ${callId}`);

        // Call Gong API
        const response = await gongClient.post("/v2/calls/transcript", {
          filter: {
            callIds: [callId]
          }
        });

        const transcripts = response.data.transcripts || [];
        
        if (transcripts.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No transcript found for call ID: ${callId}`
              }
            ]
          };
        }

        // Format transcript
        const transcript = transcripts[0];
        const formattedTranscript = {
          callId,
          title: transcript.title || "Unknown",
          transcript: transcript.sentences.map(s => ({
            time: formatTime(s.startTime),
            speaker: s.speaker?.name || "Unknown",
            text: s.text
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedTranscript, null, 2)
            }
          ]
        };
      }
      
      case "getUsers": {
        const limit = args.limit || 20;
        const cursor = args.cursor || "";
        
        console.log(`Getting users (limit: ${limit}, cursor: ${cursor || "none"})`);

        // Call Gong API with cursor if provided
        const url = cursor ? `/v2/users?cursor=${cursor}` : "/v2/users";
        const response = await gongClient.get(url);

        // Format response
        const users = response.data.users || [];
        const formattedUsers = users.slice(0, limit).map(user => ({
          id: user.id,
          name: user.name,
          email: user.emailAddress,
          title: user.title || "N/A"
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                totalUsers: users.length,
                nextCursor: response.data.recordsRemaining ? response.data.cursor : null,
                hasMorePages: !!response.data.recordsRemaining,
                users: formattedUsers
              }, null, 2)
            }
          ]
        };
      }
      
      case "analyzeCallsWithKeyword": {
        const { keyword } = args;
        
        if (!keyword) {
          return {
            content: [
              {
                type: "text",
                text: "Error: keyword is required"
              }
            ]
          };
        }
        
        // Format dates for Gong API
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const fromDate = args.fromDate || thirtyDaysAgo.toISOString().split("T")[0];
        const toDate = args.toDate || today.toISOString().split("T")[0];
        
        const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
        const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
        
        console.log(`Analyzing calls with keyword "${keyword}" from ${fromDate} to ${toDate}`);

        // First get calls
        const callsResponse = await gongClient.post("/v2/calls/extensive", {
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

        const allCalls = callsResponse.data.calls || [];
        const limit = args.limit || 20;
        
        // Get transcripts for calls to search for keyword
        const callIds = allCalls.slice(0, Math.min(limit, allCalls.length)).map(call => call.metaData.id);
        
        if (callIds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  keyword,
                  dateRange: { from: fromDate, to: toDate },
                  matchingCalls: [],
                  message: "No calls found in the specified date range"
                }, null, 2)
              }
            ]
          };
        }
        
        // Get transcripts
        const transcriptResponse = await gongClient.post("/v2/calls/transcript", {
          filter: {
            callIds
          }
        });
        
        const transcripts = transcriptResponse.data.transcripts || [];
        
        // Search for keyword in transcripts
        const matchingCalls = [];
        
        transcripts.forEach(transcript => {
          const matchingSentences = transcript.sentences.filter(s => 
            s.text.toLowerCase().includes(keyword.toLowerCase())
          );
          
          if (matchingSentences.length > 0) {
            // Find the corresponding call
            const call = allCalls.find(c => c.metaData.id === transcript.callId);
            
            if (call) {
              matchingCalls.push({
                id: call.metaData.id,
                title: call.metaData.title,
                date: new Date(call.metaData.startTime).toISOString().split("T")[0],
                matchCount: matchingSentences.length,
                participants: (call.metaData.participants || []).map(p => p.name).join(", "),
                examples: matchingSentences.slice(0, 3).map(s => ({
                  time: formatTime(s.startTime),
                  speaker: s.speaker?.name || "Unknown",
                  text: s.text
                }))
              });
            }
          }
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                keyword,
                dateRange: { from: fromDate, to: toDate },
                totalCallsChecked: callIds.length,
                matchingCalls
              }, null, 2)
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Error: Unknown tool "${toolName}"`
            }
          ]
        };
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error.message);
    
    const errorMessage = error.response
      ? `Gong API Error: ${error.response.status} - ${JSON.stringify(error.response.data || {}).substring(0, 200)}`
      : `Error: ${error.message}`;
    
    return {
      content: [
        {
          type: "text",
          text: errorMessage
        }
      ]
    };
  }
});

// Helper function to format duration
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Helper function to format time
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${SERVER_NAME} MCP Server (v${SERVER_VERSION}) running on stdio, proxying API at ${API_BASE_URL}`);
    console.error("Environment:", {
      GONG_ACCESS_KEY: process.env.GONG_ACCESS_KEY ? "Set" : "Missing",
      GONG_SECRET: process.env.GONG_SECRET ? "Set" : "Missing"
    });
  } catch (error) {
    console.error("Error during server startup:", error);
    process.exit(1);
  }
}

// Handle shutdown
function cleanup() {
  console.error("Shutting down MCP server...");
  process.exit(0);
}

// Register signal handlers
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Start the server
main().catch(error => {
  console.error("Fatal error in main execution:", error);
  process.exit(1);
});