import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import toast from 'react-hot-toast';
import type { AuthUser } from '../../types/auth';

interface AuthModalProps {
  onClose: (user: AuthUser) => void;
  onCancel: () => void;
}

export function AuthModal({ onClose, onCancel }: AuthModalProps) {
  const [form, setForm] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [onelink, setOnelink] = useState('');
  const { signIn, signUp, loading, resetPassword } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      switch (form) {
        case 'register': {
          const atURL = `@${onelink}`;
          const user = await signUp(atURL, email, password);
          toast.success('Account created successfully!');
          return onClose(user);
        }

        case 'login': {
          const user = await signIn(email, password);
          toast.success('Welcome back!', { icon: '👋' });
          return onClose(user);
        }

        case 'reset': {
          await resetPassword(email);
          toast.success('Reset email sent!');
          return onCancel();
        }
      }
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 id="auth-modal-title" className="text-xl font-semibold">
            {form === 'register' && 'Create Account'}
            {form === 'login' && 'Sign In'}
            {form === 'reset' && 'Reset Password'}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close authentication modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {form === 'register' && (
            <Input
              label="Amped-Bio Unique URL"
              value={onelink}
              onChange={(e) => setOnelink(e.target.value)}
              required
              aria-label="Amped-Bio Unique URL"
              autoComplete="username"
              placeholder={'your-url'}
            />
          )}
          <Input
            label="Email"
            type="email"
            name='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email address"
            autoComplete="email"
            pattern="^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
            aria-invalid={!email ? 'true' : 'false'}
          />

          {form !== 'reset' && (
            <Input
              label="Password"
              name='password'
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Password"
              autoComplete={form === 'register' ? 'new-password' : 'current-password'}
              minLength={6}
              aria-invalid={password.length < 6 ? 'true' : 'false'}
            />)}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            aria-disabled={loading}
            aria-label={form}
          >
            {loading && 'Loading...'}
            {form === 'register' && 'Create Account'}
            {form === 'login' && 'Sign In'}
            {form === 'reset' && 'Reset Password'}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-600 mt-2">
          {form !== 'login' && (
            <>
              {'Already have an account?'}
              <button
                type="button"
                onClick={() => setForm('login')}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label={'Switch to sign in'}
              >
                {'Sign In'}
              </button>
            </>
          )}
          {form === 'login' && (
            <>
              {'Don\'t have an account?'}
              <button
                type="button"
                onClick={() => setForm('register')}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label={'Switch to sign up'}
              >
                {'Sign Up'}
              </button>
            </>
          )}
        </p>
        <p className="text-center text-sm text-gray-600 mt-1">
          {form !== 'reset' && (
            <button
              type="button"
              onClick={() => setForm('reset')}
              className="text-blue-600 hover:text-blue-700 ml-2"
              aria-label={'Forgot Password'}
            >
              {'Forgot Password'}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
