import React from 'react';
import { Document, DocumentFolder, Id } from '../types';
import { FileText, Trash2, Clock, Folder, FolderLock, Lock, ChevronRight, ArrowLeft } from 'lucide-react';

interface DocumentListProps {
    documents: Document[];
    documentFolders: DocumentFolder[];
    unlockedFolders: Map<Id, string>; // folderId -> password
    unlockedDocs: Map<Id, string>; // docId -> password
    currentFolderId: Id | null;
    onFolderChange: (folderId: Id | null) => void;
    onSelectDocument: (doc: Document) => void;
    onDeleteDocument: (id: Id) => void;
    onDeleteFolder: (id: Id) => void;
    onUnlockFolder: (folder: DocumentFolder) => void;
    onUnlockDocument: (doc: Document) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
    documents,
    documentFolders,
    unlockedFolders,
    unlockedDocs,
    currentFolderId,
    onFolderChange,
    onSelectDocument,
    onDeleteDocument,
    onDeleteFolder,
    onUnlockFolder,
    onUnlockDocument,
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

    // Get current folder info
    const currentFolder = currentFolderId
        ? documentFolders.find(f => f.id === currentFolderId)
        : null;

    // Check if current folder is locked
    const isCurrentFolderLocked = currentFolder?.isEncrypted && !unlockedFolders.has(currentFolderId!);

    // Filter documents for current folder
    const currentDocuments = documents.filter(doc =>
        currentFolderId ? doc.folderId === currentFolderId : !doc.folderId
    );

    // Root level folders (only show at root)
    const rootFolders = currentFolderId ? [] : documentFolders;

    const handleFolderClick = (folder: DocumentFolder) => {
        if (folder.isEncrypted && !unlockedFolders.has(folder.id)) {
            onUnlockFolder(folder);
        } else {
            onFolderChange(folder.id);
        }
    };

    const handleDocumentClick = (doc: Document) => {
        if (doc.isEncrypted && !unlockedDocs.has(doc.id)) {
            onUnlockDocument(doc);
        } else {
            onSelectDocument(doc);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    {currentFolderId && (
                        <button
                            onClick={() => onFolderChange(null)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={20} className="text-slate-600" />
                        </button>
                    )}
                    <div className={`p-2 rounded-xl text-white shadow-lg ${currentFolder?.isEncrypted ? 'bg-amber-600 shadow-amber-200' : 'bg-emerald-600 shadow-emerald-200'}`}>
                        {currentFolder?.isEncrypted ? <FolderLock size={24} /> : <FileText size={24} />}
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">
                        {currentFolder ? currentFolder.title : '我的文档'}
                    </h2>
                </div>
            </div>

            {/* Locked folder message */}
            {isCurrentFolderLocked ? (
                <div className="text-center py-16">
                    <Lock size={48} className="mx-auto text-amber-400 mb-4" />
                    <p className="text-slate-500">此文件夹已加密，请解锁后查看</p>
                    <button
                        onClick={() => currentFolder && onUnlockFolder(currentFolder)}
                        className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                    >
                        解锁文件夹
                    </button>
                </div>
            ) : (
                <>
                    {/* Folders List (only at root) */}
                    {rootFolders.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-slate-500 mb-3">文件夹</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {rootFolders.map((folder) => (
                                    <div
                                        key={folder.id}
                                        onClick={() => handleFolderClick(folder)}
                                        className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group flex items-center gap-3"
                                    >
                                        {folder.isEncrypted ? (
                                            unlockedFolders.has(folder.id) ? (
                                                <Folder size={24} className="text-amber-600" />
                                            ) : (
                                                <FolderLock size={24} className="text-amber-600" />
                                            )
                                        ) : (
                                            <Folder size={24} className="text-blue-600" />
                                        )}
                                        <span className="font-medium text-slate-700 flex-1 truncate">
                                            {folder.title}
                                        </span>
                                        <ChevronRight size={16} className="text-slate-400" />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteFolder(folder.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 p-1 rounded transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Documents List */}
                    {currentDocuments.length === 0 && rootFolders.length === 0 ? (
                        <div className="text-center py-16">
                            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                            <p className="text-slate-500">还没有文档，点击右上角创建一个吧</p>
                        </div>
                    ) : currentDocuments.length > 0 ? (
                        <div className="space-y-3">
                            {currentDocuments.length > 0 && !currentFolderId && rootFolders.length > 0 && (
                                <h3 className="text-sm font-medium text-slate-500 mb-3">文档</h3>
                            )}
                            {currentDocuments.map((doc) => {
                                const isDocLocked = doc.isEncrypted && !unlockedDocs.has(doc.id);
                                return (
                                    <div
                                        key={doc.id}
                                        className={`bg-white rounded-xl p-4 shadow-sm border transition-all cursor-pointer group ${doc.isEncrypted
                                            ? 'border-orange-100 hover:border-orange-300 hover:shadow-md'
                                            : 'border-slate-100 hover:border-emerald-200 hover:shadow-md'
                                            }`}
                                        onClick={() => handleDocumentClick(doc)}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                {doc.isEncrypted && (
                                                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${isDocLocked ? 'bg-orange-100' : 'bg-green-100'}`}>
                                                        <Lock size={14} className={isDocLocked ? 'text-orange-500' : 'text-green-600'} />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`font-semibold truncate transition-colors ${doc.isEncrypted
                                                        ? 'text-slate-800 group-hover:text-orange-600'
                                                        : 'text-slate-800 group-hover:text-emerald-600'
                                                        }`}>
                                                        {isDocLocked ? '🔒 ' + (doc.title || '加密文档') : (doc.title || '无标题')}
                                                    </h3>
                                                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                                                        {isDocLocked ? '点击解锁查看内容' : (doc.content || '空文档')}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                                                        <Clock size={12} />
                                                        {formatDate(doc.updatedAt || doc.createdAt)}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteDocument(doc.id);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
};

export default DocumentList;
