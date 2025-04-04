import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import toast from 'react-hot-toast';
import type { AuthUser } from '../../types/auth';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginData, RegisterData } from '../../api/api.types';
import { Link } from 'react-router-dom';

interface AuthModalProps {
  onClose: (user: AuthUser) => void;
  onCancel: () => void;
}

// Define validation schemas using Zod
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

const registerSchema = z.object({
  onelink: z
    .string()
    .min(3, 'URL must be at least 3 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'URL can only contain letters, numbers, underscores and hyphens'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

// Create union type for all form types
type FormType = 'login' | 'register' | 'reset';

export function AuthModal({ onClose, onCancel }: AuthModalProps) {
  const [form, setForm] = useState<FormType>('login');
  const { signIn, signUp, resetPassword } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [sharedEmail, setSharedEmail] = useState('');

  // Use react-hook-form with zod resolver based on current form type
  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: loginErrors },
    setValue: setLoginValue,
    watch: watchLogin,
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: sharedEmail,
    },
  });

  const {
    register: registerSignUp,
    handleSubmit: handleSubmitSignUp,
    formState: { errors: registerErrors },
    setValue: setRegisterValue,
    watch: watchRegister,
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
    defaultValues: {
      email: sharedEmail,
    },
  });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: resetErrors },
    setValue: setResetValue,
    watch: watchReset,
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    mode: 'onBlur',
    defaultValues: {
      email: sharedEmail,
    },
  });

  // Watch for changes in email fields across all forms
  useEffect(() => {
    const loginEmail = watchLogin('email');
    if (loginEmail !== sharedEmail) {
      setSharedEmail(loginEmail || '');
    }
  }, [watchLogin('email')]);

  useEffect(() => {
    const registerEmail = watchRegister('email');
    if (registerEmail !== sharedEmail) {
      setSharedEmail(registerEmail || '');
    }
  }, [watchRegister('email')]);

  useEffect(() => {
    const resetEmail = watchReset('email');
    if (resetEmail !== sharedEmail) {
      setSharedEmail(resetEmail || '');
    }
  }, [watchReset('email')]);

  // Update form values when shared email changes
  useEffect(() => {
    setLoginValue('email', sharedEmail);
    setRegisterValue('email', sharedEmail);
    setResetValue('email', sharedEmail);
  }, [sharedEmail]);

  // Custom form switcher that maintains email
  const switchForm = (newForm: FormType) => {
    setForm(newForm);
  };

  // Handle login form submission
  const onSubmitLogin = async (data: z.infer<typeof loginSchema>) => {
    setLoading(true);
    try {
      const loginData: LoginData = {
        email: data.email,
        password: data.password,
      };

      const user = await signIn(loginData.email, loginData.password);
      toast.success('Welcome back!', { icon: '👋' });
      onClose(user);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Handle register form submission
  const onSubmitRegister = async (data: z.infer<typeof registerSchema>) => {
    setLoading(true);
    try {
      const registerData: RegisterData = {
        onelink: `@${data.onelink}`,
        email: data.email,
        password: data.password,
      };

      const user = await signUp(registerData.onelink, registerData.email, registerData.password);
      toast.success('Account created successfully!');
      onClose(user);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Handle password reset form submission
  const onSubmitReset = async (data: z.infer<typeof resetSchema>) => {
    setLoading(true);
    try {
      const response = await resetPassword(data.email);
      toast.success('Reset email sent!');
      onCancel();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
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

        {form === 'login' && (
          <form onSubmit={handleSubmitLogin(onSubmitLogin)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              error={loginErrors.email?.message}
              required
              aria-label="Email address"
              autoComplete="email"
              {...registerLogin('email')}
            />
            <Input
              label="Password"
              type="password"
              error={loginErrors.password?.message}
              required
              aria-label="Password"
              autoComplete="current-password"
              {...registerLogin('password')}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              aria-disabled={loading}
              aria-label="Sign In"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        )}

        {form === 'register' && (
          <form onSubmit={handleSubmitSignUp(onSubmitRegister)} className="space-y-4">
            <Input
              label="Amped-Bio Unique URL"
              leftText="@"
              error={registerErrors.onelink?.message}
              required
              aria-label="Amped-Bio Unique URL"
              autoComplete="username"
              placeholder="your-url"
              {...registerSignUp('onelink')}
            />
            <Input
              label="Email"
              type="email"
              error={registerErrors.email?.message}
              required
              aria-label="Email address"
              autoComplete="email"
              {...registerSignUp('email')}
            />
            <Input
              label="Password"
              type="password"
              error={registerErrors.password?.message}
              required
              aria-label="Password"
              autoComplete="new-password"
              {...registerSignUp('password')}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              aria-disabled={loading}
              aria-label="Create Account"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
          </form>
        )}

        {form === 'reset' && (
          <form onSubmit={handleSubmitReset(onSubmitReset)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              error={resetErrors.email?.message}
              required
              aria-label="Email address"
              autoComplete="email"
              {...registerReset('email')}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              aria-disabled={loading}
              aria-label="Reset Password"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </Button>

            <div className="text-center text-sm text-gray-600 mt-2">
              Have a password reset token?
              <Link
                to="/auth/reset-password/token"
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label="Use reset token"
              >
                Reset here
              </Link>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-gray-600 mt-2">
          {form !== 'login' && (
            <>
              {'Already have an account?'}
              <button
                type="button"
                onClick={() => switchForm('login')}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label={'Switch to sign in'}
              >
                {'Sign In'}
              </button>
            </>
          )}
          {form === 'login' && (
            <>
              {"Don't have an account?"}
              <button
                type="button"
                onClick={() => switchForm('register')}
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
              onClick={() => switchForm('reset')}
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
