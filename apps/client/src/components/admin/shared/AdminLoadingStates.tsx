import { ShieldAlert } from "lucide-react";

interface AdminLoadingErrorProps {
  onRetry: () => void;
}

export const AdminLoadingSpinner = () => {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-lg font-medium text-gray-700">Loading admin dashboard...</p>
      </div>
    </div>
  );
};

export const AdminLoadingError = ({ onRetry }: AdminLoadingErrorProps) => {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <p className="text-lg font-medium text-gray-700">Failed to load admin data</p>
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
};
