/**
 * Feishu Token Management
 * Handles tenant_access_token acquisition and caching
 */

interface TokenCache {
  token: string;
  expireAt: number;
}

let tokenCache: TokenCache | null = null;

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!;

/**
 * Get a valid tenant_access_token, using cache when available
 */
export async function getTenantAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (tokenCache && tokenCache.expireAt > Date.now() + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  // Request new token
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    }
  );

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Failed to get token: ${data.msg}`);
  }

  // Cache the token
  tokenCache = {
    token: data.tenant_access_token,
    expireAt: Date.now() + data.expire * 1000,
  };

  return tokenCache.token;
}

/**
 * Make an authenticated request to Feishu API
 */
export async function feishuRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const token = await getTenantAccessToken();

  const response = await fetch(`https://open.feishu.cn/open-apis${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.msg} (code: ${data.code})`);
  }

  return data;
}
