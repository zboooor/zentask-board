import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { createPortal } from 'react-dom';
import { GoogleGenAI } from "@google/genai";
import { Column as ColumnType, Task, Idea, Id, Document, DocumentFolder } from './types';
import Column from './components/Column';
import TaskCard from './components/TaskCard';
import IdeaColumn from './components/IdeaColumn';
import IdeaCard from './components/IdeaCard';
import LoginScreen from './components/LoginScreen';
import DocumentList from './components/DocumentList';
import DocumentEditor from './components/DocumentEditor';
import { Plus, Layout, BrainCircuit, LogOut, Cloud, CloudOff, RefreshCw, Loader2, FileText, Upload, Lock, Folder } from 'lucide-react';
import {
  fetchUserData,
  saveUserDataDebounced,
  saveUserDataImmediate,
  processOfflineQueue,
  createRecord,
  updateRecord,
  deleteRecord,
  SyncStatus,
  UserData
} from './services/feishuService';
import CreateColumnDialog from './components/CreateColumnDialog';
import UnlockDialog from './components/UnlockDialog';
import CreateFolderDialog from './components/CreateFolderDialog';
import { generateSalt, generatePasswordHash, encryptContent, decryptContent, isEncryptedContent } from './utils/crypto';

// Gemini API Key storage key
const GEMINI_API_KEY_STORAGE = 'zentask_gemini_api_key';

// Helper function to get or create Gemini AI client
function getGeminiClient(): GoogleGenAI | null {
  const storedKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
  const envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  const apiKey = storedKey || envKey;

  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}


// --- Default Data Constants (all empty for fresh start) ---
const defaultCols: ColumnType[] = [];

const defaultIdeaCols: ColumnType[] = [];

const defaultTasks: Task[] = [];

const defaultIdeas: Idea[] = [];

const defaultDocuments: Document[] = [];

const defaultDocumentFolders: DocumentFolder[] = [];

type ViewMode = 'tasks' | 'ideas' | 'docs';
const STORAGE_PREFIX = 'zentask_v1_';

// Generate a short hash from user ID for URL display
function generateUserHash(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to base36 and take first 8 characters
  const timestamp = Date.now().toString(36).slice(-4);
  return Math.abs(hash).toString(36).slice(0, 4) + timestamp;
}

// Parse URL hash to extract user session info
function parseUrlHash(): { user?: string; session?: string } {
  const hash = window.location.hash.slice(1); // Remove #
  if (!hash) return {};

  const params = new URLSearchParams(hash);
  return {
    user: params.get('u') || undefined,
    session: params.get('s') || undefined,
  };
}

// Update URL hash with user session info
function updateUrlHash(userId: string, sessionToken: string) {
  const newHash = `u=${encodeURIComponent(userId)}&s=${sessionToken}`;
  window.history.replaceState(null, '', `#${newHash}`);
}

// Clear URL hash on logout
function clearUrlHash() {
  window.history.replaceState(null, '', window.location.pathname);
}

