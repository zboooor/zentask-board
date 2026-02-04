import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============= Token Management =============

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
const TABLE_IDS: Record<string, string> = {
    tasks: process.env.FEISHU_TASKS_TABLE_ID!,
    ideas: process.env.FEISHU_IDEAS_TABLE_ID!,
    columns: process.env.FEISHU_COLUMNS_TABLE_ID!,
    documents: process.env.FEISHU_DOCUMENTS_TABLE_ID!,
    documentFolders: process.env.FEISHU_DOCUMENT_FOLDERS_TABLE_ID!,
};

// ============= CRUD Operations =============

/**
 * Create a single record
 */
async function createRecord(table: string, userId: string, data: any): Promise<string> {
    const tableId = TABLE_IDS[table];
    if (!tableId) throw new Error(`Unknown table: ${table}`);

    let fields: Record<string, any> = { user_id: userId };

    if (table === 'tasks') {
        fields = {
            ...fields,
            task_id: data.id,
            column_id: data.columnId,
            content: data.content,
            completed: data.completed || false,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
        };
    } else if (table === 'ideas') {
        fields = {
            ...fields,
            idea_id: data.id,
            column_id: data.columnId,
            content: data.content,
            is_ai_generated: data.isAiGenerated || false,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
        };
    } else if (table === 'columns') {
        fields = {
            ...fields,
            column_id: data.id,
            title: data.title,
            type: data.type || 'task',
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted || false,
            encryptionSalt: data.encryptionSalt || '',
        };
    } else if (table === 'documents') {
        fields = {
            ...fields,
            doc_id: data.id,
            folder_id: data.folderId || '',
            title: data.title || '',
            content: data.content || '',
            created_at: data.createdAt || Date.now(),
            updated_at: data.updatedAt || Date.now(),
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted || false,
            encryptionSalt: data.encryptionSalt || '',
        };
    } else if (table === 'documentFolders') {
        fields = {
            ...fields,
            folder_id: data.id,
            title: data.title,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted || false,
            encryptionSalt: data.encryptionSalt || '',
        };
    }

    const response = await feishuRequest(
        `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records`,
        {
            method: 'POST',
            body: JSON.stringify({ fields }),
        }
    );

    return response.data.record.record_id;
}

/**
 * Update a single record
 */
async function updateRecord(table: string, recordId: string, data: any): Promise<void> {
    const tableId = TABLE_IDS[table];
    if (!tableId) throw new Error(`Unknown table: ${table}`);

    let fields: Record<string, any> = {};

    if (table === 'tasks') {
        fields = {
            column_id: data.columnId,
            content: data.content,
            completed: data.completed || false,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
        };
    } else if (table === 'ideas') {
        fields = {
            column_id: data.columnId,
            content: data.content,
            is_ai_generated: data.isAiGenerated || false,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
        };
    } else if (table === 'columns') {
        fields = {
            title: data.title,
            type: data.type || 'task',
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted,
            encryptionSalt: data.encryptionSalt,
        };
    } else if (table === 'documents') {
        fields = {
            folder_id: data.folderId || '',
            title: data.title || '',
            content: data.content || '',
            updated_at: Date.now(),
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted,
            encryptionSalt: data.encryptionSalt,
        };
    } else if (table === 'documentFolders') {
        fields = {
            title: data.title,
            sort_order: data.sortOrder || 0,
            sync_version: Date.now(),
            isEncrypted: data.isEncrypted,
            encryptionSalt: data.encryptionSalt,
        };
    }

    await feishuRequest(
        `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/${recordId}`,
        {
            method: 'PUT',
            body: JSON.stringify({ fields }),
        }
    );
}

/**
 * Delete a single record
 */
async function deleteRecord(table: string, recordId: string): Promise<void> {
    const tableId = TABLE_IDS[table];
    if (!tableId) throw new Error(`Unknown table: ${table}`);

    await feishuRequest(
        `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/${recordId}`,
        { method: 'DELETE' }
    );
}

// ============= Main Handler =============

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    // CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    try {
        const { table, userId, recordId, data } = request.body || {};

        // POST - Create
        if (request.method === 'POST') {
            if (!table || !userId || !data) {
                return response.status(400).json({ error: 'Missing table, userId, or data' });
            }
            const newRecordId = await createRecord(table, userId, data);
            return response.status(200).json({ success: true, recordId: newRecordId });
        }

        // PUT - Update
        if (request.method === 'PUT') {
            if (!table || !recordId || !data) {
                return response.status(400).json({ error: 'Missing table, recordId, or data' });
            }
            await updateRecord(table, recordId, data);
            return response.status(200).json({ success: true });
        }

        // DELETE - Delete
        if (request.method === 'DELETE') {
            if (!table || !recordId) {
                return response.status(400).json({ error: 'Missing table or recordId' });
            }
            await deleteRecord(table, recordId);
            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
        console.error('Record API error:', error);
        return response.status(500).json({ error: error.message });
    }
}
