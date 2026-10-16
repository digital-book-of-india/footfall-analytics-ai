import React, { useState } from 'react';
import { adminFetch } from '../api';

interface LoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('admin@dbi.ai');
  const [password, setPassword] = useState('Password@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res: any = await adminFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const token = res?.tokens?.accessToken || res?.token;
      const user = res?.user;

      if (!token || !user) {
        throw new Error('Invalid server authentication envelope');
      }

      if (user.role !== 'SUPER_ADMIN') {
        throw new Error('Access denied: Requires SUPER_ADMIN privileges');
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white border border-slate-200 p-8 rounded-2xl w-full max-w-sm shadow-xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <img 
            src="/logo.jpeg" 
            alt="DBI Logo" 
            className="w-14 h-14 object-contain rounded-xl border border-slate-100 shadow-sm" 
          />
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">DBI Intelligence</h1>
            <p className="text-xs text-slate-500 font-medium">Super Admin Portal</p>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Admin Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white transition shadow-2xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white transition shadow-2xs"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white font-semibold text-xs py-2.5 rounded-lg transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
