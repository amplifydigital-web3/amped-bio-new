"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const [session, setSession] = useState<{ user?: { name?: string; email?: string; image?: string | null } } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setSession(data);
    });
  }, []);

  const handleLogout = async () => {
    await authClient.signOut();
    setSession(null);
    setOpen(false);
    router.refresh();
  };

  if (!session?.user) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none bg-blue-600 text-white hover:bg-blue-700 h-9 px-4 text-sm space-x-2"
      >
        <User className="w-4 h-4" />
        <span>Sign In</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
            {session.user.name?.charAt(0) || "U"}
          </div>
        )}
        <span className="hidden md:inline">{session.user.name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            <button
              onClick={() => {
                const handle = session.user.name?.toLowerCase() || "";
                router.push(`/${handle}`);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              My Profile
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
