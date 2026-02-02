import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Id } from '../types';
import { Check, GripVertical, Trash2 } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  deleteTask: (id: Id) => void;
  updateTask: (id: Id, content: string) => void;
  toggleComplete: (id: Id) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, deleteTask, updateTask, toggleComplete }) => {
  const [isEditing, setIsEditing] = useState(false);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    },
    disabled: isEditing,
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
        className="opacity-30 bg-slate-100 p-4 h-[80px] min-h-[80px] items-center flex text-left rounded-xl border-2 border-indigo-500 cursor-grab relative"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white p-3.5 min-h-[80px] items-start flex flex-col justify-center text-left rounded-xl hover:shadow-md transition-all duration-200 border border-transparent hover:border-indigo-100 shadow-sm
        ${task.completed ? 'bg-slate-50' : ''}
      `}
    >
      <div className="flex w-full items-center justify-between gap-3">
        {/* Drag Handle */}
        <div {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-indigo-500 -ml-1 mt-0.5">
           <GripVertical size={18} />
        </div>

        {/* Content */}
        <div className="flex-grow min-w-0">
            {isEditing ? (
            <textarea
                className="w-full bg-slate-50 border border-indigo-300 rounded p-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                value={task.content}
                autoFocus
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    setIsEditing(false);
                }
                }}
                onChange={(e) => updateTask(task.id, e.target.value)}
            />
            ) : (
            <p 
                onClick={() => setIsEditing(true)}
                className={`text-sm font-medium leading-snug cursor-text break-words whitespace-pre-wrap ${task.completed ? 'text-slate-400 line-through decoration-slate-400' : 'text-slate-700'}`}
            >
                {task.content}
            </p>
            )}
        </div>

        {/* Actions: Checkbox & Delete */}
        <div className="flex items-center gap-2 flex-shrink-0">
           {/* Completion Checkbox */}
           <button
            onClick={() => toggleComplete(task.id)}
            className={`
                w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200
                ${task.completed 
                    ? 'bg-green-500 border-green-500 text-white' 
                    : 'border-slate-300 text-transparent hover:border-green-400'
                }
            `}
           >
            <Check size={14} strokeWidth={3} />
           </button>
           
           {/* Delete (Hidden until hover) */}
           <button 
             onClick={() => deleteTask(task.id)}
             className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Trash2 size={16} />
           </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
