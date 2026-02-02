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
import { Column as ColumnType, Task, Idea, Id } from './types';
import Column from './components/Column';
import TaskCard from './components/TaskCard';
import IdeaColumn from './components/IdeaColumn';
import IdeaCard from './components/IdeaCard';
import LoginScreen from './components/LoginScreen';
import { Plus, Layout, BrainCircuit, LogOut, Cloud, CloudOff, RefreshCw, Loader2 } from 'lucide-react';
import {
  fetchUserData,
  saveUserDataDebounced,
  processOfflineQueue,
  SyncStatus,
  UserData
} from './services/feishuService';

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


// --- Default Data Constants ---
const defaultCols: ColumnType[] = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "In Progress" },
  { id: "done", title: "Done" },
];

const defaultIdeaCols: ColumnType[] = [
  { id: "raw", title: "Raw Thoughts" },
  { id: "refined", title: "Refined Concepts" },
];

const defaultTasks: Task[] = [
  { id: "1", columnId: "todo", content: "Design new landing page", completed: false },
  { id: "2", columnId: "todo", content: "Research competitor pricing", completed: false },
  { id: "3", columnId: "doing", content: "Implement authentication flow", completed: false },
  { id: "4", columnId: "done", content: "Set up project repository", completed: true },
];

const defaultIdeas: Idea[] = [
  { id: "i1", columnId: "raw", content: "Maybe we should add a dark mode?" },
  { id: "i2", columnId: "raw", content: "Use AI to sort tasks automatically" },
];

type ViewMode = 'tasks' | 'ideas';
const STORAGE_PREFIX = 'zentask_v1_';

