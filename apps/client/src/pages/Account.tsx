import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft } from "lucide-react";
import { EmailChangeDialog } from "@/components/dialogs/EmailChangeDialog";

export function Account() {
  const { authUser } = useAuthStore();
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);

  if (!authUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="text-xl font-bold text-gray-800">Please Login</div>
        <p className="text-gray-600 mt-2">
          You need to be logged in to view your account information.
        </p>
        <Link to="/" className="mt-6 text-blue-600 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm z-[10]">
        <div className="flex items-center">
          <Link to={`/@${authUser.onelink}/edit`} className="flex items-center text-gray-700 hover:text-gray-900 mr-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="font-medium">Back to Editor</span>
          </Link>
          <h1 className="text-lg font-semibold">My Account</h1>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-800 mb-4">Profile Details</h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Email</p>
              <div className="flex items-center mt-1">
                <p className="text-base font-medium text-gray-900">{authUser.email}</p>
                <button
                  onClick={() => setIsEmailDialogOpen(true)}
                  className="ml-3 text-sm text-blue-600 hover:text-blue-800"
                >
                  Change
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500">Account ID</p>
              <p className="mt-1 text-base font-medium text-gray-900">{authUser.id}</p>
            </div>
          </div>
        </div>
        
        {/* Email Change Dialog */}
        <EmailChangeDialog 
          isOpen={isEmailDialogOpen}
          onClose={() => setIsEmailDialogOpen(false)}
        />
      </div>
    </div>
  );
}
