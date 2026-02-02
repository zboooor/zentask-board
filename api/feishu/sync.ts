import type { VercelRequest, VercelResponse } from '@vercel/node';
import { feishuRequest } from './token';

// Environment variables for table configuration
const APP_TOKEN = process.env.FEISHU_APP_TOKEN!;
const TASKS_TABLE_ID = process.env.FEISHU_TASKS_TABLE_ID!;
const IDEAS_TABLE_ID = process.env.FEISHU_IDEAS_TABLE_ID!;
const COLUMNS_TABLE_ID = process.env.FEISHU_COLUMNS_TABLE_ID!;

interface Column {
    id: string;
    title: string;
}

interface Task {
    id: string;
    columnId: string;
    content: string;
    completed: boolean;
}

interface Idea {
    id: string;
    columnId: string;
    content: string;
    isAiGenerated?: boolean;
}

interface UserData {
    columns: Column[];
    tasks: Task[];
    ideaColumns: Column[];
    ideas: Idea[];
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
 * Delete all records for a user in a table
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
    const [columnsRecords, tasksRecords, ideasRecords] = await Promise.all([
        fetchTableRecords(COLUMNS_TABLE_ID, userId),
        fetchTableRecords(TASKS_TABLE_ID, userId),
        fetchTableRecords(IDEAS_TABLE_ID, userId),
    ]);

    // Transform columns
    const taskColumns: Column[] = [];
    const ideaColumns: Column[] = [];

    columnsRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .forEach((record) => {
            const col: Column = {
                id: record.fields.column_id,
                title: record.fields.title,
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
            columnId: record.fields.column_id,
            content: record.fields.content,
            completed: record.fields.completed || false,
        }));

    // Transform ideas
    const ideas: Idea[] = ideasRecords
        .sort((a, b) => (a.fields.sort_order || 0) - (b.fields.sort_order || 0))
        .map((record) => ({
            id: record.fields.idea_id,
            columnId: record.fields.column_id,
            content: record.fields.content,
            isAiGenerated: record.fields.is_ai_generated || false,
        }));

    return { columns: taskColumns, tasks, ideaColumns, ideas };
}

/**
 * POST handler - Save all user data (full replacement)
 */
async function handlePost(userId: string, data: UserData): Promise<void> {
    // Delete existing data
    await Promise.all([
        deleteUserRecords(COLUMNS_TABLE_ID, userId),
        deleteUserRecords(TASKS_TABLE_ID, userId),
        deleteUserRecords(IDEAS_TABLE_ID, userId),
    ]);

    // Prepare column records
    const columnRecords = [
        ...data.columns.map((col, index) => ({
            fields: {
                column_id: col.id,
                user_id: userId,
                title: col.title,
                type: 'task',
                sort_order: index,
            },
        })),
        ...data.ideaColumns.map((col, index) => ({
            fields: {
                column_id: col.id,
                user_id: userId,
                title: col.title,
                type: 'idea',
                sort_order: index,
            },
        })),
    ];

    // Prepare task records
    const taskRecords = data.tasks.map((task, index) => ({
        fields: {
            task_id: task.id,
            user_id: userId,
            column_id: task.columnId,
            content: task.content,
            completed: task.completed,
            sort_order: index,
        },
    }));

    // Prepare idea records
    const ideaRecords = data.ideas.map((idea, index) => ({
        fields: {
            idea_id: idea.id,
            user_id: userId,
            column_id: idea.columnId,
            content: idea.content,
            is_ai_generated: idea.isAiGenerated || false,
            sort_order: index,
        },
    }));

    // Create all records
    await Promise.all([
        createRecords(COLUMNS_TABLE_ID, columnRecords),
        createRecords(TASKS_TABLE_ID, taskRecords),
        createRecords(IDEAS_TABLE_ID, ideaRecords),
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
        return response.status(500).json({ error: error.message });
    }
}
