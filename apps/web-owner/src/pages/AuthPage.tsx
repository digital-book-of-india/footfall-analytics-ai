import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertTriangleIcon, ShieldIcon } from '../components/icons';
import { DbiLogo } from '../components/DbiLogo';

// Sleek Feather / Lucide style SVG icons
const MailIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UserIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const EyeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

export const AuthPage: React.FC = () => {
  const { login, register, error, clearError } = useAuth();
  const [isRegister, setIsRegister] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-6 sm:py-12 px-3.5 sm:px-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:28px_28px] opacity-10" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-blue-600/20 to-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Single Unified Card */}
      <div className="w-full max-w-[390px] sm:max-w-md relative z-10">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/50 border border-slate-800/10 p-5 sm:p-8">
          
          {/* Logo & Header in Card */}
          <div className="flex flex-col items-center mb-5 sm:mb-6">
            <div className="flex justify-center w-full py-1">
              <DbiLogo size="md" className="sm:hidden" />
              <DbiLogo size="lg" className="hidden sm:inline-flex" />
            </div>
            <h1 className="mt-2.5 sm:mt-3 text-lg sm:text-2xl font-black text-gray-900 tracking-tight text-center">
              DBI Footfall Analytics
            </h1>
            <p className="mt-0.5 text-[10px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-widest text-center">
              Store Owner Portal
            </p>
          </div>

          {/* Segmented Switch */}
          <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl sm:rounded-2xl mb-5 sm:mb-6">
            <button
              type="button"
              onClick={() => handleTabSwitch(false)}
              className={`py-2 text-xs font-bold rounded-xl transition duration-150 ${
                !isRegister
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch(true)}
              className={`py-2 text-xs font-bold rounded-xl transition duration-150 ${
                isRegister
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Register Owner
            </button>
          </div>

          {displayError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2.5 animate-fadeIn">
              <AlertTriangleIcon size={16} className="text-rose-600 mt-0.5 shrink-0" />
              <span className="font-medium">{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Owner Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <UserIcon size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rachel Adams"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <MailIcon size={16} />
                </div>
                <input
                  type="email"
                  required
                  placeholder="owner@store.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-gray-700">
                  Password
                </label>
                {isRegister && (
                  <span className="text-[10px] text-gray-400 font-medium">Min 6 characters</span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <LockIcon size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={isRegister ? 6 : undefined}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50/50 hover:bg-white focus:bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-3 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-500/25 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{isRegister ? 'Creating Account...' : 'Signing In...'}</span>
                </>
              ) : (
                isRegister ? 'Create Owner Account' : 'Sign In to Dashboard'
              )}
            </button>
          </form>

          {/* Switch tab prompt */}
          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
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

          {/* Security & Multi-tenant Badge */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] font-medium text-gray-400">
            <ShieldIcon size={13} className="text-emerald-500 shrink-0" />
            <span>Encrypted • Multi-Tenant Protected</span>
          </div>

        </div>
      </div>
    </div>
  );
};

