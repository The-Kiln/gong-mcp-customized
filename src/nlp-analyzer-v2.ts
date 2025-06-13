import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Interface for the NLP analysis request
 */
export interface NlpAnalysisRequest {
  query: string;
  timeRange?: {
    start: string;
    end: string;
  };
  maxCalls?: number;
  participants?: string[];
  page?: number;
  pageSize?: number;
  cursor?: string;
  logResults?: boolean;
}

/**
 * Response interface for call data
 */
interface CallData {
  id: string;
  title: string;
  startTime: string;
  duration: number;
  participants: any[];
  transcript?: any[];
  // Additional fields as needed
}

/**
 * Interface for pagination info
 */
interface PaginationInfo {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCalls: number;
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Interface for batch processing of calls
 */
interface BatchProcessResult {
  processedCalls: CallData[];
  totalCalls: number;
  summary: string;
  pagination: PaginationInfo;
  nextCursor?: string;
}

/**
 * Class to handle natural language processing of Gong call data
 */
export class NlpAnalyzerV2 {
  private baseUrl: string;
  private accessKey: string;
  private secret: string;
  private logDir: string;
  
  /**
   * Constructor for NlpAnalyzer
   * 
   * @param baseUrl Base URL for Gong API
   * @param accessKey Gong access key
   * @param secret Gong API secret
   * @param logDir Optional directory for logging results
   */
  constructor(baseUrl: string, accessKey: string, secret: string, logDir?: string) {
    this.baseUrl = baseUrl;
    this.accessKey = accessKey;
    this.secret = secret;
    this.logDir = logDir || path.join(process.cwd(), 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }
  
  /**
   * Main method to analyze call data based on natural language query
   * 
   * @param request NLP analysis request
   * @returns Analysis results
   */
  public async analyzeWithNlp(request: NlpAnalysisRequest): Promise<any> {
    try {
      this.logInfo(`Starting analysis for query: ${request.query}`);
      
      // Set default pagination values
      const page = request.page || 1;
      const pageSize = request.pageSize || 100;
      
      // Step 1: Fetch call data based on criteria
      const callData = await this.fetchRelevantCalls(request);
      
      // Step 2: Process calls in batches to avoid memory issues
      const batchResults = await this.processBatches(callData, request);
      
      // Step 3: Fetch transcripts for detailed analysis if needed
      if (this.requiresTranscripts(request.query)) {
        await this.enrichWithTranscripts(batchResults.processedCalls);
      }
      
      // Step 4: Analyze data with AI
      const analysis = await this.analyzeWithAI(batchResults.processedCalls, request.query);
      
      // Step 5: Format and return results
      const result = {
        query: request.query,
        callsAnalyzed: batchResults.processedCalls.length,
        totalCallsFound: batchResults.totalCalls,
        timeRange: request.timeRange,
        pagination: batchResults.pagination,
        analysis: analysis,
        summary: batchResults.summary
      };
      
      // Log results if requested
      if (request.logResults) {
        this.logResults(result);
      }
      
      return result;
    } catch (error: any) {
      const errorMsg = `Error analyzing calls with NLP: ${error.message}`;
      this.logError(errorMsg);
      throw new Error(errorMsg);
    }
  }
  
  /**
   * Fetches calls from Gong API based on request criteria with pagination
   * 
   * @param request NLP analysis request
   * @returns Array of relevant calls
   */
  private async fetchRelevantCalls(request: NlpAnalysisRequest): Promise<CallData[]> {
    // Create API client with auth
    const client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: this.accessKey,
        password: this.secret
      }
    });
    
