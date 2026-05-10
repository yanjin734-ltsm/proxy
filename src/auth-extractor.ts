import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import { execSync } from "child_process";

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
        "Network",
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
   * Uses multiple methods to read locked database
   */
  extractAuth(): PerplexityAuth | null {
    if (!this.isAvailable()) {
      console.error("Perplexity cookie database not found at:", this.cookieDbPath);
      return null;
    }

    // Try multiple methods to read the database
    let db: Database.Database | null = null;

    // Method 1: Try direct read with shared lock
    try {
      db = new Database(this.cookieDbPath, { 
        readonly: true,
        fileMustExist: false
      });
    } catch (error) {
      console.log("Direct read failed, trying alternative methods...");
    }

    // Method 2: Try to copy file using Windows backup semantics
    if (!db) {
      try {
        const tempPath = join(homedir(), "AppData", "Local", "Temp", "perplexity_cookies_temp");
        
        // Use Windows backup semantics to copy locked file
        execSync(`cmd /c "type \"${this.cookieDbPath}\" > \"${tempPath}\" 2>nul"`, { 
          windowsHide: true,
          timeout: 5000
        });
        
        if (existsSync(tempPath)) {
          db = new Database(tempPath, { readonly: true });
        }
      } catch (error) {
        console.log("Backup copy failed, trying VSS...");
      }
    }

    // Method 3: Use Volume Shadow Copy (VSS)
    if (!db) {
      try {
        // Create shadow copy
        execSync("vssadmin create shadow /for=C:", { 
          windowsHide: true,
          timeout: 30000
        });
        
        // Get shadow copy path
        const shadowOutput = execSync("vssadmin list shadows /for=C:", { 
          windowsHide: true,
          encoding: "utf-8"
        });
        
        // Parse shadow copy path from output
        const shadowMatch = shadowOutput.match(/Shadow Copy Volume: (\\\?\?GLOBALROOT\Device\HarddiskVolumeShadowCopy\d+)/);
        if (shadowMatch) {
          const shadowPath = shadowMatch[1];
          const cookieShadowPath = join(shadowPath, "Users", process.env.USERNAME || "test", "AppData", "Roaming", "Perplexity", "Network", "Cookies");
          
          if (existsSync(cookieShadowPath)) {
            db = new Database(cookieShadowPath, { readonly: true });
          }
        }
      } catch (error) {
        console.error("VSS method failed:", error);
      }
    }

    if (!db) {
      console.error("Failed to read Perplexity cookie database. Make sure Perplexity is running and you are logged in.");
      return null;
    }

    try {
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
      if (db) db.close();
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