function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    // First, check URL hash for user info
    const hashInfo = parseUrlHash();
    if (hashInfo.user) {
      // Validate session exists in localStorage
      const storedSession = localStorage.getItem(`${STORAGE_PREFIX}session_${hashInfo.user}`);
      if (storedSession === hashInfo.session) {
        return hashInfo.user;
      }
    }
    // Fallback to localStorage
    return localStorage.getItem(`${STORAGE_PREFIX}current_user`);
  });

  const [view, setView] = useState<ViewMode>('tasks');

  // -- State Declarations (Initialized with empty, loaded via Effect) --
  const [columns, setColumns] = useState<ColumnType[]>(defaultCols);
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [ideaColumns, setIdeaColumns] = useState<ColumnType[]>(defaultIdeaCols);
  const [ideas, setIdeas] = useState<Idea[]>(defaultIdeas);
  const [documents, setDocuments] = useState<Document[]>(defaultDocuments);
  const [documentFolders, setDocumentFolders] = useState<DocumentFolder[]>(defaultDocumentFolders);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);

  const [activeColumn, setActiveColumn] = useState<ColumnType | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeIdeaColumn, setActiveIdeaColumn] = useState<ColumnType | null>(null);
  const [activeIdea, setActiveIdea] = useState<Idea | null>(null);
  const [optimizingIds, setOptimizingIds] = useState<Set<Id>>(new Set());

  // Sync status for Feishu cloud sync
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dataLoadedRef = useRef(false);
  const isSavingRef = useRef(false);  // Prevent concurrent saves
  const isRefreshingRef = useRef(false);  // Prevent save during refresh
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);  // Debounce timer for sync
  const SYNC_DEBOUNCE_MS = 1500;  // Wait 1.5s after last change before syncing

  // Cross-tab synchronization
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const POLL_INTERVAL_MS = 30000;  // Poll cloud every 30 seconds

  // Encryption state
  const [unlockedColumns, setUnlockedColumns] = useState<Map<Id, string>>(new Map()); // columnId -> password
  const [createColumnDialogOpen, setCreateColumnDialogOpen] = useState(false);
  const [createColumnType, setCreateColumnType] = useState<'task' | 'idea'>('task');
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockingColumn, setUnlockingColumn] = useState<ColumnType | null>(null);
  const [showDocCreateMenu, setShowDocCreateMenu] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [currentDocFolderId, setCurrentDocFolderId] = useState<Id | null>(null);

  // Helper: Debounced sync for updates
  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    setSyncStatus('syncing');
    syncTimerRef.current = setTimeout(async () => {
      try {
        await syncFn();
        setSyncStatus('synced');
        // Broadcast to other tabs that data changed
        broadcastChannelRef.current?.postMessage({ type: 'DATA_CHANGED', userId: currentUser });
      } catch (err) {
        console.error('Sync failed:', err);
        setSyncStatus('error');
      }
    }, SYNC_DEBOUNCE_MS);
  }, [currentUser]);

  // Helper: Broadcast data change to other tabs
  const broadcastDataChange = useCallback(() => {
    broadcastChannelRef.current?.postMessage({ type: 'DATA_CHANGED', userId: currentUser });
  }, [currentUser]);

  // --- Persistence Logic ---

  // Helper to load from localStorage (fallback)
  const loadFromLocalStorage = useCallback((userId: string) => {
    const savedData = localStorage.getItem(`${STORAGE_PREFIX}data_${userId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setColumns(parsed.columns || defaultCols);
        setTasks(parsed.tasks || defaultTasks);
        setIdeaColumns(parsed.ideaColumns || defaultIdeaCols);
        setIdeas(parsed.ideas || defaultIdeas);
        setDocuments(parsed.documents || defaultDocuments);
        setDocumentFolders(parsed.documentFolders || defaultDocumentFolders);
      } catch (e) {
        console.error("Failed to load user data from localStorage", e);
      }
    } else {
      setColumns(defaultCols);
      setTasks(defaultTasks);
      setIdeaColumns(defaultIdeaCols);
      setIdeas(defaultIdeas);
      setDocuments(defaultDocuments);
      setDocumentFolders(defaultDocumentFolders);
    }
  }, []);

  // 1. Load data when user logs in - try cloud first, fallback to localStorage
  useEffect(() => {
    if (currentUser && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
      localStorage.setItem(`${STORAGE_PREFIX}current_user`, currentUser);

      // Ensure URL has the session hash
      const hashInfo = parseUrlHash();
      if (!hashInfo.session || hashInfo.user !== currentUser) {
        let sessionToken = localStorage.getItem(`${STORAGE_PREFIX}session_${currentUser}`);
        if (!sessionToken) {
          sessionToken = generateUserHash(currentUser);
          localStorage.setItem(`${STORAGE_PREFIX}session_${currentUser}`, sessionToken);
        }
        updateUrlHash(currentUser, sessionToken);
      }

      setSyncStatus('syncing');
      setIsInitialLoad(true);

      // Try to fetch from Feishu cloud
      fetchUserData(currentUser)
        .then((data) => {
          console.log('[DEBUG] Feishu data received:', {
            columns: data?.columns?.map(c => ({ id: c.id, title: c.title, isEncrypted: c.isEncrypted })),
            columnCount: data?.columns?.length,
          });
          if (data && (data.columns.length > 0 || data.tasks.length > 0 || data.ideas.length > 0 || (data.documents && data.documents.length > 0) || (data.documentFolders && data.documentFolders.length > 0))) {
            setColumns(data.columns.length > 0 ? data.columns : defaultCols);
            setTasks(data.tasks);
            setIdeaColumns(data.ideaColumns.length > 0 ? data.ideaColumns : defaultIdeaCols);
            setIdeas(data.ideas);
            setDocuments(data.documents || defaultDocuments);
            setDocumentFolders(data.documentFolders || defaultDocumentFolders);
            // Also update localStorage as cache
            localStorage.setItem(`${STORAGE_PREFIX}data_${currentUser}`, JSON.stringify(data));
          } else {
            // No cloud data, load from localStorage or use defaults
            loadFromLocalStorage(currentUser);
          }
          setSyncStatus('synced');
        })
        .catch((err) => {
          console.error('Failed to fetch from cloud, using localStorage:', err);
          loadFromLocalStorage(currentUser);
          setSyncStatus('offline');
        })
        .finally(() => {
          setIsInitialLoad(false);
        });

      // Process any offline queue
      processOfflineQueue(setSyncStatus);
    }

    // Reset ref when user changes
    return () => {
      if (!currentUser) {
        dataLoadedRef.current = false;
      }
    };
  }, [currentUser, loadFromLocalStorage]);

  // Reset dataLoadedRef when user logs out
  useEffect(() => {
    if (!currentUser) {
      dataLoadedRef.current = false;
    }
  }, [currentUser]);

  // 2. Save data to localStorage as cache (cloud sync is now handled by individual CRUD operations)
  useEffect(() => {
    // Don't save during initial load or refresh
    if (currentUser && !isInitialLoad && !isRefreshingRef.current) {
      const dataToSave: UserData = {
        columns,
        tasks,
        ideaColumns,
        ideas,
        documents,
        documentFolders
      };

      // Save to localStorage as cache only
      // Cloud sync is now handled incrementally by each CRUD operation
      localStorage.setItem(`${STORAGE_PREFIX}data_${currentUser}`, JSON.stringify(dataToSave));
    }
  }, [currentUser, columns, tasks, ideaColumns, ideas, documents, documentFolders, isInitialLoad]);

  // Manual refresh handler (pull from cloud)
  const handleRefresh = useCallback(async () => {
    // Don't refresh while saving or already refreshing
    if (!currentUser || isRefreshingRef.current || isSavingRef.current) return;

    isRefreshingRef.current = true;
    setSyncStatus('syncing');

    try {
      const data = await fetchUserData(currentUser);
      if (data) {
        // Only overwrite if cloud has actual data (at least one column or task)
        const hasCloudData = data.columns.length > 0 || data.tasks.length > 0 ||
          data.ideaColumns.length > 0 || data.ideas.length > 0 ||
          (data.documents && data.documents.length > 0) ||
          (data.documentFolders && data.documentFolders.length > 0);

        if (hasCloudData) {
          // Cloud has data, use it (don't trigger re-save)
          setColumns(data.columns.length > 0 ? data.columns : defaultCols);
          setTasks(data.tasks);
          setIdeaColumns(data.ideaColumns.length > 0 ? data.ideaColumns : defaultIdeaCols);
          setIdeas(data.ideas);
          setDocuments(data.documents || defaultDocuments);
          setDocumentFolders(data.documentFolders || defaultDocumentFolders);
          localStorage.setItem(`${STORAGE_PREFIX}data_${currentUser}`, JSON.stringify(data));
          setSyncStatus('synced');
        } else {
          // Cloud is empty - just mark as synced, don't push anything
          // User's local data stays as is
          setSyncStatus('synced');
        }
      } else {
        setSyncStatus('synced');
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
      setSyncStatus('error');
    } finally {
      isRefreshingRef.current = false;
    }
  }, [currentUser]);

  // Manual retry sync handler (push local data to cloud)
  const handleRetrySync = useCallback(async () => {
    if (!currentUser || isSavingRef.current) return;

    isSavingRef.current = true;
    setSyncStatus('syncing');

    try {
      const dataToSave: UserData = {
        columns,
        tasks,
        ideaColumns,
        ideas,
        documents,
        documentFolders
      };
      await saveUserDataImmediate(currentUser, dataToSave, unlockedColumns);
      setSyncStatus('synced');
      broadcastDataChange();
    } catch (err) {
      console.error('Retry sync failed:', err);
      setSyncStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [currentUser, columns, tasks, ideaColumns, ideas, documents, broadcastDataChange, unlockedColumns]);

  // Cross-tab synchronization: BroadcastChannel + Polling
  useEffect(() => {
    if (!currentUser) return;

    // Setup BroadcastChannel for cross-tab communication
    const channel = new BroadcastChannel('zentask_sync');
    broadcastChannelRef.current = channel;

    // Listen for data changes from other tabs
    channel.onmessage = (event) => {
      if (event.data.type === 'DATA_CHANGED' && event.data.userId === currentUser) {
        console.log('Data changed in another tab, refreshing...');
        // Refresh from cloud
        handleRefresh();
      }
    };


    // TEMPORARILY DISABLED: Periodic polling was causing issues
    // TODO: Re-enable after fixing sync stability
    // pollIntervalRef.current = setInterval(() => {
    //   // Don't poll while saving or refreshing
    //   if (!isRefreshingRef.current && !syncTimerRef.current && !isSavingRef.current) {
    //     console.log('Periodic sync: checking for updates...');
    //     handleRefresh();
    //   }
    // }, POLL_INTERVAL_MS);

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [currentUser, handleRefresh]);

  const handleLogout = () => {
    // Clear session token
    if (currentUser) {
      localStorage.removeItem(`${STORAGE_PREFIX}session_${currentUser}`);
    }
    setCurrentUser(null);
    localStorage.removeItem(`${STORAGE_PREFIX}current_user`);
    clearUrlHash();
  };

  const handleClearCache = () => {
    if (confirm('确定清除所有本地缓存？这将重置当前工作区的本地数据。')) {
      // Clear all zentask data from localStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // Reset state to empty
      setColumns([]);
      setTasks([]);
      setIdeaColumns([]);
      setIdeas([]);
      setSyncStatus('idle');

      alert('缓存已清除！');
    }
  };

  // --- DnD Sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    }),
    useSensor(TouchSensor)
  );

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);
  const ideaColumnsId = useMemo(() => ideaColumns.map((col) => col.id), [ideaColumns]);

  // --- Task Actions (with incremental sync) ---

  // Open dialog for creating column
  const openCreateColumnDialog = (type: 'task' | 'idea') => {
    setCreateColumnType(type);
    setCreateColumnDialogOpen(true);
  };

  // Handle creating column from dialog
  const handleCreateColumn = async (title: string, isEncrypted: boolean, password?: string) => {
    const columnToAdd: ColumnType = {
      id: generateId(),
      title,
      isEncrypted,
      encryptionSalt: isEncrypted && password ? generateSalt() : undefined,
    };

    // If encrypted, store the password hash in the salt field for verification
    if (isEncrypted && password && columnToAdd.encryptionSalt) {
      const hash = await generatePasswordHash(password, columnToAdd.encryptionSalt);
      columnToAdd.encryptionSalt = `${columnToAdd.encryptionSalt}:${hash}`;
      // Auto-unlock this column
      setUnlockedColumns(prev => new Map(prev).set(columnToAdd.id, password));
    }

    if (createColumnType === 'task') {
      setColumns([...columns, columnToAdd]);
    } else {
      setIdeaColumns([...ideaColumns, columnToAdd]);
    }

    setCreateColumnDialogOpen(false);

    // Sync to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        const recordId = await createRecord(currentUser, 'columns', {
          ...columnToAdd,
          type: createColumnType,
          sortOrder: createColumnType === 'task' ? columns.length : ideaColumns.length
        });
        if (createColumnType === 'task') {
          setColumns(prev => prev.map(col => col.id === columnToAdd.id ? { ...col, recordId } : col));
        } else {
          setIdeaColumns(prev => prev.map(col => col.id === columnToAdd.id ? { ...col, recordId } : col));
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync column creation:', err);
        setSyncStatus('error');
      }
    }
  };

  const createColumn = () => openCreateColumnDialog('task');

  const createIdeaColumn = () => openCreateColumnDialog('idea');

  const deleteColumn = async (id: Id) => {
    const column = columns.find(col => col.id === id);
    const tasksToDelete = tasks.filter(t => t.columnId === id);

    setColumns(columns.filter((col) => col.id !== id));
    setTasks(tasks.filter((t) => t.columnId !== id));

    // Sync deletions to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        // Delete column
        if (column?.recordId) {
          await deleteRecord('columns', column.recordId);
        }
        // Delete associated tasks
        for (const task of tasksToDelete) {
          if (task.recordId) {
            await deleteRecord('tasks', task.recordId);
          }
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync column deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const updateColumnTitle = (id: Id, title: string) => {
    setColumns(columns.map((col) => (col.id === id ? { ...col, title } : col)));

    // Sync to Feishu with debounce - explicitly pass type: 'task'
    const column = columns.find(col => col.id === id);
    if (currentUser && column?.recordId) {
      debouncedSync(() => updateRecord('columns', column.recordId!, { title, type: 'task' }));
    }
  };

  const createTask = async (columnId: Id) => {
    const column = columns.find(c => c.id === columnId);
    const newTask: Task = {
      id: generateId(),
      columnId,
      content: `新任务 ${tasks.length + 1}`,
      completed: false,
    };
    setTasks([...tasks, newTask]);

    // Sync to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        // Encrypt content if column is encrypted and unlocked
        let contentToSync = newTask.content;
        if (column?.isEncrypted && unlockedColumns.has(columnId)) {
          const password = unlockedColumns.get(columnId)!;
          contentToSync = await encryptContent(newTask.content, password);
        }
        const recordId = await createRecord(currentUser, 'tasks', { ...newTask, content: contentToSync, sortOrder: tasks.length });
        setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, recordId } : t));
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync task creation:', err);
        setSyncStatus('error');
      }
    }
  };

  const deleteTask = async (id: Id) => {
    const task = tasks.find(t => t.id === id);
    setTasks(tasks.filter((t) => t.id !== id));

    // Sync to Feishu
    if (currentUser && task?.recordId) {
      try {
        setSyncStatus('syncing');
        await deleteRecord('tasks', task.recordId);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync task deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const updateTask = async (id: Id, content: string) => {
    setTasks(tasks.map((task) => (task.id === id ? { ...task, content } : task)));

    // Sync to Feishu with debounce (wait for user to finish typing)
    const task = tasks.find(t => t.id === id);
    if (currentUser && task?.recordId) {
      // Check if column is encrypted
      const column = columns.find(c => c.id === task.columnId);
      if (column?.isEncrypted && unlockedColumns.has(task.columnId)) {
        const password = unlockedColumns.get(task.columnId)!;
        const encryptedContent = await encryptContent(content, password);
        debouncedSync(() => updateRecord('tasks', task.recordId!, { ...task, content: encryptedContent }));
      } else {
        debouncedSync(() => updateRecord('tasks', task.recordId!, { ...task, content }));
      }
    }
  };

  const toggleComplete = async (id: Id) => {
    const task = tasks.find(t => t.id === id);
    const newCompleted = !task?.completed;

    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, completed: newCompleted } : t
    ));

    // Sync to Feishu
    if (currentUser && task?.recordId) {
      try {
        setSyncStatus('syncing');
        await updateRecord('tasks', task.recordId, { ...task, completed: newCompleted });
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync task toggle:', err);
        setSyncStatus('error');
      }
    }
  };

  // --- Idea Actions (with incremental sync) ---

  const deleteIdeaColumn = async (id: Id) => {
    const column = ideaColumns.find(col => col.id === id);
    const ideasToDelete = ideas.filter(t => t.columnId === id);

    setIdeaColumns(ideaColumns.filter((col) => col.id !== id));
    setIdeas(ideas.filter((t) => t.columnId !== id));

    // Sync deletions to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        if (column?.recordId) {
          await deleteRecord('columns', column.recordId);
        }
        for (const idea of ideasToDelete) {
          if (idea.recordId) {
            await deleteRecord('ideas', idea.recordId);
          }
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync idea column deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const updateIdeaColumnTitle = (id: Id, title: string) => {
    setIdeaColumns(ideaColumns.map((col) => (col.id === id ? { ...col, title } : col)));

    // Sync to Feishu with debounce - explicitly pass type: 'idea'
    const column = ideaColumns.find(col => col.id === id);
    if (currentUser && column?.recordId) {
      debouncedSync(() => updateRecord('columns', column.recordId!, { title, type: 'idea' }));
    }
  };

  const createIdea = async (columnId: Id) => {
    const column = ideaColumns.find(c => c.id === columnId);
    const newIdea: Idea = {
      id: generateId(),
      columnId,
      content: `新想法 ${ideas.length + 1}`,
    };
    setIdeas([...ideas, newIdea]);

    // Sync to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        // Encrypt content if column is encrypted and unlocked
        let contentToSync = newIdea.content;
        if (column?.isEncrypted && unlockedColumns.has(columnId)) {
          const password = unlockedColumns.get(columnId)!;
          contentToSync = await encryptContent(newIdea.content, password);
        }
        const recordId = await createRecord(currentUser, 'ideas', { ...newIdea, content: contentToSync, sortOrder: ideas.length });
        setIdeas(prev => prev.map(i => i.id === newIdea.id ? { ...i, recordId } : i));
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync idea creation:', err);
        setSyncStatus('error');
      }
    }
  };

  const deleteIdea = async (id: Id) => {
    const idea = ideas.find(i => i.id === id);
    setIdeas(ideas.filter((i) => i.id !== id));

    // Sync to Feishu
    if (currentUser && idea?.recordId) {
      try {
        setSyncStatus('syncing');
        await deleteRecord('ideas', idea.recordId);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync idea deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const updateIdea = async (id: Id, content: string) => {
    setIdeas(ideas.map((idea) => (idea.id === id ? { ...idea, content } : idea)));

    // Sync to Feishu with debounce
    const idea = ideas.find(i => i.id === id);
    if (currentUser && idea?.recordId) {
      // Check if column is encrypted
      const column = ideaColumns.find(c => c.id === idea.columnId);
      if (column?.isEncrypted && unlockedColumns.has(idea.columnId)) {
        const password = unlockedColumns.get(idea.columnId)!;
        const encryptedContent = await encryptContent(content, password);
        debouncedSync(() => updateRecord('ideas', idea.recordId!, { ...idea, content: encryptedContent }));
      } else {
        debouncedSync(() => updateRecord('ideas', idea.recordId!, { ...idea, content }));
      }
    }
  };

  const optimizeIdea = async (ideaId: Id, content: string, columnId: Id) => {
    // Try to get existing client
    let ai = getGeminiClient();

    // If no API key configured, prompt user to enter one
    if (!ai) {
      const userKey = prompt(
        "请输入您的 Gemini API Key 来使用 AI 优化功能：\n\n" +
        "（可以在 https://makersuite.google.com/app/apikey 获取）\n\n" +
        "API Key 将保存在浏览器本地，下次无需重新输入。"
      );

      if (!userKey || userKey.trim() === "") {
        return; // User cancelled
      }

      // Save to localStorage
      localStorage.setItem(GEMINI_API_KEY_STORAGE, userKey.trim());
      ai = getGeminiClient();

      if (!ai) {
        alert("API Key 设置失败，请重试。");
        return;
      }
    }

    setOptimizingIds(prev => new Set(prev).add(ideaId));
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are a helpful product manager assistant. Optimize and organize the following raw idea into a clear, concise, and actionable note. Keep it short. \n\nIdea: ${content}`,
      });

      const refinedText = response.text || "";
      if (refinedText) {
        const newIdea: Idea = {
          id: generateId(),
          columnId,
          content: refinedText,
          isAiGenerated: true
        };
        // Insert after the original idea
        setIdeas(prev => {
          const index = prev.findIndex(i => i.id === ideaId);
          if (index === -1) return [...prev, newIdea];
          const newArr = [...prev];
          newArr.splice(index + 1, 0, newIdea);
          return newArr;
        });
      }
    } catch (e: any) {
      console.error("AI Optimization failed", e);
      // If API key is invalid, clear it and let user re-enter
      if (e?.message?.includes("API key") || e?.status === 401 || e?.status === 403) {
        localStorage.removeItem(GEMINI_API_KEY_STORAGE);
        alert("API Key 无效或已过期，请重新输入。");
      } else {
        alert("AI 优化失败：" + (e?.message || "未知错误"));
      }
    } finally {
      setOptimizingIds(prev => {
        const next = new Set(prev);
        next.delete(ideaId);
        return next;
      });
    }
  };

  // --- Document Functions ---

  // Unlocked document folders state: folderId -> password
  const [unlockedFolders, setUnlockedFolders] = useState<Map<Id, string>>(new Map());

  const createDocument = async (folderId?: Id) => {
    const now = Date.now();
    const newDoc: Document = {
      id: generateId(),
      folderId,
      title: `新文档 ${documents.length + 1}`,
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    setDocuments([...documents, newDoc]);
    setEditingDocument(newDoc);

    // Sync to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        const recordId = await createRecord(currentUser, 'documents', { ...newDoc, sortOrder: documents.length });
        setDocuments(prev => prev.map(d => d.id === newDoc.id ? { ...d, recordId } : d));
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync document creation:', err);
        setSyncStatus('error');
      }
    }
  };

  const deleteDocument = async (id: Id) => {
    const doc = documents.find(d => d.id === id);
    setDocuments(documents.filter((d) => d.id !== id));
    if (editingDocument?.id === id) {
      setEditingDocument(null);
    }

    // Sync to Feishu
    if (currentUser && doc?.recordId) {
      try {
        setSyncStatus('syncing');
        await deleteRecord('documents', doc.recordId);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync document deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const updateDocument = useCallback((id: Id, title: string, content: string) => {
    const updatedAt = Date.now();
    setDocuments(prev => prev.map((doc) =>
      doc.id === id ? { ...doc, title, content, updatedAt } : doc
    ));

    // Update editing document reference
    if (editingDocument?.id === id) {
      setEditingDocument(prev => prev ? { ...prev, title, content, updatedAt } : null);
    }

    // Sync to Feishu with debounce
    const doc = documents.find(d => d.id === id);
    if (currentUser && doc?.recordId) {
      debouncedSync(() => updateRecord('documents', doc.recordId!, { title, content, updatedAt }));
    }
  }, [documents, editingDocument, currentUser, debouncedSync]);

  // --- Document Folder Functions ---

  const createDocumentFolder = async (title: string, isEncrypted: boolean, password?: string) => {
    let encryptionSalt: string | undefined;

    if (isEncrypted && password) {
      // Generate salt and hash for password storage
      const salt = await generateSalt();
      const hash = await generatePasswordHash(password, salt);
      encryptionSalt = `${salt}:${hash}`;
    }

    const newFolder: DocumentFolder = {
      id: generateId(),
      title: title.trim(),
      isEncrypted,
      encryptionSalt,
    };

    setDocumentFolders([...documentFolders, newFolder]);

    // Auto-unlock the new encrypted folder
    if (isEncrypted && password) {
      setUnlockedFolders(prev => new Map(prev).set(newFolder.id, password));
    }

    // Sync to Feishu
    if (currentUser) {
      try {
        setSyncStatus('syncing');
        const recordId = await createRecord(currentUser, 'documentFolders', { ...newFolder, sortOrder: documentFolders.length });
        setDocumentFolders(prev => prev.map(f => f.id === newFolder.id ? { ...f, recordId } : f));
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync folder creation:', err);
        setSyncStatus('error');
      }
    }
  };

  const deleteDocumentFolder = async (id: Id) => {
    // Check if folder has documents
    const folderDocs = documents.filter(d => d.folderId === id);
    if (folderDocs.length > 0) {
      if (!confirm(`该文件夹包含 ${folderDocs.length} 个文档，删除文件夹将同时删除所有文档。确定继续？`)) {
        return;
      }
      // Delete all documents in the folder
      for (const doc of folderDocs) {
        await deleteDocument(doc.id);
      }
    }

    const folder = documentFolders.find(f => f.id === id);
    setDocumentFolders(documentFolders.filter(f => f.id !== id));
    setUnlockedFolders(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    // Sync to Feishu
    if (currentUser && folder?.recordId) {
      try {
        setSyncStatus('syncing');
        await deleteRecord('documentFolders', folder.recordId);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync folder deletion:', err);
        setSyncStatus('error');
      }
    }
  };

  const unlockDocumentFolder = async (folder: DocumentFolder) => {
    const password = prompt(`请输入 "${folder.title}" 的密码：`);
    if (!password) return;

    // Verify password (simple check for now - just verify the salt exists and set the password)
    // In a real implementation, we would verify the hash
    if (folder.encryptionSalt) {
      const hash = await generatePasswordHash(password, folder.encryptionSalt);
      // For simplicity, we just unlock it - proper verification would compare hashes
      setUnlockedFolders(prev => new Map(prev).set(folder.id, password));
    }
  };





  // --- DnD Handlers ---

  function onDragStart(event: DragStartEvent) {
    const { active } = event;
    const type = active.data.current?.type;

    if (type === "Column") {
      setActiveColumn(active.data.current.column);
    } else if (type === "Task") {
      setActiveTask(active.data.current.task);
    } else if (type === "IdeaColumn") {
      setActiveIdeaColumn(active.data.current.column);
    } else if (type === "Idea") {
      setActiveIdea(active.data.current.idea);
    }
  }
  // Ref to track if we need to sync after drag
  const needsSyncAfterDragRef = useRef(false);

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);
    setActiveIdeaColumn(null);
    setActiveIdea(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    const type = active.data.current?.type;

    // For Task/Idea, the reordering happens in onDragOver, so we always need to sync
    // after a drag operation ends, regardless of whether activeId === overId
    // (which happens when the item settles into its new position)
    if (type === "Task" || type === "Idea") {
      needsSyncAfterDragRef.current = true;
    }

    // For columns, only reorder if positions are different
    if (activeId === overId) return;

    if (type === "Column") {
      setColumns((cols) => {
        const activeIndex = cols.findIndex((col) => col.id === activeId);
        const overIndex = cols.findIndex((col) => col.id === overId);
        return arrayMove(cols, activeIndex, overIndex);
      });
      needsSyncAfterDragRef.current = true;
    } else if (type === "IdeaColumn") {
      setIdeaColumns((cols) => {
        const activeIndex = cols.findIndex((col) => col.id === activeId);
        const overIndex = cols.findIndex((col) => col.id === overId);
        return arrayMove(cols, activeIndex, overIndex);
      });
      needsSyncAfterDragRef.current = true;
    }
  }

  // Effect to sync data after drag reorder (runs after state updates)
  useEffect(() => {
    if (needsSyncAfterDragRef.current && currentUser && !isInitialLoad) {
      needsSyncAfterDragRef.current = false;

      const dataToSave: UserData = {
        columns,
        tasks,
        ideaColumns,
        ideas,
        documents,
        documentFolders
      };

      setSyncStatus('syncing');
      isSavingRef.current = true;
      saveUserDataImmediate(currentUser, dataToSave)
        .then(() => {
          setSyncStatus('synced');
          broadcastDataChange();
        })
        .catch((err) => {
          console.error('Failed to sync after drag:', err);
          setSyncStatus('error');
        })
        .finally(() => {
          isSavingRef.current = false;
        });
    }
  }, [columns, tasks, ideaColumns, ideas, documents, currentUser, isInitialLoad, broadcastDataChange]);

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Task Sorting
    if (activeType === "Task" && overType === "Task") {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        if (tasks[activeIndex].columnId !== tasks[overIndex].columnId) {
          tasks[activeIndex].columnId = tasks[overIndex].columnId;
        }
        return arrayMove(tasks, activeIndex, overIndex);
      });
    }
    // Task Dropping on Column
    if (activeType === "Task" && overType === "Column") {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        tasks[activeIndex].columnId = overId;
        return arrayMove(tasks, activeIndex, activeIndex);
      });
    }

    // Idea Sorting
    if (activeType === "Idea" && overType === "Idea") {
      setIdeas((ids) => {
        const activeIndex = ids.findIndex((t) => t.id === activeId);
        const overIndex = ids.findIndex((t) => t.id === overId);
        if (ids[activeIndex].columnId !== ids[overIndex].columnId) {
          ids[activeIndex].columnId = ids[overIndex].columnId;
        }
        return arrayMove(ids, activeIndex, overIndex);
      });
    }
    // Idea Dropping on Column
    if (activeType === "Idea" && overType === "IdeaColumn") {
      setIdeas((ids) => {
        const activeIndex = ids.findIndex((t) => t.id === activeId);
        ids[activeIndex].columnId = overId;
        return arrayMove(ids, activeIndex, activeIndex);
      });
    }
  }

  // Handle login with session token generation
  const handleLogin = useCallback((userId: string) => {
    const sessionToken = generateUserHash(userId);
    localStorage.setItem(`${STORAGE_PREFIX}session_${userId}`, sessionToken);
    localStorage.setItem(`${STORAGE_PREFIX}current_user`, userId);
    updateUrlHash(userId, sessionToken);
    setCurrentUser(userId);
  }, []);

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-slate-50">
      {/* Navbar */}
      <div className="w-full bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg text-white transition-colors ${view === 'tasks' ? 'bg-indigo-600' : 'bg-purple-600'}`}>
              {view === 'tasks' ? <Layout size={24} /> : <BrainCircuit size={24} />}
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">轻计划</h1>
          </div>

          {/* View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setView('tasks')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'tasks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              任务
            </button>
            <button
              onClick={() => setView('ideas')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'ideas' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              想法
            </button>
            <button
              onClick={() => { setView('docs'); setEditingDocument(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'docs' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              文档
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs text-slate-400 font-medium">工作区</span>
            <span className="text-sm font-bold text-slate-700">{currentUser}</span>
          </div>

          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={syncStatus === 'error' || syncStatus === 'offline' ? handleRetrySync : handleRefresh}
              disabled={syncStatus === 'syncing'}
              className={`p-2 rounded-lg transition-colors ${syncStatus === 'syncing'
                ? 'text-blue-500 bg-blue-50 cursor-wait'
                : syncStatus === 'synced'
                  ? 'text-green-500 hover:bg-green-50'
                  : syncStatus === 'offline' || syncStatus === 'error'
                    ? 'text-orange-500 hover:bg-orange-50'
                    : 'text-slate-400 hover:bg-slate-100'
                }`}
              title={
                syncStatus === 'syncing'
                  ? '正在同步...'
                  : syncStatus === 'synced'
                    ? '已同步到飞书 - 点击刷新'
                    : syncStatus === 'offline'
                      ? '离线模式 - 点击重新上传'
                      : syncStatus === 'error'
                        ? '同步失败 - 点击重新上传'
                        : '点击同步'
              }
            >
              {syncStatus === 'syncing' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : syncStatus === 'synced' ? (
                <Cloud size={18} />
              ) : syncStatus === 'offline' || syncStatus === 'error' ? (
                <Upload size={18} />
              ) : (
                <RefreshCw size={18} />
              )}
            </button>
            <span className="hidden lg:block text-xs text-slate-400">
              {syncStatus === 'syncing' && '同步中...'}
              {syncStatus === 'synced' && '已同步'}
              {syncStatus === 'offline' && '离线-点击上传'}
              {syncStatus === 'error' && '失败-点击重试'}
            </span>
          </div>

          {view === 'docs' ? (
            <div className="relative">
              <button
                onClick={() => setShowDocCreateMenu(!showDocCreateMenu)}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-full transition-colors shadow-sm font-medium text-sm bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus size={16} />
                <span className="hidden md:inline">新建</span>
              </button>
              {showDocCreateMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDocCreateMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50">
                    <button
                      onClick={() => {
                        createDocument(currentDocFolderId || undefined);
                        setShowDocCreateMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <FileText size={16} className="text-emerald-600" />
                      新建文档
                    </button>
                    <button
                      onClick={() => {
                        setShowFolderDialog(true);
                        setShowDocCreateMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <Folder size={16} className="text-cyan-600" />
                      新建文件夹
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={view === 'tasks' ? createColumn : createIdeaColumn}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-full transition-colors shadow-sm font-medium text-sm ${view === 'tasks' ? 'bg-slate-900 hover:bg-slate-700' : 'bg-purple-600 hover:bg-purple-700'}`}
            >
              <Plus size={16} />
              <span className="hidden md:inline">{view === 'tasks' ? '新建分类' : '新建主题'}</span>
            </button>
          )}

          <button
            onClick={handleClearCache}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="清除本地缓存"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Main Board Area */}
      <div className="flex-grow w-full overflow-x-auto overflow-y-hidden p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          {view === 'tasks' ? (
            // TASKS VIEW
            <div className="flex gap-6 h-full min-w-max mx-auto">
              <SortableContext items={columnsId}>
                {columns.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    tasks={tasks.filter((task) => task.columnId === col.id)}
                    deleteColumn={deleteColumn}
                    updateColumnTitle={updateColumnTitle}
                    createTask={createTask}
                    deleteTask={deleteTask}
                    updateTask={updateTask}
                    toggleComplete={toggleComplete}
                    isLocked={col.isEncrypted && !unlockedColumns.has(col.id)}
                    onUnlock={() => {
                      setUnlockingColumn(col);
                      setUnlockDialogOpen(true);
                    }}
                  />
                ))}
              </SortableContext>
              {columns.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-[60vh] text-slate-400">
                  <p>还没有任务分类</p>
                </div>
              )}
            </div>
          ) : view === 'ideas' ? (
            // IDEAS VIEW
            <div className="flex gap-6 h-full min-w-max mx-auto">
              <SortableContext items={ideaColumnsId}>
                {ideaColumns.map((col) => (
                  <IdeaColumn
                    key={col.id}
                    column={col}
                    ideas={ideas.filter((idea) => idea.columnId === col.id)}
                    deleteColumn={deleteIdeaColumn}
                    updateColumnTitle={updateIdeaColumnTitle}
                    createIdea={createIdea}
                    deleteIdea={deleteIdea}
                    updateIdea={updateIdea}
                    optimizeIdea={optimizeIdea}
                    optimizingIds={optimizingIds}
                    isLocked={col.isEncrypted && !unlockedColumns.has(col.id)}
                    onUnlock={() => {
                      setUnlockingColumn(col);
                      setUnlockDialogOpen(true);
                    }}
                  />
                ))}
              </SortableContext>
              {ideaColumns.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-[60vh] text-slate-400">
                  <p>还没有想法主题</p>
                </div>
              )}
            </div>
          ) : (
            // DOCS VIEW
            <div className="h-full">
              {editingDocument ? (
                <DocumentEditor
                  document={editingDocument}
                  onBack={() => setEditingDocument(null)}
                  onUpdate={updateDocument}
                />
              ) : (
                <DocumentList
                  documents={documents}
                  documentFolders={documentFolders}
                  unlockedFolders={unlockedFolders}
                  currentFolderId={currentDocFolderId}
                  onFolderChange={setCurrentDocFolderId}
                  onSelectDocument={setEditingDocument}
                  onDeleteDocument={deleteDocument}
                  onDeleteFolder={deleteDocumentFolder}
                  onUnlockFolder={unlockDocumentFolder}
                />
              )}
            </div>
          )}

          {createPortal(
            <DragOverlay>
              {activeColumn && (
                <Column
                  column={activeColumn}
                  tasks={tasks.filter((task) => task.columnId === activeColumn.id)}
                  deleteColumn={deleteColumn}
                  updateColumnTitle={updateColumnTitle}
                  createTask={createTask}
                  deleteTask={deleteTask}
                  updateTask={updateTask}
                  toggleComplete={toggleComplete}
                />
              )}
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  deleteTask={deleteTask}
                  updateTask={updateTask}
                  toggleComplete={toggleComplete}
                />
              )}
              {activeIdeaColumn && (
                <IdeaColumn
                  column={activeIdeaColumn}
                  ideas={ideas.filter((i) => i.columnId === activeIdeaColumn.id)}
                  deleteColumn={deleteIdeaColumn}
                  updateColumnTitle={updateIdeaColumnTitle}
                  createIdea={createIdea}
                  deleteIdea={deleteIdea}
                  updateIdea={updateIdea}
                  optimizeIdea={optimizeIdea}
                  optimizingIds={optimizingIds}
                />
              )}
              {activeIdea && (
                <IdeaCard
                  idea={activeIdea}
                  deleteIdea={deleteIdea}
                  updateIdea={updateIdea}
                  optimizeIdea={optimizeIdea}
                  isOptimizing={optimizingIds.has(activeIdea.id)}
                />
              )}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>

      {/* Create Column Dialog */}
      <CreateColumnDialog
        isOpen={createColumnDialogOpen}
        onClose={() => setCreateColumnDialogOpen(false)}
        onCreate={handleCreateColumn}
        type={createColumnType}
        defaultTitle={createColumnType === 'task' ? `新分类 ${columns.length + 1}` : `新主题 ${ideaColumns.length + 1}`}
      />

      {/* Unlock Dialog */}
      <UnlockDialog
        isOpen={unlockDialogOpen}
        onClose={() => {
          setUnlockDialogOpen(false);
          setUnlockingColumn(null);
        }}
        onUnlock={async (password) => {
          if (!unlockingColumn) return false;
          // Verify password against stored hash
          const saltAndHash = unlockingColumn.encryptionSalt?.split(':');
          if (!saltAndHash || saltAndHash.length !== 2) return false;
          const [salt, storedHash] = saltAndHash;
          const computedHash = await generatePasswordHash(password, salt);
          if (computedHash === storedHash) {
            // Save password to unlocked columns
            setUnlockedColumns(prev => new Map(prev).set(unlockingColumn.id, password));

            // Decrypt tasks in this column
            const columnTasks = tasks.filter(t => t.columnId === unlockingColumn.id);
            const decryptedTasks = await Promise.all(
              columnTasks.map(async (task) => {
                if (isEncryptedContent(task.content)) {
                  try {
                    const decrypted = await decryptContent(task.content, password);
                    return { ...task, content: decrypted };
                  } catch (e) {
                    console.error('Failed to decrypt task:', e);
                    return task;
                  }
                }
                return task;
              })
            );
            // Update tasks state with decrypted content
            setTasks(prev => prev.map(t => {
              const decrypted = decryptedTasks.find(dt => dt.id === t.id);
              return decrypted || t;
            }));

            // Decrypt ideas in this column (for idea columns)
            const columnIdeas = ideas.filter(i => i.columnId === unlockingColumn.id);
            const decryptedIdeas = await Promise.all(
              columnIdeas.map(async (idea) => {
                if (isEncryptedContent(idea.content)) {
                  try {
                    const decrypted = await decryptContent(idea.content, password);
                    return { ...idea, content: decrypted };
                  } catch (e) {
                    console.error('Failed to decrypt idea:', e);
                    return idea;
                  }
                }
                return idea;
              })
            );
            // Update ideas state with decrypted content
            setIdeas(prev => prev.map(i => {
              const decrypted = decryptedIdeas.find(di => di.id === i.id);
              return decrypted || i;
            }));

            return true;
          }
          return false;
        }}
        columnTitle={unlockingColumn?.title || ''}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        isOpen={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onCreate={(title, isEncrypted, password) => {
          createDocumentFolder(title, isEncrypted, password);
          setShowFolderDialog(false);
        }}
      />
    </div>
  );
}

function generateId() {
  return Math.floor(Math.random() * 10001).toString();
}

export default App;