    // Prepare request body for calls/extensive endpoint
    const requestBody: any = {
      filter: {
        // Default to last 90 days if no time range specified
        fromDateTime: request.timeRange?.start || this.getDefaultStartDate(),
        toDateTime: request.timeRange?.end || new Date().toISOString()
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
    
    // Add cursor for pagination if provided
    if (request.cursor) {
      requestBody.cursor = request.cursor;
    }
    
    // Add participant filtering if specified
    if (request.participants && request.participants.length > 0) {
      requestBody.filter.participantsEmails = request.participants;
    }
    
    this.logInfo(`Fetching calls with filter: ${JSON.stringify(requestBody.filter)}`);
    
    // Execute the API call
    const response = await client.post('/v2/calls/extensive', requestBody);
    
    // Process and return the calls
    const pageSize = request.pageSize || 100; // Default to 100 if not specified
    const page = request.page || 1;
    
    return this.processCalls(response.data, pageSize, page);
  }
  
  /**
   * Processes calls data from API response with pagination
   * 
   * @param apiResponse API response from calls/extensive
   * @param pageSize Page size for pagination
   * @param page Current page number
   * @returns Processed call data array
   */
  private processCalls(apiResponse: any, pageSize: number, page: number): CallData[] {
    // Extract calls from response (format depends on Gong API)
    const calls = apiResponse.calls || [];
    
    this.logInfo(`Received ${calls.length} calls from API`);
    
    // Sort calls by date (newest first)
    const sortedCalls = [...calls].sort((a, b) => {
      return new Date(b.metaData.startTime).getTime() - new Date(a.metaData.startTime).getTime();
    });
    
    // Calculate pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    // Get page of calls
    const paginatedCalls = sortedCalls.slice(startIndex, endIndex);
    
    this.logInfo(`Returning page ${page} with ${paginatedCalls.length} calls`);
    
    // Transform to our CallData format
    return paginatedCalls.map((call: any) => ({
      id: call.metaData.id,
      title: call.metaData.title,
      startTime: call.metaData.startTime,
      duration: call.metaData.duration,
      participants: call.metaData.participants || [],
      // Additional fields as needed
    }));
  }
  
  /**
   * Process calls in batches to avoid memory issues
   * 
   * @param calls Array of calls to process
   * @param request Original NLP request
   * @returns Batch processing result
   */
  private async processBatches(calls: CallData[], request: NlpAnalysisRequest): Promise<BatchProcessResult> {
    const BATCH_SIZE = 25; // Process 25 calls at a time
    const totalCalls = calls.length;
    let processedCalls: CallData[] = [];
    
    // Set pagination values
    const page = request.page || 1;
    const pageSize = request.pageSize || 100;
    
    // Process in batches
    for (let i = 0; i < calls.length; i += BATCH_SIZE) {
      const batch = calls.slice(i, i + BATCH_SIZE);
      // Here you would do any pre-processing needed for each batch
      processedCalls = processedCalls.concat(batch);
      this.logInfo(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} calls`);
    }
    
    // Calculate total pages
    const totalPages = Math.ceil(totalCalls / pageSize);
    
    // Create pagination info
    const pagination: PaginationInfo = {
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      totalCalls: totalCalls,
      hasMore: page < totalPages,
      nextCursor: request.cursor // Store cursor for next page if available
    };
    
    // Generate preliminary summary
    const summary = `Analyzed ${processedCalls.length} calls (page ${page} of ${totalPages}) from ${this.formatDate(request.timeRange?.start)} to ${this.formatDate(request.timeRange?.end || new Date().toISOString())}`;
    
    return {
      processedCalls,
      totalCalls,
      summary,
      pagination,
      nextCursor: request.cursor // Pass cursor to next page if available
    };
  }
  
  /**
   * Determines if the query requires transcript data
   * 
   * @param query User's natural language query
   * @returns Boolean indicating if transcripts are needed
   */
  private requiresTranscripts(query: string): boolean {
    // Keywords that suggest transcript analysis is needed
    const transcriptKeywords = [
      'said', 'mention', 'talk', 'spoke', 'discuss',
      'question', 'answer', 'response', 'objection',
      'transcript', 'conversation', 'word', 'phrase',
      'topic', 'common', 'frequency', 'often'
    ];
    
    // Check if any keywords exist in the query
    const lowerQuery = query.toLowerCase();
    return transcriptKeywords.some(keyword => lowerQuery.includes(keyword));
  }
  
  /**
   * Enriches call data with transcript information
   * 
   * @param calls Array of calls to enrich
   */
  private async enrichWithTranscripts(calls: CallData[]): Promise<void> {
    // Create API client with auth
    const client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: this.accessKey,
        password: this.secret
      }
    });
    
    // Process in smaller batches for transcript retrieval
    const TRANSCRIPT_BATCH_SIZE = 5;
    
    for (let i = 0; i < calls.length; i += TRANSCRIPT_BATCH_SIZE) {
      const batch = calls.slice(i, i + TRANSCRIPT_BATCH_SIZE);
      const callIds = batch.map(call => call.id);
      
      this.logInfo(`Fetching transcripts for batch ${Math.floor(i / TRANSCRIPT_BATCH_SIZE) + 1} with ${callIds.length} calls`);
      
      // Request transcripts for the batch
      const response = await client.post('/v2/calls/transcript', {
        filter: {
          callIds: callIds
        }
      });
      
      // Map transcripts to the corresponding calls
      if (response.data && response.data.transcripts) {
        for (const transcript of response.data.transcripts) {
          const call = calls.find(c => c.id === transcript.callId);
          if (call) {
            call.transcript = transcript.sentences || [];
            // Use optional chaining to avoid TypeScript error
            this.logInfo(`Added transcript with ${call.transcript?.length || 0} sentences to call ${call.id}`);
          }
        }
      }
    }
  }
  
  /**
   * Analyzes call data using AI
   * 
   * @param calls Processed and enriched call data
   * @param query User's natural language query
   * @returns AI analysis results
   */
  private async analyzeWithAI(calls: CallData[], query: string): Promise<any> {
    this.logInfo(`Analyzing ${calls.length} calls with query: ${query}`);
    
    // For now, return a placeholder analysis
    // In a real implementation, this would call an AI service like Claude
    
    // Mock analysis for demonstration
    const topicFrequency: Record<string, number> = {};
    const questionPatterns: string[] = [];
    const callCountByParticipantRole: Record<string, number> = {};
    
    // Simple analysis logic
    calls.forEach(call => {
      // Count by participant role
      call.participants.forEach((participant: any) => {
        const role = participant.role || 'unknown';
        callCountByParticipantRole[role] = (callCountByParticipantRole[role] || 0) + 1;
      });
      
      // Extract topics if available
      if (call.transcript) {
        call.transcript.forEach((sentence: any) => {
          // Simple question detection
          if (sentence.text && sentence.text.trim().endsWith('?')) {
            questionPatterns.push(sentence.text);
          }
        });
      }
    });
    
    const result = {
      summary: `Based on analysis of ${calls.length} calls, we found patterns related to your query about "${query}"`,
      keyInsights: [
        "Product managers frequently ask about timeline and resource allocation",
        "Common topics include feature prioritization and customer feedback",
        "Questions about technical feasibility appear in 65% of calls"
      ],
      participantBreakdown: callCountByParticipantRole,
      questionSamples: questionPatterns.slice(0, 5),
      recommendedActions: [
        "Prepare documentation on technical constraints",
        "Develop clearer process for feature prioritization",
        "Create FAQ for common product manager questions"
      ]
    };
    
    this.logInfo(`Analysis complete with ${result.keyInsights.length} key insights`);
    return result;
  }
  
  /**
   * Gets default start date (90 days ago)
   * 
   * @returns ISO date string for 90 days ago
   */
  private getDefaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 90);
    return date.toISOString();
  }
  
  /**
   * Formats ISO date string to human-readable format
   * 
   * @param isoDate ISO date string
   * @returns Formatted date string
   */
  private formatDate(isoDate?: string): string {
    if (!isoDate) return 'present';
    return new Date(isoDate).toLocaleDateString();
  }
  
  /**
   * Logs information message to console and log file
   * 
   * @param message Message to log
   */
  private logInfo(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] INFO: ${message}`;
    console.log(logMessage);
    this.appendToLog('info', logMessage);
  }
  
  /**
   * Logs error message to console and log file
   * 
   * @param message Error message to log
   */
  private logError(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ERROR: ${message}`;
    console.error(logMessage);
    this.appendToLog('error', logMessage);
  }
  
  /**
   * Logs analysis results to a file
   * 
   * @param results Analysis results to log
   */
  private logResults(results: any): void {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = path.join(this.logDir, `analysis_${timestamp}.json`);
    
    try {
      fs.writeFileSync(filename, JSON.stringify(results, null, 2));
      this.logInfo(`Results logged to ${filename}`);
    } catch (error: any) {
      this.logError(`Failed to log results: ${error.message}`);
    }
  }
  
  /**
   * Appends a message to the log file
   * 
   * @param level Log level
   * @param message Message to log
   */
  private appendToLog(level: string, message: string): void {
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `nlp_${level}_${today}.log`);
    
    try {
      fs.appendFileSync(logFile, message + '\n');
    } catch (error) {
      // If we can't log to file, at least we logged to console
    }
  }
}