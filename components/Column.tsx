import React, { useMemo } from 'react';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column as ColumnType, Id, Task } from '../types';
import TaskCard from './TaskCard';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';

interface ColumnProps {
  column: ColumnType;
  tasks: Task[];
  deleteColumn: (id: Id) => void;
  updateColumnTitle: (id: Id, title: string) => void;
  createTask: (columnId: Id) => void;
  deleteTask: (id: Id) => void;
  updateTask: (id: Id, content: string) => void;
  toggleComplete: (id: Id) => void;
}

const Column: React.FC<ColumnProps> = ({
  column,
  tasks,
  deleteColumn,
  updateColumnTitle,
  createTask,
  deleteTask,
  updateTask,
  toggleComplete
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-slate-100 w-[350px] h-[70vh] min-h-[500px] rounded-2xl flex flex-col shadow-sm border border-slate-200"
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
                            if(e.key !== "Enter") return;
                            setEditMode(false);
                        }}
                    />
                ) : (
                    <h2 
                        onClick={() => setEditMode(true)}
                        className="text-base font-bold text-slate-700 truncate cursor-pointer hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                    >
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
            Add Task
        </button>
      </div>
    </div>
  );
};

export default Column;
