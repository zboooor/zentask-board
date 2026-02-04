import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============= Token Management (inlined from token.ts) =============

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
async function getTenantAccessToken(): Promise<string> {
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
async function feishuRequest(
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

// ============= End Token Management =============

// Environment variables for table configuration
const APP_TOKEN = process.env.FEISHU_APP_TOKEN!;
const TASKS_TABLE_ID = process.env.FEISHU_TASKS_TABLE_ID!;
const IDEAS_TABLE_ID = process.env.FEISHU_IDEAS_TABLE_ID!;
const COLUMNS_TABLE_ID = process.env.FEISHU_COLUMNS_TABLE_ID!;
const DOCUMENTS_TABLE_ID = process.env.FEISHU_DOCUMENTS_TABLE_ID!;
const DOCUMENT_FOLDERS_TABLE_ID = process.env.FEISHU_DOCUMENT_FOLDERS_TABLE_ID!;


interface Column {
    id: string;
    recordId?: string;
    title: string;
    isEncrypted?: boolean;
    encryptionSalt?: string;
}

interface Task {
    id: string;
    recordId?: string;
    columnId: string;
    content: string;
    completed: boolean;
}

interface Idea {
    id: string;
    recordId?: string;
    columnId: string;
    content: string;
    isAiGenerated?: boolean;
}

interface Document {
    id: string;
    recordId?: string;
    folderId?: string;
    title: string;
    content: string;
    createdAt?: number;
    updatedAt?: number;
}

interface DocumentFolder {
    id: string;
    recordId?: string;
    title: string;
    isEncrypted?: boolean;
    encryptionSalt?: string;
}

interface UserData {
    columns: Column[];
    tasks: Task[];
    ideaColumns: Column[];
    ideas: Idea[];
    documents: Document[];
    documentFolders: DocumentFolder[];
}

/**
 * Fetch all records from a Bitable table filtered by user_id
 */
async function fetchTableRecords(tableId: string, userId: string): Promise<any[]> {
    const records: any[] = [];
    let pageToken: string | undefined;

    do {
        const params = new URLSearchParams({
            filter: `CurrentValue.[user_id]="${userId}"`,
            page_size: '500',
        });
        if (pageToken) {
            params.set('page_token', pageToken);
        }

        const response = await feishuRequest(
            `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records?${params}`
        );

        records.push(...(response.data?.items || []));
        pageToken = response.data?.page_token;
    } while (pageToken);

    return records;
}

/**
 * Delete all records for a user in a table (DEPRECATED - kept for reference)
 */
async function deleteUserRecords(tableId: string, userId: string): Promise<void> {
    const records = await fetchTableRecords(tableId, userId);
    const recordIds = records.map((r) => r.record_id);

    if (recordIds.length === 0) return;

    // Delete in batches of 500
    for (let i = 0; i < recordIds.length; i += 500) {
        const batch = recordIds.slice(i, i + 500);
        await feishuRequest(
            `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/batch_delete`,
            {
                method: 'POST',
                body: JSON.stringify({ records: batch }),
            }
        );
    }
}

/**
 * Delete records by their IDs (safe version - only deletes specific records)
 */
async function deleteRecordsByIds(tableId: string, recordIds: string[]): Promise<void> {
    if (recordIds.length === 0) return;

    // Delete in batches of 500
    for (let i = 0; i < recordIds.length; i += 500) {
        const batch = recordIds.slice(i, i + 500);
        await feishuRequest(
            `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/batch_delete`,
            {
                method: 'POST',
                body: JSON.stringify({ records: batch }),
            }
        );
    }
}

/**
 * Create records in a table
 */
async function createRecords(tableId: string, records: any[]): Promise<void> {
    if (records.length === 0) return;

    // Create in batches of 500
    for (let i = 0; i < records.length; i += 500) {
        const batch = records.slice(i, i + 500);
        await feishuRequest(
            `/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/batch_create`,
            {
                method: 'POST',
                body: JSON.stringify({ records: batch }),
            }
        );
    }
}

/**
 * GET handler - Fetch all user data
 */
async function handleGet(userId: string): Promise<UserData> {
    // Fetch all tables in parallel
    const [columnsRecords, tasksRecords, ideasRecords, documentsRecords, documentFoldersRecords] = await Promise.all([
        fetchTableRecords(COLUMNS_TABLE_ID, userId),
        fetchTableRecords(TASKS_TABLE_ID, userId),
        fetchTableRecords(IDEAS_TABLE_ID, userId),
        fetchTableRecords(DOCUMENTS_TABLE_ID, userId),
        fetchTableRecords(DOCUMENT_FOLDERS_TABLE_ID, userId),
    ]);

    // Transform columns
    const taskColumns: Column[] = [];
    const ideaColumns: Column[] = [];

    columnsRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .forEach((record) => {
            const col: Column = {
                id: record.fields.column_id,
                recordId: record.record_id,  // Add Feishu record ID
                title: record.fields.title,
                isEncrypted: record.fields.isEncrypted || false,
                encryptionSalt: record.fields.encryptionSalt || undefined,
            };
            if (record.fields.type === 'idea') {
                ideaColumns.push(col);
            } else {
                taskColumns.push(col);
            }
        });

    // Transform tasks
    const tasks: Task[] = tasksRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .map((record) => ({
            id: record.fields.task_id,
            recordId: record.record_id,  // Add Feishu record ID
            columnId: record.fields.column_id,
            content: record.fields.content,
            completed: record.fields.completed || false,
        }));

    // Transform ideas
    const ideas: Idea[] = ideasRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .map((record) => ({
            id: record.fields.idea_id,
            recordId: record.record_id,  // Add Feishu record ID
            columnId: record.fields.column_id,
            content: record.fields.content,
            isAiGenerated: record.fields.is_ai_generated || false,
        }));

    // Transform documents
    const documents: Document[] = documentsRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .map((record) => ({
            id: record.fields.doc_id,
            recordId: record.record_id,
            folderId: record.fields.folder_id || undefined,
            title: record.fields.title || '',
            content: record.fields.content || '',
            createdAt: record.fields.created_at,
            updatedAt: record.fields.updated_at,
        }));

    // Transform document folders
    const documentFolders: DocumentFolder[] = documentFoldersRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .map((record) => ({
            id: record.fields.folder_id,
            recordId: record.record_id,
            title: record.fields.title || '',
            isEncrypted: record.fields.isEncrypted || false,
            encryptionSalt: record.fields.encryptionSalt || '',
        }));

    return { columns: taskColumns, tasks, ideaColumns, ideas, documents, documentFolders };
}

/**
 * POST handler - Save all user data (safe sync with sync_version)
 * Strategy: Create new records FIRST, then delete old records
 * This prevents data loss if network fails during creation
 */
async function handlePost(userId: string, data: UserData): Promise<void> {
    // Generate a unique sync version timestamp
    const syncVersion = Date.now();

    // Step 1: Fetch old record IDs BEFORE creating new ones
    const [oldColumns, oldTasks, oldIdeas, oldDocs, oldFolders] = await Promise.all([
        fetchTableRecords(COLUMNS_TABLE_ID, userId),
        fetchTableRecords(TASKS_TABLE_ID, userId),
        fetchTableRecords(IDEAS_TABLE_ID, userId),
        fetchTableRecords(DOCUMENTS_TABLE_ID, userId),
        fetchTableRecords(DOCUMENT_FOLDERS_TABLE_ID, userId),
    ]);

    const oldColumnIds = oldColumns.map(r => r.record_id);
    const oldTaskIds = oldTasks.map(r => r.record_id);
    const oldIdeaIds = oldIdeas.map(r => r.record_id);
    const oldDocIds = oldDocs.map(r => r.record_id);
    const oldFolderIds = oldFolders.map(r => r.record_id);

    // Step 2: Prepare NEW records with sync_version
    const columnRecords = [
        ...data.columns.map((col, index) => ({
            fields: {
                column_id: col.id,
                user_id: userId,
                title: col.title,
                type: 'task',
                sort_order: index,
                sync_version: syncVersion,
            },
        })),
        ...data.ideaColumns.map((col, index) => ({
            fields: {
                column_id: col.id,
                user_id: userId,
                title: col.title,
                type: 'idea',
                sort_order: index,
                sync_version: syncVersion,
            },
        })),
    ];

    const taskRecords = data.tasks.map((task, index) => ({
        fields: {
            task_id: task.id,
            user_id: userId,
            column_id: task.columnId,
            content: task.content,
            completed: task.completed,
            sort_order: index,
            sync_version: syncVersion,
        },
    }));

    const ideaRecords = data.ideas.map((idea, index) => ({
        fields: {
            idea_id: idea.id,
            user_id: userId,
            column_id: idea.columnId,
            content: idea.content,
            is_ai_generated: idea.isAiGenerated || false,
            sort_order: index,
            sync_version: syncVersion,
        },
    }));

    const documentRecords = (data.documents || []).map((doc, index) => ({
        fields: {
            doc_id: doc.id,
            user_id: userId,
            folder_id: doc.folderId || '',
            title: doc.title,
            content: doc.content,
            created_at: doc.createdAt || Date.now(),
            updated_at: doc.updatedAt || Date.now(),
            sort_order: index,
            sync_version: syncVersion,
        },
    }));

    const documentFolderRecords = (data.documentFolders || []).map((folder, index) => ({
        fields: {
            folder_id: folder.id,
            user_id: userId,
            title: folder.title,
            isEncrypted: folder.isEncrypted || false,
            encryptionSalt: folder.encryptionSalt || '',
            sort_order: index,
            sync_version: syncVersion,
        },
    }));

    // Step 3: Create NEW records first (safe - old data still exists if this fails)
    await Promise.all([
        createRecords(COLUMNS_TABLE_ID, columnRecords),
        createRecords(TASKS_TABLE_ID, taskRecords),
        createRecords(IDEAS_TABLE_ID, ideaRecords),
        createRecords(DOCUMENTS_TABLE_ID, documentRecords),
        createRecords(DOCUMENT_FOLDERS_TABLE_ID, documentFolderRecords),
    ]);

    // Step 4: Delete OLD records only after successful creation
    // If this fails, next sync will clean up duplicates via sync_version
    await Promise.all([
        deleteRecordsByIds(COLUMNS_TABLE_ID, oldColumnIds),
        deleteRecordsByIds(TASKS_TABLE_ID, oldTaskIds),
        deleteRecordsByIds(IDEAS_TABLE_ID, oldIdeaIds),
        deleteRecordsByIds(DOCUMENTS_TABLE_ID, oldDocIds),
        deleteRecordsByIds(DOCUMENT_FOLDERS_TABLE_ID, oldFolderIds),
    ]);
}

/**
 * Main handler
 */
export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    // CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    try {
        if (request.method === 'GET') {
            const userId = request.query.user as string;
            if (!userId) {
                return response.status(400).json({ error: 'Missing user parameter' });
            }

            const data = await handleGet(userId);
            return response.status(200).json(data);
        }

        if (request.method === 'POST') {
            const { userId, data } = request.body;
            if (!userId || !data) {
                return response.status(400).json({ error: 'Missing userId or data in body' });
            }

            await handlePost(userId, data);
            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
        console.error('Sync API error:', error);
        console.error('Error stack:', error.stack);
        return response.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
