import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";

interface NotificationProps {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
  duration?: number;
  onDismiss: (id: string) => void;
}

export function AdminNotification({
  id,
  type,
  title,
  message,
  duration = 5000,
  onDismiss,
}: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 300); // Wait for animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
  };

  const colors = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  };

  const iconColors = {
    success: "text-green-400",
    error: "text-red-400",
    info: "text-blue-400",
    warning: "text-yellow-400",
  };

  const Icon = icons[type];

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full transition-all duration-300 transform ${
        isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      }`}
    >
      <div className={`rounded-lg border p-4 shadow-lg ${colors[type]}`}>
        <div className="flex items-start">
          <Icon className={`h-5 w-5 mt-0.5 ${iconColors[type]}`} />
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium">{title}</h3>
            {message && <p className="mt-1 text-sm opacity-90">{message}</p>}
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onDismiss(id), 300);
            }}
            className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface NotificationContextType {
  notifications: Array<{
    id: string;
    type: "success" | "error" | "info" | "warning";
    title: string;
    message?: string;
    duration?: number;
  }>;
  addNotification: (notification: Omit<NotificationContextType["notifications"][0], "id">) => void;
  removeNotification: (id: string) => void;
}

export function AdminNotificationContainer() {
  const [notifications, setNotifications] = useState<NotificationContextType["notifications"]>([]);

  const addNotification = (
    notification: Omit<NotificationContextType["notifications"][0], "id">
  ) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...notification, id }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Expose functions globally for easy access
  useEffect(() => {
    (window as any).adminNotify = {
      success: (title: string, message?: string) =>
        addNotification({ type: "success", title, message }),
      error: (title: string, message?: string) =>
        addNotification({ type: "error", title, message }),
      info: (title: string, message?: string) => addNotification({ type: "info", title, message }),
      warning: (title: string, message?: string) =>
        addNotification({ type: "warning", title, message }),
    };
  }, []);

  return (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-2">
      {notifications.map(notification => (
        <AdminNotification key={notification.id} {...notification} onDismiss={removeNotification} />
      ))}
    </div>
  );
}
