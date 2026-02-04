/**
 * Feishu Sync Service
 * Frontend service for communicating with the Feishu sync API
 */

import { Column as ColumnType, Task, Idea, Document, DocumentFolder, Id } from '../types';
import { encryptContent, decryptContent, isEncryptedContent } from '../utils/crypto';

export interface UserData {
    columns: ColumnType[];
    tasks: Task[];
    ideaColumns: ColumnType[];
    ideas: Idea[];
    documents: Document[];
    documentFolders: DocumentFolder[];
}

// Password map type: columnId -> password
export type PasswordMap = Map<Id, string>;

// API base URL - in production this will be relative, in dev it points to Vercel dev server
const API_BASE = '/api/feishu';

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

// Debounce timer for save operations
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 1500;

// Local storage key for offline queue
const OFFLINE_QUEUE_KEY = 'zentask_offline_queue';

// Local storage key for backup before sync
const BACKUP_KEY = 'zentask_data_backup';

/**
 * Fetch user data from Feishu
 */
export async function fetchUserData(userId: string): Promise<UserData | null> {
    try {
        const response = await fetch(`${API_BASE}/sync?user=${encodeURIComponent(userId)}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch user data:', error);
        throw error;
    }
}

/**
 * Save user data to Feishu (debounced)
 */
export function saveUserDataDebounced(
    userId: string,
    data: UserData,
    onStatusChange: (status: SyncStatus) => void
): void {
    // Clear previous timer
    if (saveTimer) {
        clearTimeout(saveTimer);
    }

    onStatusChange('syncing');

    // Set new timer
    saveTimer = setTimeout(async () => {
        try {
            await saveUserDataImmediate(userId, data);
            onStatusChange('synced');
        } catch (error) {
            console.error('Save failed:', error);
            // Queue for offline sync
            queueOfflineData(userId, data);
            onStatusChange('offline');
        }
    }, SAVE_DEBOUNCE_MS);
}

/**
 * Encrypt user data before sync
 * Encrypts content of tasks/ideas that belong to encrypted columns
 * SECURITY: Tasks/ideas in encrypted columns without available password will be excluded from sync
 */
async function encryptDataForSync(data: UserData, passwords: PasswordMap): Promise<UserData> {
    // Create a set of encrypted column IDs with passwords
    const encryptedWithPassword = new Set<Id>();
    const columnPasswords = new Map<Id, string>();

    // Track all encrypted column IDs (with or without password)
    const allEncryptedColumnIds = new Set<Id>();

    // Collect encrypted columns (task columns)
    for (const col of data.columns) {
        if (col.isEncrypted) {
            allEncryptedColumnIds.add(col.id);
            if (passwords.has(col.id)) {
                encryptedWithPassword.add(col.id);
                columnPasswords.set(col.id, passwords.get(col.id)!);
            }
        }
    }

    // Collect encrypted columns (idea columns)
    for (const col of data.ideaColumns) {
        if (col.isEncrypted) {
            allEncryptedColumnIds.add(col.id);
            if (passwords.has(col.id)) {
                encryptedWithPassword.add(col.id);
                columnPasswords.set(col.id, passwords.get(col.id)!);
            }
        }
    }

    // Encrypt tasks - SECURITY: skip unencrypted content in encrypted columns without password
    const encryptedTasks = await Promise.all(
        data.tasks
            .filter(task => {
                // If task is in an encrypted column without password and content is NOT already encrypted, skip it
                if (allEncryptedColumnIds.has(task.columnId) &&
                    !encryptedWithPassword.has(task.columnId) &&
                    !isEncryptedContent(task.content)) {
                    console.warn(`Skipping task sync: encrypted column ${task.columnId} missing password`);
                    return false;
                }
                return true;
            })
            .map(async (task) => {
                if (encryptedWithPassword.has(task.columnId) && !isEncryptedContent(task.content)) {
                    const password = columnPasswords.get(task.columnId)!;
                    const encryptedContent = await encryptContent(task.content, password);
                    return { ...task, content: encryptedContent };
                }
                return task;
            })
    );

    // Encrypt ideas - SECURITY: skip unencrypted content in encrypted columns without password
    const encryptedIdeas = await Promise.all(
        data.ideas
            .filter(idea => {
                if (allEncryptedColumnIds.has(idea.columnId) &&
                    !encryptedWithPassword.has(idea.columnId) &&
                    !isEncryptedContent(idea.content)) {
                    console.warn(`Skipping idea sync: encrypted column ${idea.columnId} missing password`);
                    return false;
                }
                return true;
            })
            .map(async (idea) => {
                if (encryptedWithPassword.has(idea.columnId) && !isEncryptedContent(idea.content)) {
                    const password = columnPasswords.get(idea.columnId)!;
                    const encryptedContent = await encryptContent(idea.content, password);
                    return { ...idea, content: encryptedContent };
                }
                return idea;
            })
    );

    // Encrypt column titles for encrypted columns
    // SECURITY: Keep already-encrypted titles, but skip decrypted titles without password
    const encryptedColumns = await Promise.all(
        data.columns.map(async (col) => {
            if (col.isEncrypted) {
                if (passwords.has(col.id)) {
                    // Have password - encrypt if needed
                    if (!isEncryptedContent(col.title)) {
                        const password = passwords.get(col.id)!;
                        const encryptedTitle = await encryptContent(col.title, password);
                        return { ...col, title: encryptedTitle };
                    }
                } else if (!isEncryptedContent(col.title)) {
                    // No password and title is decrypted - keep as "[加密主题]" placeholder
                    console.warn(`Column ${col.id} title is decrypted but no password available`);
                    return { ...col, title: '[加密主题]' };
                }
            }
            return col;
        })
    );

    const encryptedIdeaColumns = await Promise.all(
        data.ideaColumns.map(async (col) => {
            if (col.isEncrypted) {
                if (passwords.has(col.id)) {
                    if (!isEncryptedContent(col.title)) {
                        const password = passwords.get(col.id)!;
                        const encryptedTitle = await encryptContent(col.title, password);
                        return { ...col, title: encryptedTitle };
                    }
                } else if (!isEncryptedContent(col.title)) {
                    console.warn(`Idea column ${col.id} title is decrypted but no password available`);
                    return { ...col, title: '[加密主题]' };
                }
            }
            return col;
        })
    );

    return {
        columns: encryptedColumns,
        tasks: encryptedTasks,
        ideaColumns: encryptedIdeaColumns,
        ideas: encryptedIdeas,
        documents: data.documents, // Documents have their own encryption
        documentFolders: data.documentFolders
    };
}

/**
 * Decrypt user data after fetch
 * Decrypts content of tasks/ideas that belong to encrypted columns
 */
export async function decryptDataAfterFetch(data: UserData, passwords: PasswordMap): Promise<UserData> {
    // Create maps for quick lookup
    const columnPasswords = new Map<Id, string>();

    // Collect passwords for encrypted columns
    for (const col of data.columns) {
        if (col.isEncrypted && passwords.has(col.id)) {
            columnPasswords.set(col.id, passwords.get(col.id)!);
        }
    }
    for (const col of data.ideaColumns) {
        if (col.isEncrypted && passwords.has(col.id)) {
            columnPasswords.set(col.id, passwords.get(col.id)!);
        }
    }

    // Decrypt tasks
    const decryptedTasks = await Promise.all(
        data.tasks.map(async (task) => {
            if (columnPasswords.has(task.columnId) && isEncryptedContent(task.content)) {
                try {
                    const password = columnPasswords.get(task.columnId)!;
                    const decryptedContent = await decryptContent(task.content, password);
                    return { ...task, content: decryptedContent };
                } catch {
                    return task; // Keep encrypted if decryption fails
                }
            }
            return task;
        })
    );

    // Decrypt ideas
    const decryptedIdeas = await Promise.all(
        data.ideas.map(async (idea) => {
            if (columnPasswords.has(idea.columnId) && isEncryptedContent(idea.content)) {
                try {
                    const password = columnPasswords.get(idea.columnId)!;
                    const decryptedContent = await decryptContent(idea.content, password);
                    return { ...idea, content: decryptedContent };
                } catch {
                    return idea;
                }
            }
            return idea;
        })
    );

    // Decrypt column titles
    const decryptedColumns = await Promise.all(
        data.columns.map(async (col) => {
            if (col.isEncrypted && passwords.has(col.id) && isEncryptedContent(col.title)) {
                try {
                    const password = passwords.get(col.id)!;
                    const decryptedTitle = await decryptContent(col.title, password);
                    return { ...col, title: decryptedTitle };
                } catch {
                    return col;
                }
            }
            return col;
        })
    );

    const decryptedIdeaColumns = await Promise.all(
        data.ideaColumns.map(async (col) => {
            if (col.isEncrypted && passwords.has(col.id) && isEncryptedContent(col.title)) {
                try {
                    const password = passwords.get(col.id)!;
                    const decryptedTitle = await decryptContent(col.title, password);
                    return { ...col, title: decryptedTitle };
                } catch {
                    return col;
                }
            }
            return col;
        })
    );

    return {
        columns: decryptedColumns,
        tasks: decryptedTasks,
        ideaColumns: decryptedIdeaColumns,
        ideas: decryptedIdeas,
        documents: data.documents,
        documentFolders: data.documentFolders
    };
}

/**
 * Save user data immediately (no debounce)
 * Includes local backup for safety and encryption for encrypted columns
 */
export async function saveUserDataImmediate(
    userId: string,
    data: UserData,
    passwords?: PasswordMap
): Promise<void> {
    // Step 1: Backup current data to localStorage before syncing
    localStorage.setItem(BACKUP_KEY, JSON.stringify({
        userId,
        data,
        timestamp: Date.now()
    }));

    // Step 2: Encrypt data if passwords are provided
    const dataToSave = passwords && passwords.size > 0
        ? await encryptDataForSync(data, passwords)
        : data;

    const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, data: dataToSave }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error('Sync error details:', errorBody);
        throw new Error(`HTTP ${response.status}: ${errorBody.error || response.statusText}`);
    }

    // Step 3: Clear backup after successful sync
    localStorage.removeItem(BACKUP_KEY);
}

/**
 * Get backup data if available (for recovery after failed sync)
 */
export function getBackupData(): { userId: string; data: UserData; timestamp: number } | null {
    const backup = localStorage.getItem(BACKUP_KEY);
    return backup ? JSON.parse(backup) : null;
}

/**
 * Clear backup data manually
 */
export function clearBackupData(): void {
    localStorage.removeItem(BACKUP_KEY);
}

// ============= Single Record CRUD Operations =============

export type TableType = 'tasks' | 'ideas' | 'columns' | 'documents' | 'documentFolders';

// Record data types for API calls
export interface RecordData {
    id?: string | number;
    columnId?: string | number;
    folderId?: string | number;
    content?: string;
    title?: string;
    completed?: boolean;
    isAiGenerated?: boolean;
    isEncrypted?: boolean;
    encryptionSalt?: string;
    type?: 'task' | 'idea';
    sortOrder?: number;
    createdAt?: number;
    updatedAt?: number;
}

/**
 * Create a single record in Feishu
 * Returns the new recordId
 */
export async function createRecord(
    userId: string,
    table: TableType,
    data: RecordData
): Promise<string> {
    const response = await fetch(`${API_BASE}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, userId, data }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to create record`);
    }

    const result = await response.json();
    return result.recordId;
}

/**
 * Update a single record in Feishu
 */
export async function updateRecord(
    table: TableType,
    recordId: string,
    data: RecordData
): Promise<void> {
    const response = await fetch(`${API_BASE}/record`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, recordId, data }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to update record`);
    }
}

/**
 * Delete a single record in Feishu
 */
export async function deleteRecord(
    table: TableType,
    recordId: string
): Promise<void> {
    const response = await fetch(`${API_BASE}/record`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, recordId }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to delete record`);
    }
}

/**
 * Queue data for offline sync
 */
function queueOfflineData(userId: string, data: UserData): void {
    localStorage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify({ userId, data, timestamp: Date.now() })
    );
}

/**
 * Process offline queue when back online
 */
export async function processOfflineQueue(
    onStatusChange: (status: SyncStatus) => void
): Promise<boolean> {
    const queuedData = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queuedData) return false;

    try {
        const { userId, data } = JSON.parse(queuedData);
        onStatusChange('syncing');
        await saveUserDataImmediate(userId, data);
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        onStatusChange('synced');
        return true;
    } catch (error) {
        console.error('Failed to process offline queue:', error);
        onStatusChange('offline');
        return false;
    }
}

/**
 * Check if there's pending offline data
 */
export function hasOfflineData(): boolean {
    return localStorage.getItem(OFFLINE_QUEUE_KEY) !== null;
}
