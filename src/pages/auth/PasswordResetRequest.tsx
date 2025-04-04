import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { requestPasswordReset } from '../../api/api';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader } from 'lucide-react';
import type { PasswordResetResponse } from '../../api/api.types';

// Define the validation schema using Zod
const passwordResetSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

// Infer the type from the schema
type PasswordResetFormData = z.infer<typeof passwordResetSchema>;

export function PasswordResetRequest() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const errorParam = queryParams.get('error');
  const emailParam = queryParams.get('email');

  // Initialize react-hook-form with zod resolver
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PasswordResetFormData>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      email: emailParam || '',
    },
  });

  useEffect(() => {
    // Set email from URL parameter if available
    if (emailParam) {
      setValue('email', emailParam);
    }

    // Handle error passed in URL parameters
    if (errorParam) {
      setStatus('error');
      switch (errorParam) {
        case 'userNotFound':
          setMessage('User not found');
          break;
        case 'tokenGenerationFailed':
          setMessage('Failed to generate reset token');
          break;
        case 'emailSendFailed':
          setMessage('Failed to send reset email');
          break;
        case 'serverError':
          setMessage('Server error occurred');
          break;
        default:
          setMessage('An error occurred');
      }
    }
  }, [errorParam, emailParam, setValue]);

  const onSubmit = async (data: PasswordResetFormData) => {
    setStatus('loading');

    try {
      const response: PasswordResetResponse = await requestPasswordReset(data.email);
      
      if (response.success) {
        setStatus('success');
        setMessage(response.message || 'Password reset instructions have been sent to your email.');
      } else {
        setStatus('error');
        setMessage(response.message || 'Failed to request password reset');
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-800">Reset Your Password</h1>
        
        {status === 'idle' || status === 'error' || status === 'loading' ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="form-group space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
              <input
                type="email"
                id="email"
                className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Enter your email address"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
            
            {status === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{message}</p>
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? (
                <div className="flex items-center justify-center">
                  <Loader className="inline mr-2 w-4 h-4 animate-spin" />
                  <span>Sending...</span>
                </div>
              ) : 'Send Reset Link'}
            </button>
            
            <div className="text-center pt-2">
              <Link to="/" className="text-primary hover:text-primary-dark text-sm transition-colors">
                Back to Home
              </Link>
            </div>
          </form>
        ) : status === 'success' ? (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Email Sent!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-gray-600">Please check your inbox for further instructions to reset your password.</p>
            <Link to="/" className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors">
              Go to Home
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
