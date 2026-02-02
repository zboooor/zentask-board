/**
 * Feishu Sync Service
 * Frontend service for communicating with the Feishu sync API
 */

import { Column as ColumnType, Task, Idea } from '../types';

export interface UserData {
    columns: ColumnType[];
    tasks: Task[];
    ideaColumns: ColumnType[];
    ideas: Idea[];
}

// API base URL - in production this will be relative, in dev it points to Vercel dev server
const API_BASE = '/api/feishu';

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

// Debounce timer for save operations
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 1500;

// Local storage key for offline queue
const OFFLINE_QUEUE_KEY = 'zentask_offline_queue';

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
 * Save user data immediately (no debounce)
 */
export async function saveUserDataImmediate(userId: string, data: UserData): Promise<void> {
    const response = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, data }),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
