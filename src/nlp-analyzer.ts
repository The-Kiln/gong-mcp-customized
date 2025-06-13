import axios from 'axios';

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
 * Interface for batch processing of calls
 */
interface BatchProcessResult {
  processedCalls: CallData[];
  totalCalls: number;
  summary: string;
}

/**
 * Class to handle natural language processing of Gong call data
 */
export class NlpAnalyzer {
  private baseUrl: string;
  private accessKey: string;
  private secret: string;
  
  /**
   * Constructor for NlpAnalyzer
   * 
   * @param baseUrl Base URL for Gong API
   * @param accessKey Gong access key
   * @param secret Gong API secret
   */
  constructor(baseUrl: string, accessKey: string, secret: string) {
    this.baseUrl = baseUrl;
    this.accessKey = accessKey;
    this.secret = secret;
  }
  
  /**
   * Main method to analyze call data based on natural language query
   * 
   * @param request NLP analysis request
   * @returns Analysis results
   */
  public async analyzeWithNlp(request: NlpAnalysisRequest): Promise<any> {
    try {
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
      return {
        query: request.query,
        callsAnalyzed: batchResults.processedCalls.length,
        totalCallsFound: batchResults.totalCalls,
        timeRange: request.timeRange,
        analysis: analysis,
        summary: batchResults.summary
      };
    } catch (error: any) {
      console.error("Error analyzing calls with NLP:", error.message);
      throw new Error(`NLP analysis failed: ${error.message}`);
    }
  }
  
  /**
   * Fetches calls from Gong API based on request criteria
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
    
    // Add participant filtering if specified
    if (request.participants && request.participants.length > 0) {
      requestBody.filter.participantsEmails = request.participants;
    }
    
    // Execute the API call
    const response = await client.post('/v2/calls/extensive', requestBody);
    
    // Process and return the calls
    const maxCalls = request.maxCalls || 100; // Default to 100 if not specified
    return this.processCalls(response.data, maxCalls);
  }
  
  /**
   * Processes calls data from API response
   * 
   * @param apiResponse API response from calls/extensive
   * @param maxCalls Maximum number of calls to process
   * @returns Processed call data array
   */
  private processCalls(apiResponse: any, maxCalls: number): CallData[] {
    // Extract calls from response (format depends on Gong API)
    const calls = apiResponse.calls || [];
    
    // Sort calls by date (newest first)
    const sortedCalls = [...calls].sort((a, b) => {
      return new Date(b.metaData.startTime).getTime() - new Date(a.metaData.startTime).getTime();
    });
    
    // Limit to maxCalls
    const limitedCalls = sortedCalls.slice(0, maxCalls);
    
    // Transform to our CallData format
    return limitedCalls.map((call: any) => ({
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
    
    // Process in batches
    for (let i = 0; i < calls.length; i += BATCH_SIZE) {
      const batch = calls.slice(i, i + BATCH_SIZE);
      // Here you would do any pre-processing needed for each batch
      processedCalls = processedCalls.concat(batch);
    }
    
    // Generate preliminary summary
    const summary = `Analyzed ${processedCalls.length} calls from ${this.formatDate(request.timeRange?.start)} to ${this.formatDate(request.timeRange?.end || new Date().toISOString())}`;
    
    return {
      processedCalls,
      totalCalls,
      summary
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
    
    return {
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
}