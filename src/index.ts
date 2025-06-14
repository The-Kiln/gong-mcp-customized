#!/usr/bin/env node
/**
 * MCP Server generated from OpenAPI spec for gong-api--subset- v1.2.0
 * Generated on: 2025-05-01T16:44:26.562Z
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
  type CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";

import { z, ZodError } from 'zod';
import { jsonSchemaToZod } from 'json-schema-to-zod';
import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';

/**
 * Type definition for JSON objects
 */
type JsonObject = Record<string, any>;

/**
 * Interface for MCP Tool Definition
 */
interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: any;
    method: string;
    pathTemplate: string;
    executionParameters: { name: string, in: string }[];
    requestBodyContentType?: string;
    securityRequirements: any[];
}

/**
 * Server configuration
 */
export const SERVER_NAME = "gong-api--subset-";
export const SERVER_VERSION = "1.2.0";
export const API_BASE_URL = "https://api.gong.io";

/**
 * MCP Server instance
 */
const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
);

/**
 * Map of tool definitions by name
 */
const toolDefinitionMap: Map<string, McpToolDefinition> = new Map([

  ["getv2callsbyid", {
    name: "getv2callsbyid",
    description: `Retrieve a single call`,
    inputSchema: {"type":"object","properties":{"id":{"type":"string"}},"required":["id"]},
    method: "get",
    pathTemplate: "/v2/calls/{id}",
    executionParameters: [{"name":"id","in":"path"}],
    requestBodyContentType: undefined,
    securityRequirements: [{"basicAuth":[]}]
  }],
  ["postv2callsextensive", {
    name: "postv2callsextensive",
    description: `Filtered call list with rich payload`,
    inputSchema: {"type":"object","properties":{"requestBody":{"type":"object","required":["filter"],"properties":{"filter":{"type":"object","properties":{"fromDateTime":{"type":"string","format":"date-time"},"toDateTime":{"type":"string","format":"date-time"},"callIds":{"type":"array","items":{"type":"string"}},"primaryUserIds":{"type":"array","items":{"type":"string"}},"participantsEmails":{"type":"array","items":{"type":"string","format":"email"}}}},"contentSelector":{"type":"object","properties":{"context":{"type":"string","enum":["None","Extended"]},"contextTiming":{"type":"array","items":{"type":"string","enum":["Now","TimeOfCall"]}},"exposedFields":{"type":"object","additionalProperties":{"type":"object"}}}},"cursor":{"type":"string"}},"description":"The JSON request body."}, "paginate":{"type":"boolean","description":"Whether to automatically fetch all pages"}},"required":["requestBody"]},
    method: "post",
    pathTemplate: "/v2/calls/extensive",
    executionParameters: [],
    requestBodyContentType: "application/json",
    securityRequirements: [{"basicAuth":[]}]
  }],
  ["postv2callstranscript", {
    name: "postv2callstranscript",
    description: `Download transcripts`,
    inputSchema: {"type":"object","properties":{"requestBody":{"type":"object","required":["filter"],"properties":{"filter":{"type":"object","properties":{"fromDateTime":{"type":"string","format":"date-time"},"toDateTime":{"type":"string","format":"date-time"},"callIds":{"type":"array","items":{"type":"string"}},"primaryUserIds":{"type":"array","items":{"type":"string"}},"participantsEmails":{"type":"array","items":{"type":"string","format":"email"}}}},"cursor":{"type":"string"}},"description":"The JSON request body."}, "paginate":{"type":"boolean","description":"Whether to automatically fetch all pages"}},"required":["requestBody"]},
    method: "post",
    pathTemplate: "/v2/calls/transcript",
    executionParameters: [],
    requestBodyContentType: "application/json",
    securityRequirements: [{"basicAuth":[]}]
  }],
  ["getv2users", {
    name: "getv2users",
    description: `List Gong users (100-row pages)`,
    inputSchema: {"type":"object","properties":{"cursor":{"type":"string"}, "paginate":{"type":"boolean","description":"Whether to automatically fetch all pages"}}},
    method: "get",
    pathTemplate: "/v2/users",
    executionParameters: [{"name":"cursor","in":"query"}],
    requestBodyContentType: undefined,
    securityRequirements: [{"basicAuth":[]}]
  }],
  ["getv2dataprivacydataforemailaddress", {
    name: "getv2dataprivacydataforemailaddress",
    description: `Activities for an email address (GDPR helper)`,
    inputSchema: {"type":"object","properties":{"emailAddress":{"type":"string","format":"email"},"cursor":{"type":"string"}, "paginate":{"type":"boolean","description":"Whether to automatically fetch all pages"}},"required":["emailAddress"]},
    method: "get",
    pathTemplate: "/v2/data-privacy/data-for-email-address",
    executionParameters: [{"name":"emailAddress","in":"query"},{"name":"cursor","in":"query"}],
    requestBodyContentType: undefined,
    securityRequirements: [{"basicAuth":[]}]
  }],
  ["getv2askanythinggeneratebrief", {
    name: "getv2askanythinggeneratebrief",
    description: `Generate account/deal brief`,
    inputSchema: {"type":"object","properties":{"workspace-id":{"type":"string"},"brief-name":{"type":"string"},"entity-type":{"type":"string","enum":["Deal","Account"]},"crm-entity-id":{"type":"string"},"period-type":{"type":"string"},"from-date-time":{"type":"string","format":"date-time"},"to-date-time":{"type":"string","format":"date-time"}},"required":["workspace-id","brief-name","entity-type","crm-entity-id","period-type"]},
    method: "get",
    pathTemplate: "/v2/askanything/generate-brief",
    executionParameters: [{"name":"workspace-id","in":"query"},{"name":"brief-name","in":"query"},{"name":"entity-type","in":"query"},{"name":"crm-entity-id","in":"query"},{"name":"period-type","in":"query"},{"name":"from-date-time","in":"query"},{"name":"to-date-time","in":"query"}],
    requestBodyContentType: undefined,
    securityRequirements: [{"basicAuth":[]}]
  }],
]);

