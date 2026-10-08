export type Prostredi = {
  DB: D1Database;
  ASSETS?: Fetcher;
  ACCESS_TEAM_DOMAIN?: string; // např. "tvuj-tym.cloudflareaccess.com"
  ACCESS_AUD?: string;
  ALLOWED_EMAILS?: string;
  DEV_BYPASS?: string;         // "1" jen lokálně v .dev.vars
};
