import React, { useState, useEffect, useCallback } from 'react';
import { Document, Id } from '../types';
import { ArrowLeft, FileText, Check, Loader2 } from 'lucide-react';

interface DocumentEditorProps {
    document: Document;
    onBack: () => void;
    onUpdate: (id: Id, title: string, content: string) => void;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({
    document,
    onBack,
    onUpdate,
}) => {
    const [title, setTitle] = useState(document.title);
    const [content, setContent] = useState(document.content);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Debounced auto-save
    useEffect(() => {
        const timer = setTimeout(() => {
            if (title !== document.title || content !== document.content) {
                setIsSaving(true);
                onUpdate(document.id, title, content);
                setTimeout(() => {
                    setIsSaving(false);
                    setLastSaved(new Date());
                }, 500);
            }
        }, 1000); // Auto-save after 1 second of inactivity

        return () => clearTimeout(timer);
    }, [title, content, document.id, document.title, document.content, onUpdate]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors"
                >
                    <ArrowLeft size={20} />
                    返回列表
                </button>

                <div className="flex items-center gap-2 text-sm text-slate-400">
                    {isSaving ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            保存中...
                        </>
                    ) : lastSaved ? (
                        <>
                            <Check size={14} className="text-emerald-500" />
                            已保存 {formatTime(lastSaved)}
                        </>
                    ) : null}
                </div>
            </div>

            {/* Title */}
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文档标题"
                className="text-2xl font-bold text-slate-800 bg-transparent border-none outline-none mb-4 placeholder-slate-300"
            />

            {/* Content */}
            <div className="flex-1 min-h-0">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="开始编辑文档内容...

支持多行文本，按 Enter 换行。"
                    className="w-full h-full resize-none bg-white rounded-xl p-4 border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-700 leading-relaxed"
                    style={{ minHeight: '400px' }}
                />
            </div>
        </div>
    );
};

export default DocumentEditor;