/**
 * Security schemes from the OpenAPI spec
 */
const securitySchemes =   {
    "basicAuth": {
      "type": "http",
      "scheme": "basic"
    }
  };


server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolsForClient: Tool[] = Array.from(toolDefinitionMap.values()).map(def => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema
  }));
  return { tools: toolsForClient };
});


server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
  const { name: toolName, arguments: toolArgs } = request.params;
  const toolDefinition = toolDefinitionMap.get(toolName);
  if (!toolDefinition) {
    console.error(`Error: Unknown tool requested: ${toolName}`);
    return { content: [{ type: "text", text: `Error: Unknown tool requested: ${toolName}` }] };
  }
  return await executeApiTool(toolName, toolDefinition, toolArgs ?? {}, securitySchemes);
});



/**
 * Type definition for cached OAuth tokens
 */
interface TokenCacheEntry {
    token: string;
    expiresAt: number;
}

/**
 * Declare global __oauthTokenCache property for TypeScript
 */
declare global {
    var __oauthTokenCache: Record<string, TokenCacheEntry> | undefined;
}

/**
 * Acquires an OAuth2 token using client credentials flow
 * 
 * @param schemeName Name of the security scheme
 * @param scheme OAuth2 security scheme
 * @returns Acquired token or null if unable to acquire
 */
