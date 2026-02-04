import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, AlertTriangle, FolderPlus } from 'lucide-react';

interface CreateFolderDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (title: string, isEncrypted: boolean, password?: string) => void;
}

const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
    isOpen,
    onClose,
    onCreate,
}) => {
    const [title, setTitle] = useState('');
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        setError('');

        if (!title.trim()) {
            setError('请输入文件夹名称');
            return;
        }

        if (isEncrypted) {
            if (password.length < 4) {
                setError('密码至少需要4个字符');
                return;
            }
            if (password !== confirmPassword) {
                setError('两次输入的密码不一致');
                return;
            }
        }

        onCreate(title.trim(), isEncrypted, isEncrypted ? password : undefined);

        // Reset form
        setTitle('');
        setIsEncrypted(false);
        setPassword('');
        setConfirmPassword('');
        setError('');
    };

    const handleClose = () => {
        setTitle('');
        setIsEncrypted(false);
        setPassword('');
        setConfirmPassword('');
        setError('');
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isEncrypted) {
            handleSubmit();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[400px] max-w-[90vw] p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-cyan-100 rounded-lg">
                            <FolderPlus size={20} className="text-cyan-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">
                            新建文件夹
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Title Input */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                        文件夹名称
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-cyan-500 text-slate-800"
                        placeholder="输入文件夹名称"
                        autoFocus
                    />
                </div>

                {/* Encryption Toggle */}
                <div className="mb-4">
                    <div
                        onClick={() => setIsEncrypted(!isEncrypted)}
                        className="flex items-center gap-3 cursor-pointer"
                    >
                        <div className={`relative w-12 h-6 rounded-full transition-colors ${isEncrypted ? 'bg-amber-500' : 'bg-slate-200'}`}>
                            <div
                                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isEncrypted ? 'translate-x-7' : 'translate-x-1'}`}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Lock size={16} className={isEncrypted ? 'text-amber-500' : 'text-slate-400'} />
                            <span className={`font-medium ${isEncrypted ? 'text-amber-600' : 'text-slate-600'}`}>
                                加密文件夹
                            </span>
                        </div>
                    </div>
                </div>

                {/* Password Fields (shown when encrypted) */}
                {isEncrypted && (
                    <div className="space-y-4 mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                        {/* Warning */}
                        <div className="flex items-start gap-2 text-amber-700 text-sm">
                            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                            <span>加密后文件夹内所有文档将被保护。<strong>忘记密码将无法恢复数据！</strong></span>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-2">
                                设置密码
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
                                    placeholder="输入加密密码"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password Input */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-2">
                                确认密码
                            </label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
                                placeholder="再次输入密码"
                            />
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors ${isEncrypted
                            ? 'bg-amber-500 hover:bg-amber-600'
                            : 'bg-cyan-600 hover:bg-cyan-700'
                            }`}
                    >
                        {isEncrypted ? '🔒 创建加密' : '创建'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateFolderDialog;
