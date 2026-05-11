export interface PerplexityAuth {
  sessionToken: string;
  userId?: string;
  csrfToken?: string;
  expires?: number;
}
