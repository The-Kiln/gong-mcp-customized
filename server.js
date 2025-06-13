import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Gong MCP Server',
    timestamp: new Date().toISOString(),
    env: {
      hasGongKey: !!process.env.GONG_ACCESS_KEY,
      hasGongSecret: !!process.env.GONG_SECRET,
      nodeEnv: process.env.NODE_ENV
    }
  });
});

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

    res.json({ tools: toolsResponse });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tools list' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gong MCP HTTP Server running on port ${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/health`);
  console.log(`🔧 MCP API: http://localhost:${PORT}/api/mcp`);
  console.log(`📝 Tools: http://localhost:${PORT}/api/tools`);
  console.log('\n🔐 Environment:');
  console.log(`   GONG_ACCESS_KEY: ${process.env.GONG_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   GONG_SECRET: ${process.env.GONG_SECRET ? '✅ Set' : '❌ Missing'}`);
});