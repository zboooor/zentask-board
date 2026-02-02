import React, { useState, useEffect } from 'react';
import { Layout, ArrowRight, Sparkles, Lock, UserPlus, LogIn } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string) => void;
}

// Simple hash function for password storage (not cryptographically secure, but sufficient for local storage)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const PASSWORD_STORAGE_PREFIX = 'zentask_pwd_';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check if user exists when username changes
  useEffect(() => {
    if (username.trim()) {
      const storedHash = localStorage.getItem(`${PASSWORD_STORAGE_PREFIX}${username.trim().toLowerCase()}`);
      setIsNewUser(!storedHash);
      setError('');
    } else {
      setIsNewUser(null);
    }
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsLoading(true);
    setError('');

    const normalizedUsername = username.trim().toLowerCase();
    const storedHash = localStorage.getItem(`${PASSWORD_STORAGE_PREFIX}${normalizedUsername}`);

    try {
      const inputHash = await hashPassword(password);

      if (storedHash) {
        // Existing user - verify password
        if (inputHash === storedHash) {
          onLogin(username.trim());
        } else {
          setError('密码错误，请重试');
        }
      } else {
        // New user - register
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
        localStorage.setItem(`${PASSWORD_STORAGE_PREFIX}${normalizedUsername}`, inputHash);
        onLogin(username.trim());
      }
    } catch (err) {
      setError('登录出错，请重试');
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

        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Sparkles size={14} />
            <span>Powered by Gemini AI</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;

