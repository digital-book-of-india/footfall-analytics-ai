import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: any, token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Login failed');

      const user = data.data.user;
      const token = data.data.accessToken || data.data.token;

      if (user.role !== 'SUPER_ADMIN') {
        throw new Error('Access Denied: Super Admin credentials required');
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <ShieldAlert className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold text-white">DBI Intelligence</h1>
            <p className="text-xs text-slate-400">Super Admin Portal</p>
          </div>
        </div>
        {error && <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded mb-4 text-xs">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-medium mb-1">Admin Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-sm text-white outline-none focus:border-amber-500" 
              placeholder="admin@dbi.local" 
              required 
            />
          </div>
          <div>
            <label className="block text-slate-300 text-xs font-medium mb-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-sm text-white outline-none focus:border-amber-500" 
              placeholder="••••••••" 
              required 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2.5 rounded text-sm transition disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
