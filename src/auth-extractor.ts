import { PerplexityAuth } from "./types.js";

export { PerplexityAuth };

/**
 * Authentication extractor for Perplexity
 * 
 * Supports multiple authentication methods:
 * 1. Environment variable PERPLEXITY_SESSION_TOKEN
 * 2. Cookie database extraction (from Perplexity desktop app)
 * 3. Anonymous mode (no authentication, limited queries)
 */
export class AuthExtractor {
  private customPath?: string;

  constructor(customPath?: string) {
    this.customPath = customPath;
  }

  /**
   * Extract authentication from environment or return null for anonymous
   */
  extractAuth(): PerplexityAuth | null {
    // Method 1: Environment variable
    if (process.env.PERPLEXITY_SESSION_TOKEN) {
      console.log("Using session token from environment variable");
      return {
        sessionToken: process.env.PERPLEXITY_SESSION_TOKEN,
        userId: process.env.PERPLEXITY_USER_ID,
        csrfToken: process.env.PERPLEXITY_CSRF_TOKEN,
      };
    }

    // Method 2: Cookie file (if available)
    // Note: Perplexity desktop app locks the cookie database
    // Users should extract cookies manually or use browser extension
    
    // Return null for anonymous mode
    console.log("No authentication found. Using anonymous mode (limited queries).");
    return null;
  }
}

export function createAuthExtractor(customPath?: string): AuthExtractor {
  return new AuthExtractor(customPath);
}
