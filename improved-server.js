import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Create logs directory if it doesn't exist
const logDir = join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Improved Gong MCP Server',
    timestamp: new Date().toISOString(),
    features: ['Basic API', 'Natural Language Processing', 'AI Integration', 'Pagination', 'Logging', 'Smart Filtering', 'Context-Aware Analysis'],
    env: {
      hasGongKey: !!process.env.GONG_ACCESS_KEY,
      hasGongSecret: !!process.env.GONG_SECRET,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

// Original MCP endpoint
app.post('/api/mcp', async (req, res) => {
  const timeoutDuration = 45000; // 45 seconds
  let isComplete = false;
  
  const completeRequest = (responseData) => {
    if (isComplete) return;
    isComplete = true;
    res.json(responseData);
  };

  const completeError = (errorData) => {
    if (isComplete) return;
    isComplete = true;
    res.status(500).json(errorData);
  };

  try {
    const { method, params = {} } = req.body;
    
    console.log(`🔄 MCP Request: ${method}`, JSON.stringify(params, null, 2));
    
    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
      return completeError({
        error: 'Missing Gong credentials',
        message: 'GONG_ACCESS_KEY and GONG_SECRET environment variables are required'
      });
    }

    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: method,
      params: params
    };

    const mcpProcess = spawn('node', [join(__dirname, 'build/index.js')], {
      env: {
        ...process.env,
        GONG_ACCESS_KEY: process.env.GONG_ACCESS_KEY,
        GONG_SECRET: process.env.GONG_SECRET
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseData = '';
    let errorData = '';

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!isComplete) {
        console.log('⏰ Request timeout, killing process');
        mcpProcess.kill('SIGKILL');
        completeError({ error: 'Request timeout after 45 seconds' });
      }
    }, timeoutDuration);

    mcpProcess.stdin.write(JSON.stringify(mcpRequest) + '\n');
    mcpProcess.stdin.end();

    mcpProcess.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    mcpProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (isComplete) return;

      console.log(`✅ MCP Process completed with code: ${code}`);

      if (code === 0 && responseData) {
        try {
          const responses = responseData.trim().split('\n').filter(line => line.trim());
          
          let result = null;
          for (const response of responses) {
            try {
              const parsed = JSON.parse(response);
              if (parsed.id && (parsed.result !== undefined || parsed.error)) {
                result = parsed;
                break;
              }
            } catch (e) {
              continue;
            }
          }

          if (result) {
            console.log(`📦 Returning result for method: ${method}`);
            completeRequest(result);
          } else {
            console.log('❌ No valid MCP response found');
            completeError({ 
              error: 'No valid MCP response found',
              rawResponse: responseData.substring(0, 1000)
            });
          }
        } catch (parseError) {
          console.log('❌ Parse error:', parseError.message);
          completeError({ 
            error: 'Failed to parse MCP response',
            details: parseError.message,
            rawResponse: responseData.substring(0, 1000)
          });
        }
      } else {
        console.log('❌ Process failed or no response data');
        completeError({ 
          error: 'MCP process failed',
          code: code,
          stderr: errorData.substring(0, 500),
          stdout: responseData.substring(0, 500)
        });
      }
    });

    mcpProcess.on('error', (error) => {
      clearTimeout(timeout);
      console.log('❌ Process error:', error.message);
      completeError({ 
        error: 'Failed to spawn MCP process',
        details: error.message
      });
    });

  } catch (error) {
    console.error('❌ Server error:', error);
    completeError({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Tools list endpoint
app.get('/api/tools', async (req, res) => {
  try {
    const toolsResponse = await new Promise((resolve, reject) => {
      const mcpProcess = spawn('node', [join(__dirname, 'build/index.js')], {
        env: {
          ...process.env,
          GONG_ACCESS_KEY: process.env.GONG_ACCESS_KEY,
          GONG_SECRET: process.env.GONG_SECRET
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let responseData = '';
      
      const timeout = setTimeout(() => {
        mcpProcess.kill('SIGKILL');
        reject(new Error('Timeout'));
      }, 15000);

      mcpProcess.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      }) + '\n');
      mcpProcess.stdin.end();

      mcpProcess.stdout.on('data', (data) => {
        responseData += data.toString();
      });

      mcpProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          try {
            const responses = responseData.trim().split('\n').filter(line => line.trim());
            for (const response of responses) {
              try {
                const parsed = JSON.parse(response);
                if (parsed.result && parsed.result.tools) {
                  resolve(parsed.result.tools);
                  return;
                }
              } catch (e) {
                continue;
              }
            }
            resolve([]);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('Process failed'));
        }
      });
    });

    res.json({ 
      tools: toolsResponse,
      nlpTools: [
        {
          name: "analyzeCallsWithNlp",
          description: "Analyze Gong call data using natural language queries",
          examples: [
            "Analyze all calls with product managers",
            "Find common questions from enterprise customers",
            "Summarize objections in sales calls from last quarter",
            "Analyze all calls with Kellan and how he works with clients"
          ]
        }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tools list' });
  }
});

// Enhanced endpoint for natural language queries with improved analyzer, pagination and logging
app.post('/api/analyze', async (req, res) => {
  try {
    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
      return res.status(500).json({
        error: 'Missing Gong credentials',
        message: 'GONG_ACCESS_KEY and GONG_SECRET environment variables are required'
      });
    }
    
    const { 
      query, 
      timeRange, 
      maxCalls, 
      participants, 
      page = 1, 
      pageSize = 100, 
      cursor,
      logResults = true  // Default to logging results
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'A natural language query is required'
      });
    }
    
    console.log(`🔍 Processing NLP analysis request: "${query}" (page ${page}, size ${pageSize})`);
    
    // Log the incoming query
    const timestamp = new Date().toISOString();
    const queryLog = join(logDir, 'incoming_queries.log');
    fs.appendFileSync(queryLog, 
      `[${timestamp}] Query: "${query}" | Page: ${page} | Size: ${pageSize} | Cursor: ${cursor || 'none'}\n`
    );
    
    // Try the improved analyzer first, fall back to original if not available
    let analyzer;
    try {
      // Import dynamically to ensure we use the latest built version
      const { ImprovedAnalyzer } = await import('./build/improved-analyzer.js');
      console.log('✅ Using improved analyzer with smart name filtering and contextual responses');
      
      // Create analyzer instance
      analyzer = new ImprovedAnalyzer(
        'https://api.gong.io',
        process.env.GONG_ACCESS_KEY,
        process.env.GONG_SECRET,
        logDir
      );
    } catch (err) {
      console.log('⚠️ Improved analyzer not available, falling back to standard analyzer');
      // Fall back to the original analyzer
      const { NlpAnalyzerV2 } = await import('./build/nlp-analyzer-v2.js');
      
      // Create analyzer instance
      analyzer = new NlpAnalyzerV2(
        'https://api.gong.io',
        process.env.GONG_ACCESS_KEY,
        process.env.GONG_SECRET,
        logDir
      );
    }
    
    // Execute analysis
    const result = await analyzer.analyzeWithNlp({
      query,
      timeRange,
      maxCalls,
      participants,
      page,
      pageSize,
      cursor,
      logResults
    });
    
    // Log the query result summary
    fs.appendFileSync(queryLog, 
      `[${timestamp}] Result: Calls: ${result.callsAnalyzed}/${result.totalCallsFound} | Page: ${result.pagination.page}/${result.pagination.totalPages}\n`
    );
    
    // Create a full results file for reference
    const resultTimestamp = new Date().toISOString().replace(/:/g, '-');
    const resultFilename = join(logDir, `result_${resultTimestamp}.json`);
    fs.writeFileSync(resultFilename, JSON.stringify(result, null, 2));
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error in NLP analysis:', error);
    
    // Log the error
    const timestamp = new Date().toISOString();
    const errorLog = join(logDir, 'errors.log');
    fs.appendFileSync(errorLog, 
      `[${timestamp}] Error: ${error.message}\n${error.stack || ''}\n\n`
    );
    
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
      logLocation: logDir
    });
  }
});

