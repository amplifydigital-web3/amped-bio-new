import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  leftText?: string;
  pattern?: string;
}

export function Input({ label, leftText, pattern, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {leftText && (
        <div className="flex overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 focus-within:rounded-md">
          <div className="flex items-center px-3 border-t border-b border-l border-gray-300 rounded-md rounded-r-none text-gray-500 bg-gray-50">
            {leftText}
          </div>
          <input
            className="flex-1 px-3 py-2 border rounded-md rounded-l-none border-gray-300 focus:ring-0 focus:outline-none"
            pattern={pattern}
            {...props}
          />
        </div>
      )}
      {!leftText && (
        <input
          className='w-full px-3 py-2 border rounded-md border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          pattern={pattern}
          {...props}
        />
      )}
    </div>
  );
}