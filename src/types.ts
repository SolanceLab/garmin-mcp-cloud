export interface OAuth1Token {
  oauth_token: string;
  oauth_token_secret: string;
  mfa_token: string | null;
  mfa_expiration_timestamp: string | null;
  domain: string;
}

export interface OAuth2Token {
  scope: string;
  jti: string;
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  refresh_token_expires_in: number;
  refresh_token_expires_at: number;
}

export interface OAuthConsumer {
  consumer_key: string;
  consumer_secret: string;
}

export interface Env {
  GARMIN_KV: KVNamespace;
  API_KEY: string;
  GARMIN_DISPLAY_NAME: string;
  GARMIN_USER_PROFILE_PK: string;
}
