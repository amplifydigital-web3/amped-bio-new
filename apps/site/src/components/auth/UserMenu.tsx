"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
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
  };

  if (!session?.user) {
    return (
      <div className="flex items-center space-x-3">
        <Link
          href="/login"
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="text-sm font-medium px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Sign Up
        </Link>
      </div>
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
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-medium">
            {session.user.name?.charAt(0) || "U"}
          </div>
        )}
        <span className="hidden md:inline">{session.user.name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
            <Link
              href={`/${session.user.name?.toLowerCase() || ""}`}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setOpen(false)}
            >
              My Profile
            </Link>
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
