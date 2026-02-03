import React from 'react';
import { Document, Id } from '../types';
import { Plus, FileText, Trash2, Clock } from 'lucide-react';

interface DocumentListProps {
    documents: Document[];
    onSelect: (doc: Document) => void;
    onCreate: () => void;
    onDelete: (id: Id) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
    documents,
    onSelect,
    onCreate,
    onDelete,
}) => {
    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="w-full max-w-3xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg shadow-emerald-200">
                        <FileText size={24} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">我的文档</h2>
                </div>
                <button
                    onClick={onCreate}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-emerald-100"
                >
                    <Plus size={18} />
                    新建文档
                </button>
            </div>

            {/* Document List */}
            {documents.length === 0 ? (
                <div className="text-center py-16">
                    <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500">还没有文档，点击右上角创建一个吧</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {documents.map((doc) => (
                        <div
                            key={doc.id}
                            className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer group"
                            onClick={() => onSelect(doc)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-slate-800 truncate group-hover:text-emerald-600 transition-colors">
                                        {doc.title || '无标题'}
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                                        {doc.content || '空文档'}
                                    </p>
                                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                                        <Clock size={12} />
                                        {formatDate(doc.updatedAt || doc.createdAt)}
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(doc.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentList;
