import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface UnlockDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onUnlock: (password: string) => Promise<boolean>;
    columnTitle: string;
}

const UnlockDialog: React.FC<UnlockDialogProps> = ({
    isOpen,
    onClose,
    onUnlock,
    columnTitle
}) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!password) {
            setError('请输入密码');
            return;
        }

        setError('');
        setIsVerifying(true);

        try {
            const success = await onUnlock(password);
            if (success) {
                setPassword('');
                onClose();
            } else {
                setError('密码错误');
            }
        } catch (err) {
            setError('解密失败');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleClose = () => {
        setPassword('');
        setError('');
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[360px] max-w-[90vw] p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <Lock size={20} className="text-amber-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">解锁加密内容</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Column Name */}
                <p className="text-sm text-slate-500 mb-4">
                    正在解锁：<span className="font-medium text-slate-700">{columnTitle}</span>
                </p>

                {/* Password Input */}
                <div className="mb-4">
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full px-3 py-3 pr-10 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                            placeholder="输入解锁密码"
                            autoFocus
                            disabled={isVerifying}
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

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                        disabled={isVerifying}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isVerifying}
                        className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        {isVerifying ? '验证中...' : '🔓 解锁'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UnlockDialog;
