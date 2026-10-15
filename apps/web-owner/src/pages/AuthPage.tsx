import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ActivityIcon, AlertTriangleIcon } from '../components/icons';
import { api } from '../services/apiClient';

export const AuthPage: React.FC = () => {
  const { login, register, error, clearError } = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleTabSwitch = (registerMode: boolean) => {
    setIsRegister(registerMode);
    clearError();
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    if (!email.trim() || !password) {
      setValidationError('Please enter both email address and password');
      return;
    }

    if (isRegister) {
      if (!name.trim()) {
        setValidationError('Please enter your full name');
        return;
      }
      if (password.length < 6) {
        setValidationError('Password must be at least 6 characters long');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch {
      // Handled in auth context
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = validationError || error;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/30">
            <ActivityIcon size={32} />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-white tracking-tight">
          DBI Footfall Analytics
        </h2>
        <p className="mt-1 text-center text-xs text-blue-200 uppercase tracking-widest font-semibold">
          Store Owner Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-gray-100">
          {/* Tabs: Sign In / Register */}
          <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => handleTabSwitch(false)}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition ${
                !isRegister ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch(true)}
              className={`w-1/2 py-2 text-xs font-bold rounded-lg transition ${
                isRegister ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Register Owner
            </button>
          </div>

          {displayError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangleIcon size={16} className="text-rose-600 mt-0.5 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Owner Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rachel Adams"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="owner@store.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Password
                </label>
                {isRegister && (
                  <span className="text-[10px] text-gray-400">Min 6 characters</span>
                )}
              </div>
              <input
                type="password"
                required
                minLength={isRegister ? 6 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-500/20 transition disabled:opacity-50"
            >
              {isSubmitting
                ? (isRegister ? 'Creating Account...' : 'Signing In...')
                : isRegister
                ? 'Create Owner Account'
                : 'Sign In to Dashboard'}
            </button>
          </form>

          {/* Switch tab prompt */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            {isRegister ? (
              <p className="text-xs text-gray-500">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleTabSwitch(false)}
                  className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Sign In
                </button>
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Don't have an owner account?{' '}
                <button
                  type="button"
                  onClick={() => handleTabSwitch(true)}
                  className="font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Register here
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
