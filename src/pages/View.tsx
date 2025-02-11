import { Link } from 'react-router-dom';
import { Preview } from '../components/Preview';
import { Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function View() {
  const { user } = useAuthStore();
  console.log({ user });
  return (
    <div className="min-h-screen">
      <Preview isEditing={false} />

      {/* Edit Button */}
      {user && (
        <Link
          to="/edit"
          className="fixed bottom-4 right-4 p-3 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Edit Page</span>
        </Link>
      )}

    </div>
  );
}