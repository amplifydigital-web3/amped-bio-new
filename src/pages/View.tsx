import { Link, useParams } from 'react-router-dom';
import { Preview } from '../components/Preview';
import { Settings } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';

export function View() {
  const { onelink = '' } = useParams();
  const { authUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const user = useEditorStore((state) => state.user);
  const profile = useEditorStore((state) => state.profile);
  const setUser = useEditorStore((state) => state.setUser);

  useEffect(() => {

    if (onelink && onelink !== profile.onelink) {
      setLoading(true);
      setUser(onelink).then(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [onelink, profile, setUser]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Preview isEditing={false} onelink={onelink} />

      {/* Edit Button */}
      {authUser && authUser?.email === user.email && (
        <Link
          to={`/${onelink}/edit`}
          className="fixed bottom-4 right-4 p-3 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2"
        >
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Edit Page</span>
        </Link>
      )}

    </div>
  );
}