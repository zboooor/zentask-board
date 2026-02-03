import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ArrowRight, Sparkles, Lock, UserPlus, LogIn, RefreshCw } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string) => void;
}

// Simple hash function for password storage
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// API base URL - use relative path (works for both dev and production)
const API_BASE = '';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUser, setIsCheckingUser] = useState(false);

  // Check if user exists in cloud when username changes (debounced)
  const checkUserExists = useCallback(async (userId: string) => {
    if (!userId.trim()) {
      setIsNewUser(null);
      return;
    }

    setIsCheckingUser(true);
    try {
      const response = await fetch(`${API_BASE}/api/feishu/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check',
          userId: userId.trim(),
          passwordHash: 'check', // dummy value for check action
        }),
      });

      const result = await response.json();
      if (result.success) {
        setIsNewUser(!result.exists);
      }
    } catch (err) {
      console.error('Error checking user:', err);
      // Fallback: assume new user on network error
      setIsNewUser(true);
    } finally {
      setIsCheckingUser(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username.trim()) {
        checkUserExists(username);
        setError('');
      } else {
        setIsNewUser(null);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [username, checkUserExists]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    setError('');

    try {
      const inputHash = await hashPassword(password);

      // For new user registration, validate passwords match
      if (isNewUser) {
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致');
          setIsLoading(false);
          return;
        }
        if (password.length < 4) {
          setError('密码至少需要 4 个字符');
          setIsLoading(false);
          return;
        }
      }

      // Use auto mode - server decides login or register based on user existence
      const response = await fetch(`${API_BASE}/api/feishu/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto',
          userId: username.trim(),
          passwordHash: inputHash,
        }),
      });

      const result = await response.json();
      if (result.success) {
        onLogin(username.trim());
      } else {
        setError(result.message || '操作失败，请重试');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('网络错误，请检查连接后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-white/50 backdrop-blur-sm">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-600 p-3 rounded-xl text-white shadow-lg shadow-indigo-200">
            <Layout size={32} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">欢迎使用轻计划</h1>
          <p className="text-slate-500">
            {isNewUser === null
              ? '输入用户名开始'
              : isNewUser
                ? '创建新账号'
                : '登录已有账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              用户名 / 工作区
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-slate-800 bg-slate-50 focus:bg-white"
              placeholder="例如：Alex"
              autoFocus
            />
          </div>

          {username.trim() && (
            <>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  <Lock size={14} className="inline mr-1" />
                  {isNewUser ? '设置密码' : '密码'}
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-slate-800 bg-slate-50 focus:bg-white"
                  placeholder={isNewUser ? '设置一个密码' : '输入密码'}
                />
              </div>

              {isNewUser && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    确认密码
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-slate-800 bg-slate-50 focus:bg-white"
                    placeholder="再次输入密码"
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 py-2 px-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!username.trim() || !password || isLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transform active:scale-[0.98]"
          >
            {isLoading ? (
              <span>处理中...</span>
            ) : isNewUser ? (
              <>
                <UserPlus size={18} />
                <span>创建并进入</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>登录</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;