function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem(`${STORAGE_PREFIX}current_user`);
  });

  const [view, setView] = useState<ViewMode>('tasks');

  // -- State Declarations (Initialized with empty, loaded via Effect) --
  const [columns, setColumns] = useState<ColumnType[]>(defaultCols);
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [ideaColumns, setIdeaColumns] = useState<ColumnType[]>(defaultIdeaCols);
  const [ideas, setIdeas] = useState<Idea[]>(defaultIdeas);

  const [activeColumn, setActiveColumn] = useState<ColumnType | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeIdeaColumn, setActiveIdeaColumn] = useState<ColumnType | null>(null);
  const [activeIdea, setActiveIdea] = useState<Idea | null>(null);
  const [optimizingIds, setOptimizingIds] = useState<Set<Id>>(new Set());

  // Sync status for Feishu cloud sync
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dataLoadedRef = useRef(false);

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
      } catch (e) {
        console.error("Failed to load user data from localStorage", e);
      }
    } else {
      setColumns(defaultCols);
      setTasks(defaultTasks);
      setIdeaColumns(defaultIdeaCols);
      setIdeas(defaultIdeas);
    }
  }, []);

  // 1. Load data when user logs in - try cloud first, fallback to localStorage
  useEffect(() => {
    if (currentUser && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
      localStorage.setItem(`${STORAGE_PREFIX}current_user`, currentUser);

      setSyncStatus('syncing');
      setIsInitialLoad(true);

      // Try to fetch from Feishu cloud
      fetchUserData(currentUser)
        .then((data) => {
          if (data && (data.columns.length > 0 || data.tasks.length > 0 || data.ideas.length > 0)) {
            setColumns(data.columns.length > 0 ? data.columns : defaultCols);
            setTasks(data.tasks);
            setIdeaColumns(data.ideaColumns.length > 0 ? data.ideaColumns : defaultIdeaCols);
            setIdeas(data.ideas);
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

  // 2. Save data whenever it changes - to both localStorage (cache) and cloud
  useEffect(() => {
    if (currentUser && !isInitialLoad) {
      const dataToSave: UserData = {
        columns,
        tasks,
        ideaColumns,
        ideas
      };

      // Always save to localStorage as cache
      localStorage.setItem(`${STORAGE_PREFIX}data_${currentUser}`, JSON.stringify(dataToSave));

      // Save to cloud with debounce
      saveUserDataDebounced(currentUser, dataToSave, setSyncStatus);
    }
  }, [currentUser, columns, tasks, ideaColumns, ideas, isInitialLoad]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;

    setSyncStatus('syncing');
    try {
      const data = await fetchUserData(currentUser);
      if (data) {
        setColumns(data.columns.length > 0 ? data.columns : defaultCols);
        setTasks(data.tasks);
        setIdeaColumns(data.ideaColumns.length > 0 ? data.ideaColumns : defaultIdeaCols);
        setIdeas(data.ideas);
        localStorage.setItem(`${STORAGE_PREFIX}data_${currentUser}`, JSON.stringify(data));
      }
      setSyncStatus('synced');
    } catch (err) {
      console.error('Manual refresh failed:', err);
      setSyncStatus('error');
    }
  }, [currentUser]);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(`${STORAGE_PREFIX}current_user`);
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

  // --- Task Actions ---

  const createColumn = () => {
    const columnToAdd: ColumnType = {
      id: generateId(),
      title: `New Group ${columns.length + 1}`,
    };
    setColumns([...columns, columnToAdd]);
  };

  const deleteColumn = (id: Id) => {
    setColumns(columns.filter((col) => col.id !== id));
    setTasks(tasks.filter((t) => t.columnId !== id));
  };

  const updateColumnTitle = (id: Id, title: string) => {
    setColumns(columns.map((col) => (col.id === id ? { ...col, title } : col)));
  };

  const createTask = (columnId: Id) => {
    const newTask: Task = {
      id: generateId(),
      columnId,
      content: `New Task ${tasks.length + 1}`,
      completed: false,
    };
    setTasks([...tasks, newTask]);
  };

  const deleteTask = (id: Id) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };

  const updateTask = (id: Id, content: string) => {
    setTasks(tasks.map((task) => (task.id === id ? { ...task, content } : task)));
  };

  const toggleComplete = (id: Id) => {
    setTasks(prev => prev.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  // --- Idea Actions ---

  const createIdeaColumn = () => {
    const columnToAdd: ColumnType = {
      id: generateId(),
      title: `New Topic ${ideaColumns.length + 1}`,
    };
    setIdeaColumns([...ideaColumns, columnToAdd]);
  };

  const deleteIdeaColumn = (id: Id) => {
    setIdeaColumns(ideaColumns.filter((col) => col.id !== id));
    setIdeas(ideas.filter((t) => t.columnId !== id));
  };

  const updateIdeaColumnTitle = (id: Id, title: string) => {
    setIdeaColumns(ideaColumns.map((col) => (col.id === id ? { ...col, title } : col)));
  };

  const createIdea = (columnId: Id) => {
    const newIdea: Idea = {
      id: generateId(),
      columnId,
      content: `New Idea ${ideas.length + 1}`,
    };
    setIdeas([...ideas, newIdea]);
  };

  const deleteIdea = (id: Id) => {
    setIdeas(ideas.filter((idea) => idea.id !== id));
  };

  const updateIdea = (id: Id, content: string) => {
    setIdeas(ideas.map((idea) => (idea.id === id ? { ...idea, content } : idea)));
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

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);
    setActiveIdeaColumn(null);
    setActiveIdea(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const type = active.data.current?.type;

    if (type === "Column") {
      setColumns((cols) => {
        const activeIndex = cols.findIndex((col) => col.id === activeId);
        const overIndex = cols.findIndex((col) => col.id === overId);
        return arrayMove(cols, activeIndex, overIndex);
      });
    } else if (type === "IdeaColumn") {
      setIdeaColumns((cols) => {
        const activeIndex = cols.findIndex((col) => col.id === activeId);
        const overIndex = cols.findIndex((col) => col.id === overId);
        return arrayMove(cols, activeIndex, overIndex);
      });
    }
  }

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

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
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
            <h1 className="text-xl font-bold text-slate-800 tracking-tight hidden sm:block">ZenTask Board</h1>
          </div>

          {/* View Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setView('tasks')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'tasks' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tasks
            </button>
            <button
              onClick={() => setView('ideas')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${view === 'ideas' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Ideas
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs text-slate-400 font-medium">Workspace</span>
            <span className="text-sm font-bold text-slate-700">{currentUser}</span>
          </div>

          {/* Sync Status Indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
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
                      ? '离线模式 - 点击重试'
                      : syncStatus === 'error'
                        ? '同步失败 - 点击重试'
                        : '点击同步'
              }
            >
              {syncStatus === 'syncing' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : syncStatus === 'synced' ? (
                <Cloud size={18} />
              ) : syncStatus === 'offline' || syncStatus === 'error' ? (
                <CloudOff size={18} />
              ) : (
                <RefreshCw size={18} />
              )}
            </button>
            <span className="hidden lg:block text-xs text-slate-400">
              {syncStatus === 'syncing' && '同步中...'}
              {syncStatus === 'synced' && '已同步'}
              {syncStatus === 'offline' && '离线'}
              {syncStatus === 'error' && '同步失败'}
            </span>
          </div>

          <button
            onClick={view === 'tasks' ? createColumn : createIdeaColumn}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-full transition-colors shadow-sm font-medium text-sm ${view === 'tasks' ? 'bg-slate-900 hover:bg-slate-700' : 'bg-purple-600 hover:bg-purple-700'}`}
          >
            <Plus size={16} />
            <span className="hidden md:inline">{view === 'tasks' ? 'New Category' : 'New Topic'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Log Out"
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
                  />
                ))}
              </SortableContext>
              {columns.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-[60vh] text-slate-400">
                  <p>No task categories.</p>
                </div>
              )}
            </div>
          ) : (
            // IDEAS VIEW
            <div className="flex gap-6 h-full min-w-max mx-auto">
              <SortableContext items={ideaColumnsId}>
                {ideaColumns.map((col) => (
                  <IdeaColumn
                    key={col.id}
                    column={col}
                    ideas={ideas.filter((idea) => idea.columnId === col.id)}
                    deleteIdeaColumn={deleteIdeaColumn}
                    updateIdeaColumnTitle={updateIdeaColumnTitle}
                    createIdea={createIdea}
                    deleteIdea={deleteIdea}
                    updateIdea={updateIdea}
                    optimizeIdea={optimizeIdea}
                    optimizingIds={optimizingIds}
                  />
                ))}
              </SortableContext>
              {ideaColumns.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-[60vh] text-slate-400">
                  <p>No idea topics.</p>
                </div>
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
    </div>
  );
}

function generateId() {
  return Math.floor(Math.random() * 10001).toString();
}

export default App;
