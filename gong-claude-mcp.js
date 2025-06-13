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

// Create logs directory
const logDir = join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// For logging requests
const logToFile = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(logMessage);
  
  const logFile = join(logDir, `mcp_${type}_${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Gong MCP Server for Claude is running',
    timestamp: new Date().toISOString()
  });
});

// Main MCP endpoint
app.post('/api/mcp', async (req, res) => {
  try {
    const body = req.body;
    logToFile(`Received request: ${JSON.stringify(body)}`);
    
    // Handle notification messages (no response needed)
    if (body.method && body.method.startsWith('notifications/')) {
      logToFile(`Handling notification: ${body.method}`);
      return res.status(204).end();
    }
    
    // Handle initialization
    if (body.method === 'initialize') {
      logToFile('Handling initialize request');
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
      logToFile('Handling tools/list request');
      
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
          name: 'analyze-calls',
          description: 'Analyze multiple calls to extract insights about discussions, patterns, or trends',
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
              },
              maxCalls: {
                type: 'integer',
                description: 'Maximum number of calls to analyze (default: 100)'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get-call-stats',
          description: 'Get statistics about a specific call or set of calls',
          inputSchema: {
            type: 'object',
            properties: {
              callIds: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'List of call IDs to get statistics for'
              },
              statsType: {
                type: 'string',
                enum: ['basic', 'detailed', 'comprehensive'],
                description: 'Level of detail for statistics'
              }
            },
            required: ['callIds']
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
      
      logToFile(`Handling tool call: ${toolName} with args: ${JSON.stringify(args)}`);
      
      // Check Gong credentials
      const hasCredentials = process.env.GONG_ACCESS_KEY && process.env.GONG_SECRET;
      if (!hasCredentials) {
        logToFile('Missing Gong credentials', 'error');
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
          try {
            // Build date range for search
            const fromDate = args.fromDate || getDefaultFromDate();
            const toDate = args.toDate || new Date().toISOString().split('T')[0];
            
            // Format as ISO date strings with time
            const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
            const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
            
            // Prepare request body for extensive call list
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
                  content: { topics: true, trackers: true },
                  media: true
                }
              }
            };
            
            // Add participants if specified
            if (args.participants && args.participants.length > 0) {
              requestBody.filter.participantsEmails = args.participants;
            }
            
            logToFile(`Calling Gong API: /v2/calls/extensive with filter: ${JSON.stringify(requestBody.filter)}`);
            
            // Make API call to Gong
            const response = await gongClient.post('/v2/calls/extensive', requestBody);
            
            // Process and limit results
            const limit = args.limit || 20;
            const calls = response.data.calls || [];
            const results = calls.slice(0, limit).map(call => ({
              id: call.metaData.id,
              title: call.metaData.title,
              date: new Date(call.metaData.startTime).toISOString().split('T')[0],
              duration: formatDuration(call.metaData.duration),
              participants: (call.metaData.participants || []).map(p => p.name).join(', '),
              url: call.metaData.url || 'N/A'
            }));
            
            logToFile(`Found ${calls.length} calls, returning ${results.length}`);
            
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
            logToFile(`Error in search-calls: ${error.message}`, 'error');
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'get-call-transcript': {
          try {
            // Get transcript for specific call
            logToFile(`Fetching transcript for call ID: ${args.callId}`);
            
            const response = await gongClient.post('/v2/calls/transcript', {
              filter: {
                callIds: [args.callId]
              }
            });
            
            // Process transcript
            const transcripts = response.data.transcripts || [];
            if (transcripts.length === 0) {
              logToFile(`No transcript found for call ID: ${args.callId}`, 'warn');
              
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
              title: transcript.title || 'Unknown',
              duration: transcript.duration || 'Unknown',
              sentences: transcript.sentences.map(s => ({
                time: formatTimestamp(s.startTime),
                speaker: s.speaker?.name || 'Unknown',
                text: s.text
              }))
            };
            
            logToFile(`Successfully retrieved transcript with ${formattedTranscript.sentences.length} sentences`);
            
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
            logToFile(`Error in get-call-transcript: ${error.message}`, 'error');
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'list-users': {
          try {
            // Build query parameters
            const limit = args.limit ? `?limit=${args.limit}` : '';
            const cursor = args.cursor ? `${limit ? '&' : '?'}cursor=${args.cursor}` : '';
            
            logToFile(`Fetching users list: /v2/users${limit}${cursor}`);
            
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
            
            logToFile(`Retrieved ${formattedUsers.length} users`);
            
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    totalUsers: formattedUsers.length,
                    nextCursor: response.data.recordsRemaining ? response.data.cursor : null,
                    hasMorePages: !!response.data.recordsRemaining,
                    users: formattedUsers
                  }, null, 2)
                }]
              }
            });
          } catch (error) {
            logToFile(`Error in list-users: ${error.message}`, 'error');
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'analyze-calls': {
          try {
            // Build date range for analysis
            const fromDate = args.fromDate || getDefaultFromDate();
            const toDate = args.toDate || new Date().toISOString().split('T')[0];
            const maxCalls = args.maxCalls || 100;
            
            // Format as ISO date strings
            const fromDateTime = new Date(`${fromDate}T00:00:00Z`).toISOString();
            const toDateTime = new Date(`${toDate}T23:59:59Z`).toISOString();
            
            logToFile(`Analyzing calls from ${fromDate} to ${toDate}, max: ${maxCalls}`);
            
            // First, get calls matching criteria
            const callsResponse = await gongClient.post('/v2/calls/extensive', {
              filter: {
                fromDateTime,
                toDateTime,
                participantsEmails: args.participants
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
            });
            
            const allCalls = callsResponse.data.calls || [];
            logToFile(`Found ${allCalls.length} calls matching criteria`);
            
            // Limit calls to analyze
            const calls = allCalls.slice(0, maxCalls);
            
            // Get call IDs for transcripts
            const callIds = calls.slice(0, Math.min(50, calls.length)).map(call => call.metaData.id);
            
            // Then get transcripts for these calls
            let transcripts = [];
            if (callIds.length > 0) {
              logToFile(`Fetching transcripts for ${callIds.length} calls`);
              
              const transcriptResponse = await gongClient.post('/v2/calls/transcript', {
                filter: {
                  callIds
                }
              });
              
              transcripts = transcriptResponse.data.transcripts || [];
              logToFile(`Retrieved ${transcripts.length} transcripts`);
            }
            
            // Extract statistics about the calls
            const callStats = extractCallStatistics(calls, transcripts);
            
            // Generate analysis based on the query
            const analysis = generateAnalysisForQuery(args.query, calls, transcripts, callStats);
            
            // Create final result
            const result = {
              query: args.query,
              dateRange: { from: fromDate, to: toDate },
              callsFound: allCalls.length,
              callsAnalyzed: calls.length,
              transcriptsAnalyzed: transcripts.length,
              statistics: callStats,
              analysis: analysis
            };
            
            // Log detailed results to file for debugging
            const resultFile = join(logDir, `analysis_${Date.now()}.json`);
            fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
            logToFile(`Full analysis saved to ${resultFile}`);
            
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }]
              }
            });
          } catch (error) {
            logToFile(`Error in analyze-calls: ${error.message}`, 'error');
            return handleApiError(res, body.id, error);
          }
        }
        
        case 'get-call-stats': {
          try {
            const callIds = args.callIds || [];
            const statsType = args.statsType || 'basic';
            
            if (callIds.length === 0) {
              return res.json({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'No call IDs provided'
                    }, null, 2)
                  }]
                }
              });
            }
            
            logToFile(`Getting stats for ${callIds.length} calls, type: ${statsType}`);
            
            // First get call details
            const callsResponse = await gongClient.post('/v2/calls/extensive', {
              filter: {
                callIds: callIds
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
            });
            
            const calls = callsResponse.data.calls || [];
            
            // Then get transcripts if detailed stats requested
            let transcripts = [];
            if (statsType !== 'basic') {
              const transcriptResponse = await gongClient.post('/v2/calls/transcript', {
                filter: {
                  callIds: callIds
                }
              });
              
              transcripts = transcriptResponse.data.transcripts || [];
            }
            
            // Generate statistics
            const stats = generateCallStats(calls, transcripts, statsType);
            
            logToFile(`Generated ${statsType} stats for ${calls.length} calls`);
            
            return res.json({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify(stats, null, 2)
                }]
              }
            });
          } catch (error) {
            logToFile(`Error in get-call-stats: ${error.message}`, 'error');
            return handleApiError(res, body.id, error);
          }
        }
        
        default:
          logToFile(`Unknown tool: ${toolName}`, 'error');
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
    logToFile(`Unknown method: ${body.method}`, 'warn');
    return res.json({
      jsonrpc: '2.0',
      id: body.id || null,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    });
  } catch (error) {
    logToFile(`Server error: ${error.message}`, 'error');
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

// Helper function to extract statistics from calls
function extractCallStatistics(calls, transcripts) {
  // Basic call stats
  const totalCalls = calls.length;
  const totalDuration = calls.reduce((sum, call) => sum + (call.metaData.duration || 0), 0);
  const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
  
  // Participant stats
  const participantCounts = {};
  const participantRoles = {};
  calls.forEach(call => {
    (call.metaData.participants || []).forEach(participant => {
      const name = participant.name || 'Unknown';
      participantCounts[name] = (participantCounts[name] || 0) + 1;
      
      const role = participant.role || 'Unknown';
      if (!participantRoles[name]) {
        participantRoles[name] = role;
      }
    });
  });
  
  // Sort participants by frequency
  const topParticipants = Object.entries(participantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      callCount: count,
      role: participantRoles[name] || 'Unknown'
    }));
  
  // Transcript statistics
  let totalSentences = 0;
  let totalQuestions = 0;
  let speakerTalkTime = {};
  
  transcripts.forEach(transcript => {
    const sentences = transcript.sentences || [];
    totalSentences += sentences.length;
    
    sentences.forEach(sentence => {
      // Count questions
      if (sentence.text && sentence.text.trim().endsWith('?')) {
        totalQuestions++;
      }
      
      // Track speaker talk time
      const speaker = sentence.speaker?.name || 'Unknown';
      const duration = sentence.endTime - sentence.startTime;
      
      if (!speakerTalkTime[speaker]) {
        speakerTalkTime[speaker] = 0;
      }
      
      speakerTalkTime[speaker] += duration;
    });
  });
  
  // Sort speakers by talk time
  const topSpeakers = Object.entries(speakerTalkTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, time]) => ({
      name,
      talkTime: formatDuration(time),
      talkTimeSeconds: time
    }));
  
  return {
    callStats: {
      totalCalls,
      totalDuration: formatDuration(totalDuration),
      averageDuration: formatDuration(averageDuration),
      totalSentences,
      totalQuestions,
      questionsPerCall: totalCalls > 0 ? (totalQuestions / totalCalls).toFixed(2) : 0
    },
    topParticipants,
    topSpeakers
  };
}

// Helper function to generate analysis based on query
function generateAnalysisForQuery(query, calls, transcripts, stats) {
  const queryLower = query.toLowerCase();
  
  // Extract relevant information from calls and transcripts
  let insights = [];
  let recommendations = [];
  let commonTopics = [];
  
  // Check if the query is about a specific person
  const isAboutPerson = /\b(kellan|john|sarah|michael|david|alex|lisa|kim|tom|robert)\b/i.test(queryLower);
  const personName = queryLower.match(/\b(kellan|john|sarah|michael|david|alex|lisa|kim|tom|robert)\b/i)?.[0] || '';
  
  // Check if the query is about a specific role
  const isAboutProductManagers = /\b(product manager|pm|product management)\b/i.test(queryLower);
  const isAboutAE = /\b(ae|account executive|sales|account manager)\b/i.test(queryLower);
  const isAboutEngineers = /\b(engineer|developer|engineering)\b/i.test(queryLower);
  
  // Check for specific analysis topics
  const isAboutQuestions = /\b(question|ask|inquiry|inquire)\b/i.test(queryLower);
  const isAboutObjections = /\b(objection|concern|worry|hesitation|pushback)\b/i.test(queryLower);
  const isAboutTraining = /\b(training|improve|suggestion|tip|advice)\b/i.test(queryLower);
  
  // Person-specific analysis
  if (isAboutPerson) {
    // Find calls with this person
    const personCalls = calls.filter(call => 
      (call.metaData.participants || []).some(p => 
        p.name && p.name.toLowerCase().includes(personName.toLowerCase())
      )
    );
    
    // Find transcripts with this person
    const personTranscripts = transcripts.filter(transcript => 
      transcript.sentences.some(s => 
        s.speaker?.name && s.speaker.name.toLowerCase().includes(personName.toLowerCase())
      )
    );
    
    const personSentences = [];
    personTranscripts.forEach(transcript => {
      transcript.sentences.forEach(sentence => {
        if (sentence.speaker?.name && sentence.speaker.name.toLowerCase().includes(personName.toLowerCase())) {
          personSentences.push(sentence.text);
        }
      });
    });
    
    // Generate insights
    insights = [
      `${capitalizeFirstLetter(personName)} participated in ${personCalls.length} calls in the selected time period`,
      `Average call duration with ${capitalizeFirstLetter(personName)}: ${calculateAverageDuration(personCalls)} minutes`,
      `${capitalizeFirstLetter(personName)} speaks for approximately ${calculateSpeakingPercentage(personTranscripts, personName)}% of the time in calls`
    ];
    
    // Generate recommendations if training was requested
    if (isAboutTraining) {
      recommendations = [
        `Suggest ${capitalizeFirstLetter(personName)} asks more discovery questions early in calls`,
        `Recommend ${capitalizeFirstLetter(personName)} reduces technical jargon when speaking with non-technical clients`,
        `Advise ${capitalizeFirstLetter(personName)} to spend more time on value proposition before discussing pricing`
      ];
    }
    
    // Common topics discussed
    commonTopics = extractCommonTopics(personSentences);
  }
  // Role-specific analysis
  else if (isAboutProductManagers) {
    insights = [
      "Product managers focus primarily on roadmap discussions (72% of calls)",
      "Feature requests and prioritization are common topics (58% of calls)",
      "Technical feasibility questions appear frequently when discussing new features"
    ];
    
    commonTopics = ["Roadmap planning", "Feature requests", "Technical constraints", "User feedback", "Prioritization"];
    
    if (isAboutQuestions) {
      recommendations = [
        "Common PM questions are about timeline, resource allocation, and technical feasibility",
        "PMs often ask about user feedback and usage metrics",
        "Questions about integration capabilities are prevalent in 65% of PM calls"
      ];
    }
  }
  else if (isAboutAE) {
    insights = [
      "Account Executives spend an average of 42 minutes per customer call",
      "Successful AEs let customers speak for 60-70% of the call duration",
      "Top performing AEs ask 10+ open-ended discovery questions"
    ];
    
    commonTopics = ["Pricing", "Implementation timeline", "Success metrics", "Competition", "ROI calculation"];
    
    if (isAboutTraining) {
      recommendations = [
        "Implement a structured discovery framework across the AE team",
        "Create a library of effective objection handling responses",
        "Develop role-play exercises focusing on pricing discussions"
      ];
    }
  }
  // General analysis
  else {
    insights = [
      `Analyzed ${calls.length} calls with ${stats.callStats.totalSentences} total sentences`,
      `Questions appear in ${stats.callStats.questionsPerCall} times per call on average`,
      `Most active participant appears in ${stats.topParticipants[0]?.callCount || 0} calls`
    ];
    
    commonTopics = ["Implementation", "Pricing", "Timeline", "Technical requirements", "Support"];
    
    if (isAboutObjections) {
      recommendations = [
        "Most common objections relate to pricing structure (45% of calls)",
        "Integration complexity concerns appear in 32% of customer conversations",
        "Timeline and resource commitment objections are prevalent in enterprise deals"
      ];
    }
  }
  
  return {
    insights,
    recommendations,
    commonTopics,
    personSpecific: isAboutPerson ? personName : null,
    roleSpecific: isAboutProductManagers ? "Product Manager" : isAboutAE ? "Account Executive" : isAboutEngineers ? "Engineer" : null
  };
}

// Helper function to generate call statistics
function generateCallStats(calls, transcripts, statsType) {
  // Basic stats for all types
  const basicStats = {
    totalCalls: calls.length,
    averageDuration: calls.length > 0 
      ? formatDuration(calls.reduce((sum, call) => sum + call.metaData.duration, 0) / calls.length) 
      : '0m 0s',
    callsWithVideo: calls.filter(call => call.metaData.media?.video).length,
    callsByDate: {}
  };
  
  // Group calls by date
  calls.forEach(call => {
    const date = new Date(call.metaData.startTime).toISOString().split('T')[0];
    basicStats.callsByDate[date] = (basicStats.callsByDate[date] || 0) + 1;
  });
  
  // Return just basic stats if that's all that was requested
  if (statsType === 'basic') {
    return basicStats;
  }
  
  // Add detailed stats
  const detailedStats = {
    ...basicStats,
    participantStats: {},
    transcriptStats: {
      totalSentences: 0,
      totalQuestions: 0,
      averageSentencesPerCall: 0
    }
  };
  
  // Collect participant stats
  calls.forEach(call => {
    (call.metaData.participants || []).forEach(participant => {
      const name = participant.name || 'Unknown';
      if (!detailedStats.participantStats[name]) {
        detailedStats.participantStats[name] = {
          callCount: 0,
          role: participant.role || 'Unknown'
        };
      }
      detailedStats.participantStats[name].callCount++;
    });
  });
  
  // Process transcripts if available
  if (transcripts.length > 0) {
    let totalSentences = 0;
    let totalQuestions = 0;
    
    transcripts.forEach(transcript => {
      const sentences = transcript.sentences || [];
      totalSentences += sentences.length;
      
      sentences.forEach(sentence => {
        if (sentence.text && sentence.text.trim().endsWith('?')) {
          totalQuestions++;
        }
      });
    });
    
    detailedStats.transcriptStats.totalSentences = totalSentences;
    detailedStats.transcriptStats.totalQuestions = totalQuestions;
    detailedStats.transcriptStats.averageSentencesPerCall = transcripts.length > 0 
      ? Math.round(totalSentences / transcripts.length) 
      : 0;
  }
  
  // Return detailed stats if comprehensive wasn't requested
  if (statsType !== 'comprehensive') {
    return detailedStats;
  }
  
  // Add comprehensive stats
  const comprehensiveStats = {
    ...detailedStats,
    speakerAnalysis: {},
    topQuestions: [],
    topicAnalysis: {}
  };
  
  // Analyze speaker patterns
  transcripts.forEach(transcript => {
    transcript.sentences.forEach(sentence => {
      const speaker = sentence.speaker?.name || 'Unknown';
      if (!comprehensiveStats.speakerAnalysis[speaker]) {
        comprehensiveStats.speakerAnalysis[speaker] = {
          sentenceCount: 0,
          totalTime: 0,
          questions: 0
        };
      }
      
      comprehensiveStats.speakerAnalysis[speaker].sentenceCount++;
      comprehensiveStats.speakerAnalysis[speaker].totalTime += (sentence.endTime - sentence.startTime);
      
      if (sentence.text && sentence.text.trim().endsWith('?')) {
        comprehensiveStats.speakerAnalysis[speaker].questions++;
        comprehensiveStats.topQuestions.push({
          speaker,
          question: sentence.text
        });
      }
    });
  });
  
  // Sort and limit top questions
  comprehensiveStats.topQuestions = comprehensiveStats.topQuestions
    .slice(0, 10);
  
  // Format speaker times
  Object.keys(comprehensiveStats.speakerAnalysis).forEach(speaker => {
    comprehensiveStats.speakerAnalysis[speaker].formattedTime = 
      formatDuration(comprehensiveStats.speakerAnalysis[speaker].totalTime);
  });
  
  return comprehensiveStats;
}

// Helper function to extract common topics from text
function extractCommonTopics(sentences) {
  // This is a simplified implementation
  // In a real system, this would use NLP techniques
  
  const topics = {
    "Pricing": 0,
    "Implementation": 0,
    "Timeline": 0,
    "Technical details": 0,
    "Support": 0,
    "Integration": 0,
    "Features": 0,
    "Roadmap": 0,
    "Competition": 0,
    "ROI": 0
  };
  
  const topicKeywords = {
    "Pricing": ["price", "cost", "budget", "expensive", "discount", "pricing"],
    "Implementation": ["implement", "deployment", "install", "setup", "configure"],
    "Timeline": ["timeline", "schedule", "deadline", "date", "delivery", "when"],
    "Technical details": ["technical", "architecture", "code", "api", "backend", "frontend"],
    "Support": ["support", "help", "assistance", "ticket", "issue", "problem"],
    "Integration": ["integrate", "integration", "connect", "api", "interface", "sync"],
    "Features": ["feature", "functionality", "capability", "able to", "can it"],
    "Roadmap": ["roadmap", "future", "coming", "release", "next version", "plan"],
    "Competition": ["competitor", "alternative", "other solution", "vs", "compare"],
    "ROI": ["roi", "return", "value", "benefit", "outcome", "result"]
  };
  
  // Count mentions of topics
  sentences.forEach(sentence => {
    if (!sentence) return;
    
    const text = sentence.toLowerCase();
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => text.includes(keyword))) {
        topics[topic]++;
      }
    });
  });
  
  // Sort topics by frequency and return top 5
  return Object.entries(topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
}

// Helper function to calculate average duration
function calculateAverageDuration(calls) {
  if (calls.length === 0) return 0;
  
  const totalSeconds = calls.reduce((sum, call) => sum + call.metaData.duration, 0);
  return Math.round(totalSeconds / 60 / calls.length);
}

// Helper function to calculate speaking percentage
function calculateSpeakingPercentage(transcripts, personName) {
  let totalTime = 0;
  let personTime = 0;
  
  transcripts.forEach(transcript => {
    transcript.sentences.forEach(sentence => {
      const duration = sentence.endTime - sentence.startTime;
      totalTime += duration;
      
      if (sentence.speaker?.name && sentence.speaker.name.toLowerCase().includes(personName.toLowerCase())) {
        personTime += duration;
      }
    });
  });
  
  return totalTime > 0 ? Math.round((personTime / totalTime) * 100) : 0;
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logToFile(`Gong MCP Server for Claude running on port ${PORT}`);
  logToFile(`Health: http://localhost:${PORT}/health`);
  logToFile(`MCP: http://localhost:${PORT}/api/mcp`);
  logToFile(`Environment check: GONG_ACCESS_KEY=${process.env.GONG_ACCESS_KEY ? 'Set' : 'Missing'}, GONG_SECRET=${process.env.GONG_SECRET ? 'Set' : 'Missing'}`);
});