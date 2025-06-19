import { RefreshCw, Download, Plus } from "lucide-react";
import { ReactNode } from "react";

interface AdminQuickActionsProps {
  title: string;
  description?: string;
  onRefresh?: () => void;
  onExport?: () => void;
  onAdd?: () => void;
  addButtonText?: string;
  isLoading?: boolean;
  children?: ReactNode;
}

export function AdminQuickActions({
  title,
  description,
  onRefresh,
  onExport,
  onAdd,
  addButtonText = "Add New",
  isLoading = false,
  children
}: AdminQuickActionsProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="text-gray-600 mt-1">{description}</p>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          {children}
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          )}
          
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          )}
          
          {onAdd && (
            <button
              onClick={onAdd}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-2" />
              {addButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
