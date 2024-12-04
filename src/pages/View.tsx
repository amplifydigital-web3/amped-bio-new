import React from 'react';
import { Link } from 'react-router-dom';
import { Preview } from '../components/Preview';
import { Settings } from 'lucide-react';

export function View() {
  return (
    <div className="min-h-screen">
      <Preview />
      
      {/* Edit Button */}
      <Link
        to="/"
        className="fixed bottom-4 right-4 p-3 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
      >
        <Settings className="w-5 h-5" />
        <span className="text-sm font-medium">Edit Page</span>
      </Link>
    </div>
  );
}