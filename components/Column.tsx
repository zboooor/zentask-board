import React, { useMemo } from 'react';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column as ColumnType, Id, Task } from '../types';
import TaskCard from './TaskCard';
import { Plus, MoreHorizontal, Trash2, Lock, LockOpen } from 'lucide-react';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  deleteColumn: (id: Id) => void;
  updateColumnTitle: (id: Id, title: string) => void;
  createTask: (columnId: Id) => void;
  deleteTask: (id: Id) => void;
  updateTask: (id: Id, content: string) => void;
  toggleComplete: (id: Id) => void;
  isLocked?: boolean;
  onUnlock?: () => void;
}

const Column: React.FC<ColumnProps> = ({
  column,
  tasks,
  deleteColumn,
  updateColumnTitle,
  createTask,
  deleteTask,
  updateTask,
  toggleComplete,
  isLocked = false,
  onUnlock
}) => {
  const [editMode, setEditMode] = React.useState(false);

  const taskIds = useMemo(() => {
    return tasks.map((task) => task.id);
  }, [tasks]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    },
    disabled: editMode,
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-slate-100 opacity-40 border-2 border-indigo-500 w-[350px] h-[500px] max-h-[500px] rounded-xl flex flex-col"
      ></div>
    );
  }

  const columnContent = (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-slate-100 w-[350px] h-[70vh] min-h-[500px] rounded-2xl flex flex-col shadow-sm border ${column.isEncrypted ? 'border-amber-200' : 'border-slate-200'}`}
    >
      {/* Header */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-between p-4 cursor-grab"
      >
        <div className="flex gap-2 items-center w-full">
          <div className="bg-white p-2 rounded-lg shadow-sm font-bold text-sm text-indigo-600">
            {tasks.length}
          </div>
          <div className="flex-grow">
            {editMode ? (
              <input
                className="bg-white focus:border-indigo-500 border border-indigo-300 rounded outline-none px-2 py-1 text-sm font-semibold w-full text-slate-800"
                value={column.title}
                onChange={(e) => updateColumnTitle(column.id, e.target.value)}
                autoFocus
                onBlur={() => setEditMode(false)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  setEditMode(false);
                }}
              />
            ) : (
              <h2
                onClick={() => setEditMode(true)}
                className="text-base font-bold text-slate-700 truncate cursor-pointer hover:bg-slate-200 px-2 py-1 rounded transition-colors flex items-center gap-2"
              >
                {column.isEncrypted && <LockOpen size={14} className="text-amber-500 flex-shrink-0" />}
                {column.title}
              </h2>
            )}
          </div>
        </div>

        <button
          onClick={() => deleteColumn(column.id)}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Task List */}
      <div className="flex-grow flex flex-col gap-3 p-3 overflow-y-auto overflow-x-hidden no-scrollbar">
        <SortableContext items={taskIds}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              deleteTask={deleteTask}
              updateTask={updateTask}
              toggleComplete={toggleComplete}
            />
          ))}
        </SortableContext>
      </div>

      {/* Footer / Add Button */}
      <div className="p-3 pt-0">
        <button
          onClick={() => createTask(column.id)}
          className="flex gap-2 items-center justify-center w-full p-3 rounded-xl hover:bg-white hover:shadow-sm hover:text-indigo-600 text-slate-500 font-medium transition-all duration-200 border border-transparent hover:border-slate-200 group"
        >
          <div className="bg-slate-200 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600 rounded-full p-1 transition-colors">
            <Plus size={16} strokeWidth={3} />
          </div>
          添加任务
        </button>
      </div>
    </div>
  );

  // If column is encrypted and locked, show overlay
  if (column.isEncrypted && isLocked) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="bg-slate-100 w-[350px] h-[70vh] min-h-[500px] rounded-2xl flex flex-col shadow-sm border border-amber-300 relative overflow-hidden"
      >
        {/* Header */}
        <div
          {...attributes}
          {...listeners}
          className="flex items-center justify-between p-4 cursor-grab bg-gradient-to-r from-amber-50 to-amber-100"
        >
          <div className="flex gap-2 items-center w-full">
            <div className="bg-amber-500 p-2 rounded-lg shadow-sm text-white">
              <Lock size={16} />
            </div>
            <h2 className="text-base font-bold text-slate-700 truncate">
              {column.title}
            </h2>
          </div>
          <button
            onClick={() => deleteColumn(column.id)}
            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Locked Content */}
        <div className="flex-grow flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-amber-100 p-4 rounded-full mb-4">
            <Lock size={32} className="text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">加密分类</h3>
          <p className="text-sm text-slate-500 mb-4">此分类已加密，需要密码才能查看内容</p>
          <button
            onClick={onUnlock}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
          >
            🔓 输入密码解锁
          </button>
        </div>
      </div>
    );
  }

  return columnContent;
};

export default Column;