// Batch analysis endpoint for large datasets
app.post('/api/analyze/batch', async (req, res) => {
  try {
    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
      return res.status(500).json({
        error: 'Missing Gong credentials',
        message: 'GONG_ACCESS_KEY and GONG_SECRET environment variables are required'
      });
    }
    
    const { 
      query, 
      timeRange, 
      maxCalls = 1000, 
      participants,
      batchSize = 100,
      logResults = true
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'A natural language query is required'
      });
    }
    
    console.log(`🔄 Processing batch analysis request: "${query}" (max: ${maxCalls}, batch: ${batchSize})`);
    
    // Create a unique job ID
    const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const jobDir = join(logDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    
    // Log the job start
    const timestamp = new Date().toISOString();
    const jobLog = join(jobDir, 'job.log');
    fs.writeFileSync(jobLog, 
      `[${timestamp}] Started batch job for query: "${query}"\n` +
      `Parameters: maxCalls=${maxCalls}, batchSize=${batchSize}\n` +
      `Time range: ${timeRange?.start || 'default'} to ${timeRange?.end || 'present'}\n`
    );
    
    // Spawn a separate process to handle the batch job
    const batchProcess = spawn('node', [join(__dirname, 'batch-processor.js')], {
      env: {
        ...process.env,
        GONG_ACCESS_KEY: process.env.GONG_ACCESS_KEY,
        GONG_SECRET: process.env.GONG_SECRET,
        JOB_ID: jobId,
        JOB_DIR: jobDir,
        QUERY: query,
        BATCH_SIZE: batchSize.toString(),
        MAX_CALLS: maxCalls.toString(),
        TIME_RANGE_START: timeRange?.start || '',
        TIME_RANGE_END: timeRange?.end || '',
        PARTICIPANTS: participants ? JSON.stringify(participants) : ''
      },
      detached: true,
      stdio: 'ignore'
    });
    
    // Let the process run independently
    batchProcess.unref();
    
    // Return the job ID
    res.json({
      status: 'started',
      jobId: jobId,
      message: 'Batch analysis job started successfully',
      maxCalls: maxCalls,
      batchSize: batchSize,
      checkStatusAt: `/api/analyze/batch/${jobId}/status`,
      jobDir: jobDir
    });
  } catch (error) {
    console.error('❌ Error starting batch analysis:', error);
    
    res.status(500).json({
      error: 'Failed to start batch analysis',
      message: error.message
    });
  }
});