async function acquireOAuth2Token(schemeName: string, scheme: any): Promise<string | null | undefined> {
    try {
        // Check if we have the necessary credentials
        const clientId = process.env[`OAUTH_CLIENT_ID_SCHEMENAME`];
        const clientSecret = process.env[`OAUTH_CLIENT_SECRET_SCHEMENAME`];
        const scopes = process.env[`OAUTH_SCOPES_SCHEMENAME`];
        
        if (!clientId || !clientSecret) {
            console.error(`Missing client credentials for OAuth2 scheme '${schemeName}'`);
            return null;
        }
        
        // Initialize token cache if needed
        if (typeof global.__oauthTokenCache === 'undefined') {
            global.__oauthTokenCache = {};
        }
        
        // Check if we have a cached token
        const cacheKey = `${schemeName}_${clientId}`;
        const cachedToken = global.__oauthTokenCache[cacheKey];
        const now = Date.now();
        
        if (cachedToken && cachedToken.expiresAt > now) {
            console.error(`Using cached OAuth2 token for '${schemeName}' (expires in ${Math.floor((cachedToken.expiresAt - now) / 1000)} seconds)`);
            return cachedToken.token;
        }
        
        // Determine token URL based on flow type
        let tokenUrl = '';
        if (scheme.flows?.clientCredentials?.tokenUrl) {
            tokenUrl = scheme.flows.clientCredentials.tokenUrl;
            console.error(`Using client credentials flow for '${schemeName}'`);
        } else if (scheme.flows?.password?.tokenUrl) {
            tokenUrl = scheme.flows.password.tokenUrl;
            console.error(`Using password flow for '${schemeName}'`);
        } else {
            console.error(`No supported OAuth2 flow found for '${schemeName}'`);
            return null;
        }
        
        // Prepare the token request
        let formData = new URLSearchParams();
        formData.append('grant_type', 'client_credentials');
        
        // Add scopes if specified
        if (scopes) {
            formData.append('scope', scopes);
        }
        
        console.error(`Requesting OAuth2 token from ${tokenUrl}`);
        
        // Make the token request
        const response = await axios({
            method: 'POST',
            url: tokenUrl,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
            },
            data: formData.toString()
        });
        
        // Process the response
        if (response.data?.access_token) {
            const token = response.data.access_token;
            const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
            
            // Cache the token
            global.__oauthTokenCache[cacheKey] = {
                token,
                expiresAt: now + (expiresIn * 1000) - 60000 // Expire 1 minute early
            };
            
            console.error(`Successfully acquired OAuth2 token for '${schemeName}' (expires in ${expiresIn} seconds)`);
            return token;
        } else {
            console.error(`Failed to acquire OAuth2 token for '${schemeName}': No access_token in response`);
            return null;
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error acquiring OAuth2 token for '${schemeName}':`, errorMessage);
        return null;
    }
}


/**
 * Executes an API tool with the provided arguments
 * 
 * @param toolName Name of the tool to execute
 * @param definition Tool definition
 * @param toolArgs Arguments provided by the user
 * @param allSecuritySchemes Security schemes from the OpenAPI spec
 * @returns Call tool result
 */
async function executeApiTool(
    toolName: string,
    definition: McpToolDefinition,
    toolArgs: JsonObject,
    allSecuritySchemes: Record<string, any>
): Promise<CallToolResult> {
    try {
        // Validate input arguments using Zod
        const zodSchema = getZodSchemaFromJsonSchema(definition.inputSchema, toolName);
        const validatedArgs = zodSchema.parse(toolArgs);

        // Check if pagination is requested - can be provided directly in the args
        const shouldPaginate = toolArgs.paginate === true || toolArgs.paginate === "true";
        // Remove pagination parameter from validated args as it's not part of the API schema
        if ('paginate' in validatedArgs) {
            delete validatedArgs.paginate;
        }

        // Initialize result data
        let allData: any = null;
        let currentCursor: string | null = null;
        let paginationInfo = {
            hasMorePages: false,
            totalPages: 1,
            currentPage: 1
        };
        
        // For body requests, extract cursor from the request body if it exists
        if (definition.requestBodyContentType && validatedArgs.requestBody) {
            currentCursor = validatedArgs.requestBody.cursor || null;
        } else {
            // For query params, extract cursor if it exists
            currentCursor = validatedArgs.cursor || null;
        }
        
        do {
            // Build the request URL
            let url = API_BASE_URL + definition.pathTemplate;
            
            // Replace path parameters
            for (const param of definition.executionParameters) {
                if (param.in === 'path') {
                    const value = validatedArgs[param.name];
                    if (value !== undefined) {
                        url = url.replace(`{${param.name}}`, encodeURIComponent(value));
                    }
                }
            }

            // Build query parameters
            const queryParams: Record<string, string> = {};
            for (const param of definition.executionParameters) {
                if (param.in === 'query') {
                    const value = validatedArgs[param.name];
                    if (value !== undefined) {
                        queryParams[param.name] = value;
                    }
                }
            }
            
            // Add cursor to query parameters if it exists and we're paginating
            if (currentCursor && definition.executionParameters.some(p => p.name === "cursor" && p.in === "query")) {
                queryParams["cursor"] = currentCursor;
            }
            
            if (Object.keys(queryParams).length > 0) {
                url += '?' + new URLSearchParams(queryParams).toString();
            }

            // Debug logging (safe)
            console.error('Debug - Making API request to:', url);
            if (currentCursor) {
                console.error('Debug - Using cursor:', currentCursor);
            }
            
            // Get credentials from environment
            const accessKey = process.env.GONG_ACCESS_KEY || '';
            const secret = process.env.GONG_SECRET || '';
            
            if (!accessKey || !secret) {
                throw new Error('Missing Gong credentials in environment');
            }
            
            // Create authorization header
            const authHeader = `Basic ${Buffer.from(`${accessKey}:${secret}`).toString('base64')}`;
            
            // Build request config
            const config: AxiosRequestConfig = {
                method: definition.method,
                url,
                headers: {
                    'Accept': 'application/json',
                    'Authorization': authHeader
                }
            };

            // Add request body if needed
            if (definition.requestBodyContentType) {
                config.headers!['Content-Type'] = definition.requestBodyContentType;
                if (validatedArgs.requestBody) {
                    // Create a copy of the request body to modify
                    const requestBody = {...validatedArgs.requestBody};
                    
                    // Update cursor in request body if we're paginating
                    if (currentCursor && shouldPaginate) {
                        requestBody.cursor = currentCursor;
                    }
                    
                    config.data = requestBody;
                }
            }

            // Make the request
            const response = await axios(config);
            
            // Extract the next cursor from the response
            const nextCursor = response.data?.records?.nextPageCursor || 
                              response.data?.nextPageCursor || 
                              response.data?.cursor || 
                              null;
            
            // Determine if there are more pages based on nextCursor presence
            const hasMorePages = !!nextCursor && shouldPaginate;
            
            // Update pagination info
            paginationInfo.hasMorePages = hasMorePages;
            if (hasMorePages) {
                paginationInfo.totalPages++;
                paginationInfo.currentPage++;
            }
            
            // If this is the first request or we're not paginating, just use the response data
            if (!allData) {
                allData = response.data;
            } else {
                // Otherwise, merge the data
                // Merge data based on the response structure - common patterns in API responses
                if (response.data.records && Array.isArray(response.data.records)) {
                    // Most common pattern: { records: [] } with a nextPageCursor
                    allData.records = [...allData.records, ...response.data.records];
                    // Update the cursor for the complete result
                    allData.nextPageCursor = nextCursor;
                } else if (response.data.calls && Array.isArray(response.data.calls)) {
                    // For calls endpoint
                    allData.calls = [...allData.calls, ...response.data.calls];
                    allData.nextPageCursor = nextCursor;
                } else if (response.data.users && Array.isArray(response.data.users)) {
                    // For users endpoint
                    allData.users = [...allData.users, ...response.data.users];
                    allData.nextPageCursor = nextCursor;
                } else if (response.data.results && Array.isArray(response.data.results)) {
                    // For results pattern
                    allData.results = [...allData.results, ...response.data.results];
                    allData.nextPageCursor = nextCursor;
                } else if (Array.isArray(response.data)) {
                    // For array responses
                    allData = [...allData, ...response.data];
                } else {
                    // For other structures, just append new data in a special format
                    allData.additionalPages = allData.additionalPages || [];
                    allData.additionalPages.push(response.data);
                }
            }
            
            // Update cursor for next iteration
            currentCursor = nextCursor;
            
            // Log pagination status
            if (shouldPaginate && nextCursor) {
                console.error(`Debug - Retrieved page ${paginationInfo.currentPage}. Next cursor: ${nextCursor?.substring(0, 20)}...`);
            }
            
        } while (currentCursor && shouldPaginate);
        
        // Add pagination metadata to the result
        allData._paginationInfo = paginationInfo;
        
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(allData, null, 2)
                }
            ]
        };

    } catch (error: any) {
        if (error instanceof ZodError) {
            return {
                content: [{
                    type: 'text',
                    text: `Validation error: ${error.message}`
                }]
            };
        }
        
        if (axios.isAxiosError(error)) {
            return {
                content: [{
                    type: 'text',
                    text: formatApiError(error)
                }]
            };
        }

        return {
            content: [{
                type: 'text',
                text: `Unexpected error: ${error.message}`
            }]
        };
    }
}


/**
 * Main function to start the server
 */
async function main() {
    // Set up stdio transport
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error(`${SERVER_NAME} MCP Server (v${SERVER_VERSION}) running on stdio${API_BASE_URL ? `, proxying API at ${API_BASE_URL}` : ''}`);
        console.error('Current working directory:', process.cwd());
        console.error('Node version:', process.version);
    } catch (error) {
        console.error("Error during server startup:", error);
        process.exit(1);
    }
}

/**
 * Cleanup function for graceful shutdown
 */
async function cleanup() {
    console.error("Shutting down MCP server...");
    process.exit(0);
}

// Register signal handlers
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Start the server
main().catch((error) => {
  console.error("Fatal error in main execution:", error);
  process.exit(1);
});

/**
 * Formats API errors for better readability
 * 
 * @param error Axios error
 * @returns Formatted error message
 */
function formatApiError(error: AxiosError): string {
    let message = 'API request failed.';
    if (error.response) {
        message = `API Error: Status ${error.response.status} (${error.response.statusText || 'Status text not available'}). `;
        const responseData = error.response.data;
        const MAX_LEN = 200;
        if (typeof responseData === 'string') { 
            message += `Response: ${responseData.substring(0, MAX_LEN)}${responseData.length > MAX_LEN ? '...' : ''}`; 
        }
        else if (responseData) { 
            try { 
                const jsonString = JSON.stringify(responseData); 
                message += `Response: ${jsonString.substring(0, MAX_LEN)}${jsonString.length > MAX_LEN ? '...' : ''}`; 
            } catch { 
                message += 'Response: [Could not serialize data]'; 
            } 
        }
        else { 
            message += 'No response body received.'; 
        }
    } else if (error.request) {
        message = 'API Network Error: No response received from server.';
        if (error.code) message += ` (Code: ${error.code})`;
    } else { 
        message += `API Request Setup Error: ${error.message}`; 
    }
    return message;
}

/**
 * Converts a JSON Schema to a Zod schema for runtime validation
 * 
 * @param jsonSchema JSON Schema
 * @param toolName Tool name for error reporting
 * @returns Zod schema
 */
function getZodSchemaFromJsonSchema(jsonSchema: any, toolName: string): z.ZodTypeAny {
    if (typeof jsonSchema !== 'object' || jsonSchema === null) { 
        return z.object({}).passthrough(); 
    }
    try {
        const zodSchemaString = jsonSchemaToZod(jsonSchema);
        const zodSchema = eval(zodSchemaString);
        if (typeof zodSchema?.parse !== 'function') { 
            throw new Error('Eval did not produce a valid Zod schema.'); 
        }
        return zodSchema as z.ZodTypeAny;
    } catch (err: any) {
        console.error(`Failed to generate/evaluate Zod schema for '${toolName}':`, err);
        return z.object({}).passthrough();
    }
}