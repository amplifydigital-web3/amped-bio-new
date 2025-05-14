import { ReactNode } from "react";

interface AdminHeaderProps {
  title: string;
}

export const AdminHeader = ({ title }: AdminHeaderProps) => {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium">
            A
          </div>
          <span className="font-medium">Admin</span>
        </div>
      </div>
    </header>
  );
};

interface AdminPlaceholderContentProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export const AdminPlaceholderContent = ({ icon, title, description }: AdminPlaceholderContentProps) => {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="bg-white p-12 rounded-lg border border-gray-200 shadow-sm flex items-center justify-center">
        <div className="text-center">
          {icon}
          <h2 className="text-xl font-semibold text-gray-700 mb-2">{title}</h2>
          <p className="text-gray-500 mb-6">{description}</p>
        </div>
      </div>
    </div>
  );
};