// Batch job status endpoint
app.get('/api/analyze/batch/:jobId/status', (req, res) => {
  try {
    const { jobId } = req.params;
    const jobDir = join(logDir, jobId);
    
    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No batch job found with ID ${jobId}`
      });
    }
    
    const jobLog = join(jobDir, 'job.log');
    const statusFile = join(jobDir, 'status.json');
    
    if (fs.existsSync(statusFile)) {
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      res.json(status);
    } else {
      // Job is still initializing
      res.json({
        status: 'initializing',
        jobId: jobId,
        message: 'Batch job is initializing',
        progress: 0
      });
    }
  } catch (error) {
    console.error('❌ Error checking batch status:', error);
    
    res.status(500).json({
      error: 'Failed to check batch status',
      message: error.message
    });
  }
});

// Direct AI integration endpoint
app.post('/api/ai/query', async (req, res) => {
  try {
    if (!process.env.GONG_ACCESS_KEY || !process.env.GONG_SECRET) {
      return res.status(500).json({
        error: 'Missing Gong credentials',
        message: 'GONG_ACCESS_KEY and GONG_SECRET environment variables are required'
      });
    }
    
    const { query, context, page = 1, pageSize = 100 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'A query is required'
      });
    }
    
    console.log(`🧠 Processing AI query: "${query}"`);
    
    // Log AI query
    const timestamp = new Date().toISOString();
    const aiQueryLog = join(logDir, 'ai_queries.log');
    fs.appendFileSync(aiQueryLog, 
      `[${timestamp}] AI Query: "${query}"\n`
    );
    
    // This is where you would integrate with a specific AI model like Claude
    // For now we'll return a mock response
    
    const response = {
      query,
      page,
      pageSize,
      response: "This is a placeholder for AI integration. In a production environment, this would connect to Claude or another AI model to process your query: " + query,
      timestamp: new Date().toISOString(),
      pagination: {
        currentPage: page,
        totalPages: 1,
        hasMore: false
      }
    };
    
    // Log the response
    fs.appendFileSync(aiQueryLog, 
      `[${timestamp}] AI Response: Placeholder response generated\n\n`
    );
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error in AI query:', error);
    
    // Log the error
    const timestamp = new Date().toISOString();
    const errorLog = join(logDir, 'errors.log');
    fs.appendFileSync(errorLog, 
      `[${timestamp}] AI Error: ${error.message}\n${error.stack || ''}\n\n`
    );
    
    res.status(500).json({
      error: 'Query failed',
      message: error.message
    });
  }
});

// Add an endpoint to download logs
app.get('/api/logs/:logName', (req, res) => {
  try {
    const { logName } = req.params;
    
    // Security check - only allow specific log files
    const allowedLogs = ['info', 'error', 'incoming_queries', 'ai_queries'];
    const baseName = logName.split('.')[0];
    
    if (!allowedLogs.some(log => logName.startsWith(log)) && 
        !logName.startsWith('result_') && 
        !logName.startsWith('analysis_')) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access to this log file is not allowed'
      });
    }
    
    const logPath = join(logDir, logName);
    
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Log file not found'
      });
    }
    
    res.download(logPath);
  } catch (error) {
    console.error('❌ Error accessing log:', error);
    res.status(500).json({
      error: 'Log access failed',
      message: error.message
    });
  }
});

// Add an endpoint to list available logs
app.get('/api/logs', (req, res) => {
  try {
    const logs = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log') || file.endsWith('.json'))
      .map(file => {
        const stats = fs.statSync(join(logDir, file));
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
    
    res.json({ logs });
  } catch (error) {
    console.error('❌ Error listing logs:', error);
    res.status(500).json({
      error: 'Failed to list logs',
      message: error.message
    });
  }
});

// Create a simple batch processor script
const batchProcessorScript = `
import { ImprovedAnalyzer } from './build/improved-analyzer.js';
import fs from 'fs';
import path from 'path';

async function runBatchJob() {
  const jobId = process.env.JOB_ID;
  const jobDir = process.env.JOB_DIR;
  const query = process.env.QUERY;
  const batchSize = parseInt(process.env.BATCH_SIZE || '100', 10);
  const maxCalls = parseInt(process.env.MAX_CALLS || '1000', 10);
  
  const timeRange = {
    start: process.env.TIME_RANGE_START || undefined,
    end: process.env.TIME_RANGE_END || undefined
  };
  
  const participants = process.env.PARTICIPANTS ? 
    JSON.parse(process.env.PARTICIPANTS) : 
    undefined;
  
  // Initialize status
  const statusFile = path.join(jobDir, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'running',
    jobId,
    progress: 0,
    processedCalls: 0,
    totalCallsProcessed: 0,
    batchesCompleted: 0,
    startTime: new Date().toISOString(),
    estimatedCompletionTime: null
  }));
  
  // Create analyzer
  const analyzer = new ImprovedAnalyzer(
    'https://api.gong.io',
    process.env.GONG_ACCESS_KEY,
    process.env.GONG_SECRET,
    jobDir
  );
  
  // Process batches
  const batches = Math.ceil(maxCalls / batchSize);
  let totalCallsProcessed = 0;
  let allResults = [];
  
  for (let batch = 1; batch <= batches; batch++) {
    // Update status
    const progress = Math.floor((batch - 1) * 100 / batches);
    fs.writeFileSync(statusFile, JSON.stringify({
      status: 'running',
      jobId,
      progress,
      processedCalls: totalCallsProcessed,
      totalBatches: batches,
      batchesCompleted: batch - 1,
      startTime: new Date().toISOString(),
      estimatedCompletionTime: null
    }));
    
    // Process batch
    try {
      const result = await analyzer.analyzeWithNlp({
        query,
        timeRange,
        participants,
        page: batch,
        pageSize: batchSize,
        logResults: true
      });
      
      // Save batch result
      const batchResultFile = path.join(jobDir, \`batch_\${batch}.json\`);
      fs.writeFileSync(batchResultFile, JSON.stringify(result, null, 2));
      
      // Update counts
      totalCallsProcessed += result.callsAnalyzed;
      allResults.push(result);
      
      // Check if we've reached the end
      if (!result.pagination.hasMore) {
        break;
      }
    } catch (error) {
      // Log error and continue
      const errorLog = path.join(jobDir, 'errors.log');
      fs.appendFileSync(errorLog, 
        \`[\${new Date().toISOString()}] Batch \${batch} error: \${error.message}\\n\${error.stack || ''}\\n\\n\`
      );
    }
  }
  
  // Combine results
  const combinedResults = {
    query,
    callsAnalyzed: totalCallsProcessed,
    batches: batches,
    results: allResults,
    completionTime: new Date().toISOString()
  };
  
  // Save final result
  const finalResultFile = path.join(jobDir, 'final_result.json');
  fs.writeFileSync(finalResultFile, JSON.stringify(combinedResults, null, 2));
  
  // Update status to complete
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'completed',
    jobId,
    progress: 100,
    processedCalls: totalCallsProcessed,
    totalBatches: batches,
    batchesCompleted: batches,
    startTime: new Date().toISOString(),
    completionTime: new Date().toISOString(),
    resultFile: finalResultFile
  }));
}

// Run the job
runBatchJob().catch(error => {
  // Log fatal error
  const jobDir = process.env.JOB_DIR;
  const statusFile = path.join(jobDir, 'status.json');
  const errorLog = path.join(jobDir, 'errors.log');
  
  fs.appendFileSync(errorLog, 
    \`[\${new Date().toISOString()}] Fatal error: \${error.message}\\n\${error.stack || ''}\\n\\n\`
  );
  
  // Update status to failed
  fs.writeFileSync(statusFile, JSON.stringify({
    status: 'failed',
    jobId: process.env.JOB_ID,
    error: error.message,
    errorTime: new Date().toISOString()
  }));
});
`;

// Write the batch processor script
fs.writeFileSync(join(__dirname, 'batch-processor.js'), batchProcessorScript);

// Add scripts to package.json
const packageJsonPath = join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.scripts) {
      packageJson.scripts['start:improved'] = 'node improved-server.js';
    }
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  } catch (error) {
    console.error('Failed to update package.json:', error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Improved Gong MCP Server running on port ${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/health`);
  console.log(`🔧 MCP API: http://localhost:${PORT}/api/mcp`);
  console.log(`🔍 NLP API: http://localhost:${PORT}/api/analyze`);
  console.log(`📊 Batch Analysis: http://localhost:${PORT}/api/analyze/batch`);
  console.log(`🧠 AI API: http://localhost:${PORT}/api/ai/query`);
  console.log(`📚 Logs: http://localhost:${PORT}/api/logs`);
  console.log(`📝 Tools: http://localhost:${PORT}/api/tools`);
  console.log('\n🔐 Environment:');
  console.log(`   GONG_ACCESS_KEY: ${process.env.GONG_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GONG_SECRET: ${process.env.GONG_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   LOG_DIR: ${logDir}`);
});