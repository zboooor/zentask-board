import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============= Token Management (inlined) =============

interface TokenCache {
  token: string;
  expireAt: number;
}

let tokenCache: TokenCache | null = null;

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!;

async function getTenantAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expireAt > Date.now() + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  tokenCache = {
    token: data.tenant_access_token,
    expireAt: Date.now() + data.expire * 1000,
  };

  return tokenCache.token;
}

async function feishuRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
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

// ============= Configuration =============

const APP_TOKEN = process.env.FEISHU_APP_TOKEN!;
const USERS_TABLE_ID = process.env.FEISHU_USERS_TABLE_ID!;

// ============= User Authentication =============

interface UserRecord {
  record_id: string;
  fields: {
    user_id: string;
    password_hash: string;
    created_at?: number;
  };
}

/**
 * Find user by user_id
 */
async function findUser(userId: string): Promise<UserRecord | null> {
  const response = await feishuRequest(
    `/bitable/v1/apps/${APP_TOKEN}/tables/${USERS_TABLE_ID}/records/search`,
    {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          conjunction: 'and',
          conditions: [
            {
              field_name: 'user_id',
              operator: 'is',
              value: [userId],
            },
          ],
        },
      }),
    }
  );

  const items = response.data?.items || [];
  if (items.length === 0) return null;

  return items[0] as UserRecord;
}

/**
 * Create new user
 */
async function createUser(userId: string, passwordHash: string): Promise<string> {
  const response = await feishuRequest(
    `/bitable/v1/apps/${APP_TOKEN}/tables/${USERS_TABLE_ID}/records`,
    {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          user_id: userId,
          password_hash: passwordHash,
          created_at: Date.now(),
        },
      }),
    }
  );

  return response.data.record.record_id;
}

// ============= Main Handler =============

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, passwordHash } = request.body || {};

    if (!userId || !passwordHash) {
      return response.status(400).json({ error: 'Missing userId or passwordHash' });
    }

    const normalizedUserId = userId.trim().toLowerCase();

    // Check if user exists
    const existingUser = await findUser(normalizedUserId);

    if (action === 'login') {
      // Login: verify password
      if (!existingUser) {
        return response.status(200).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: '用户不存在，请先注册',
        });
      }

      if (existingUser.fields.password_hash !== passwordHash) {
        return response.status(200).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: '密码错误，请重试',
        });
      }

      return response.status(200).json({
        success: true,
        message: '登录成功',
      });
    }

    if (action === 'register') {
      // Register: create new user
      if (existingUser) {
        return response.status(200).json({
          success: false,
          error: 'USER_EXISTS',
          message: '用户已存在，请直接登录',
        });
      }

      await createUser(normalizedUserId, passwordHash);

      return response.status(200).json({
        success: true,
        message: '注册成功',
      });
    }

    if (action === 'check') {
      // Check if user exists
      return response.status(200).json({
        success: true,
        exists: !!existingUser,
      });
    }

    return response.status(400).json({ error: 'Invalid action. Use: login, register, or check' });
  } catch (error: any) {
    console.error('Auth API error:', error);
    return response.status(500).json({ error: error.message });
  }
}
