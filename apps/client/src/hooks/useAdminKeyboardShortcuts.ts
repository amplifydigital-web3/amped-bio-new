import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export function useAdminKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when Ctrl/Cmd + Alt are pressed
      if ((event.ctrlKey || event.metaKey) && event.altKey) {
        let navigateTo = '';
        let pageName = '';
        
        switch (event.key) {
          case 'd':
            navigateTo = '/admin';
            pageName = 'Dashboard';
            break;
          case 'u':
            navigateTo = '/admin/users';
            pageName = 'User Management';
            break;
          case 't':
            navigateTo = '/admin/themes';
            pageName = 'Theme Management';
            break;
          case 'b':
            navigateTo = '/admin/blocks';
            pageName = 'Block Management';
            break;
          case 'f':
            navigateTo = '/admin/files';
            pageName = 'File Management';
            break;
          case 's':
            navigateTo = '/admin/settings';
            pageName = 'Admin Settings';
            break;
          default:
            return;
        }

        event.preventDefault();
        
        // Only navigate if we're not already on that page
        if (location.pathname !== navigateTo) {
          navigate(navigateTo);
          
          // Show notification if global function is available
          if (typeof (window as any).adminNotify !== 'undefined') {
            (window as any).adminNotify.info(
              `Navigated to ${pageName}`,
              `Keyboard shortcut: ⌘⌥${event.key.toUpperCase()}`
            );
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate, location.pathname]);
}
