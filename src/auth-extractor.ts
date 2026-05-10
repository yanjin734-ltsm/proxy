import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

export interface PerplexityAuth {
  sessionToken: string;
  userId?: string;
  csrfToken?: string;
  expires?: number;
}

export class AuthExtractor {
  private cookieDbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.cookieDbPath = customPath;
    } else {
      // Default path for Perplexity desktop app on Windows
      this.cookieDbPath = join(
        homedir(),
        "AppData",
        "Roaming",
        "Perplexity",
        "Cookies"
      );
    }
  }

  /**
   * Check if Perplexity cookie database exists
   */
  isAvailable(): boolean {
    return existsSync(this.cookieDbPath);
  }

  /**
   * Extract session token from Perplexity cookie database
   */
  extractAuth(): PerplexityAuth | null {
    if (!this.isAvailable()) {
      console.error("Perplexity cookie database not found at:", this.cookieDbPath);
      return null;
    }

    try {
      const db = new Database(this.cookieDbPath, { readonly: true });

      // Query for session token
      const sessionToken = this.queryCookie(db, "__Secure-next-auth.session-token");
      const csrfToken = this.queryCookie(db, "next-auth.csrf-token");
      const userId = this.queryCookie(db, "perplexity_user_id");

      db.close();

      if (!sessionToken) {
        console.error("No session token found. Make sure you are logged into Perplexity desktop app.");
        return null;
      }

      return {
        sessionToken,
        userId: userId || undefined,
        csrfToken: csrfToken || undefined,
      };
    } catch (error) {
      console.error("Failed to extract auth from Perplexity:", error);
      return null;
    }
  }

  /**
   * Query a specific cookie from the database
   */
  private queryCookie(db: Database.Database, name: string): string | null {
    try {
      const stmt = db.prepare(
        "SELECT value FROM cookies WHERE name = ? AND host_key LIKE '%perplexity%' ORDER BY creation_utc DESC LIMIT 1"
      );
      const row = stmt.get(name) as { value: string } | undefined;
      return row?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the path to the cookie database
   */
  getCookieDbPath(): string {
    return this.cookieDbPath;
  }
}

/**
 * Create auth extractor with auto-detection
 */
export function createAuthExtractor(customPath?: string): AuthExtractor {
  return new AuthExtractor(customPath);
}
