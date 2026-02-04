import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, AlertTriangle, FileText } from 'lucide-react';

interface CreateEncryptedDocDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (title: string, password: string) => void;
}

const CreateEncryptedDocDialog: React.FC<CreateEncryptedDocDialogProps> = ({
    isOpen,
    onClose,
    onCreate,
}) => {
    const [title, setTitle] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        setError('');

        if (!title.trim()) {
            setError('请输入文档名称');
            return;
        }

        if (password.length < 4) {
            setError('密码至少需要4个字符');
            return;
        }
        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            return;
        }

        onCreate(title.trim(), password);

        // Reset form
        setTitle('');
        setPassword('');
        setConfirmPassword('');
        setError('');
    };

    const handleClose = () => {
        setTitle('');
        setPassword('');
        setConfirmPassword('');
        setError('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[400px] max-w-[90vw] p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Lock size={20} className="text-orange-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">
                            新建加密文档
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
                        文档名称
                    </label>
                    <div className="relative">
                        <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-orange-500 text-slate-800"
                            placeholder="输入文档名称"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Password Fields */}
                <div className="space-y-4 mb-4 p-4 bg-orange-50 rounded-xl border border-orange-200">
                    {/* Warning */}
                    <div className="flex items-start gap-2 text-orange-700 text-sm">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <span>加密文档内容将被保护。<strong>忘记密码将无法恢复数据！</strong></span>
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
                                className="w-full px-3 py-2 pr-10 border border-orange-300 rounded-lg focus:outline-none focus:border-orange-500 bg-white"
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
                            className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:border-orange-500 bg-white"
                            placeholder="再次输入密码"
                        />
                    </div>
                </div>

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
                        className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                    >
                        🔒 创建加密文档
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateEncryptedDocDialog;
