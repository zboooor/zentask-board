import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Idea, Id } from '../types';
import { Sparkles, GripVertical, Trash2, Bot } from 'lucide-react';

interface IdeaCardProps {
  idea: Idea;
  deleteIdea: (id: Id) => void;
  updateIdea: (id: Id, content: string) => void;
  optimizeIdea: (id: Id, content: string) => void;
  isOptimizing: boolean;
}

const IdeaCard: React.FC<IdeaCardProps> = ({ idea, deleteIdea, updateIdea, optimizeIdea, isOptimizing }) => {
  const [isEditing, setIsEditing] = useState(false);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: idea.id,
    data: {
      type: "Idea",
      idea,
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
        className="opacity-30 bg-purple-50 p-4 h-[100px] min-h-[100px] items-center flex text-left rounded-xl border-2 border-purple-500 cursor-grab relative"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white p-4 min-h-[100px] items-start flex flex-col justify-center text-left rounded-xl hover:shadow-md transition-all duration-200 border border-transparent hover:border-purple-100 shadow-sm
        ${idea.isAiGenerated ? 'bg-gradient-to-br from-white to-purple-50 border-l-4 border-l-purple-400' : ''}
      `}
    >
      {idea.isAiGenerated && (
        <div className="absolute top-2 right-2 opacity-50">
            <Bot size={14} className="text-purple-600" />
        </div>
      )}
      
      <div className="flex w-full items-start gap-3 h-full">
        {/* Drag Handle */}
        <div {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-purple-500 -ml-1 mt-1">
           <GripVertical size={18} />
        </div>

        {/* Content */}
        <div className="flex-grow min-w-0 flex flex-col h-full">
            {isEditing ? (
            <textarea
                className="w-full bg-slate-50 border border-purple-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none min-h-[60px]"
                value={idea.content}
                autoFocus
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    setIsEditing(false);
                }
                }}
                onChange={(e) => updateIdea(idea.id, e.target.value)}
            />
            ) : (
            <p 
                onClick={() => setIsEditing(true)}
                className={`text-sm font-medium leading-relaxed cursor-text break-words whitespace-pre-wrap text-slate-700`}
            >
                {idea.content}
            </p>
            )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex w-full justify-end items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          {!idea.isAiGenerated && (
              <button
                onClick={() => optimizeIdea(idea.id, idea.content)}
                disabled={isOptimizing}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold transition-all ${isOptimizing ? 'text-purple-300' : 'text-purple-600 hover:bg-purple-50'}`}
              >
                <Sparkles size={14} className={isOptimizing ? "animate-spin" : ""} />
                {isOptimizing ? "Optimizing..." : "AI Optimize"}
              </button>
          )}
          
          <button 
             onClick={() => deleteIdea(idea.id)}
             className="text-slate-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
           >
             <Trash2 size={14} />
           </button>
      </div>
    </div>
  );
};

export default IdeaCard;
