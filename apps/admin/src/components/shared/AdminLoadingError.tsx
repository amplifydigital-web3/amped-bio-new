interface AdminLoadingErrorProps {
  onRetry?: () => void;
}

export function AdminLoadingError({ onRetry }: AdminLoadingErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className="text-red-600 text-lg">Failed to load data</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800"
        >
          Retry
        </button>
      )}
    </div>
  );
}
