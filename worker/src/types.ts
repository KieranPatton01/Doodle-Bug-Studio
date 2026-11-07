/**
 * Cloudflare Worker Environment Interface & Request/Response Types
 */

export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  canvasPath: string;
  committerName?: string;
  committerEmail?: string;
}

export interface Env {
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  GITHUB_PAT: string;
  ALLOWED_FIREBASE_UID: string;
  FIREBASE_PROJECT_ID?: string;
  
  // Repo config can be provided as a JSON string or individual vars
  GITHUB_REPO_CONFIG?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_CANVAS_PATH?: string;
  GITHUB_COMMITTER_NAME?: string;
  GITHUB_COMMITTER_EMAIL?: string;

  CORS_ORIGIN?: string;
  NODE_ENV?: string;
  ENVIRONMENT?: string;
  DEV_BYPASS_AUTH?: string;
}

export interface GenerateRequest {
  /** Canvas snapshot: either data URL (data:image/png;base64,...) or raw Base64 */
  snapshotBase64: string;
  /** Optional array of permanent photo download URLs uploaded to Firebase Storage */
  imageUrls?: string[];
  /** Optional handwritten notes or prompt instructions */
  notes?: string;
  /** Deprecated legacy vibe parameter (theming has been removed) */
  vibe?: string;
}

export interface GenerateResponse {
  html: string;
  model: string;
  /** Deprecated legacy vibe parameter */
  vibe?: string;
}

export interface PublishRequest {
  /** The generated and approved HTML document to commit into canvas.html */
  html: string;
  /** Optional custom commit message */
  commitMessage?: string;
}

export interface PublishResponse {
  success: boolean;
  commitSha: string;
  htmlUrl: string;
  path: string;
  branch: string;
}

export interface AssistRequest {
  prompt: string;
  width?: number;
  height?: number;
}

export interface AssistResponse {
  strokes: Array<{
    tool: 'brush' | 'marker';
    color: string;
    size: number;
    points: Array<{ x: number; y: number }>;
  }>;
  notes: Array<{
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
  }>;
  stickers: Array<{
    assetId: string;
    x: number;
    y: number;
  }>;
}

export interface AuthVerificationResult {
  valid: boolean;
  uid?: string;
  error?: string;
  statusCode?: number;
}
