import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

export function AdminBreadcrumb() {
  const location = useLocation();

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split("/").filter(Boolean);

    if (pathSegments.length === 1 && pathSegments[0] === "admin") {
      return [{ label: "Dashboard" }];
    }

    const breadcrumbs: BreadcrumbItem[] = [{ label: "Dashboard", path: "/admin" }];

    switch (pathSegments[1]) {
      case "users":
        breadcrumbs.push({ label: "User Management" });
        break;
      case "themes":
        breadcrumbs.push({ label: "Theme Management" });
        break;
      case "blocks":
        breadcrumbs.push({ label: "Block Management" });
        break;
      case "settings":
        breadcrumbs.push({ label: "Settings" });
        break;
      default:
        break;
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex items-center space-x-1 text-sm text-gray-500 mb-4">
      <Home className="h-4 w-4" />
      <span>Admin</span>
      {breadcrumbs.map((item, index) => (
        <div key={index} className="flex items-center space-x-1">
          <ChevronRight className="h-4 w-4" />
          {item.path ? (
            <Link to={item.path} className="hover:text-blue-600 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </div>
  );
}
