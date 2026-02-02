import React, { useState } from 'react';
import { Layout, ArrowRight, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username.trim());
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
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to ZenTask</h1>
          <p className="text-slate-500">Enter your name to access your personal workspace and synced history.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              Username / Workspace
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all text-slate-800 bg-slate-50 focus:bg-white"
              placeholder="e.g. Alex"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!username.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transform active:scale-[0.98]"
          >
            <span>Enter Workspace</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <Sparkles size={14} />
                <span>Powered by Gemini AI 3.0</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
