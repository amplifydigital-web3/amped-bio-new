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
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [onelink, setOnelink] = useState('');
  const { signIn, signUp, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isSignUp) {
        const user = await signUp(onelink, email, password);
        toast.success('Account created successfully!');
        onClose(user);
      } else {
        const user = await signIn(email, password);
        toast.success('Welcome back!', { icon: '👋' });
        onClose(user);
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
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close authentication modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {isSignUp && (
            <Input
              label="Amped-Bio Name"
              value={onelink}
              onChange={(e) => setOnelink(e.target.value)}
              required
              aria-label="Amped-Bio username"
              autoComplete="username"
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
            pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
            aria-invalid={!email ? 'true' : 'false'}
          />

          <Input
            label="Password"
            name='password'
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={6}
            aria-invalid={password.length < 6 ? 'true' : 'false'}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            aria-disabled={loading}
            aria-label={loading ? 'Processing' : isSignUp ? 'Create account' : 'Sign in'}
          >
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Button>

          <p className="text-center text-sm text-gray-600">
            {isSignUp ? 'Already have an account?' : 'Don\'t have an account?'}{' '}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-600 hover:text-blue-700"
              aria-label={isSignUp ? 'Switch to sign in' : 'Switch to sign up'}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
