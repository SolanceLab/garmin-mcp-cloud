export interface DITokens {
  di_token: string;
  di_refresh_token: string;
  di_client_id: string;
}

export interface Env {
  GARMIN_KV: KVNamespace;
  API_KEY: string;
  GARMIN_DISPLAY_NAME: string;
  GARMIN_USER_PROFILE_PK: string;
}
