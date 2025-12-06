import { FormEvent, useState } from "react";
import { useLocation } from "wouter";

const USERNAME_KEY = "auth_username";
const TOKEN_KEY = "auth_token";

const expectedUsername = import.meta.env.VITE_AUTH_USERNAME || "admin";
const expectedPassword = import.meta.env.VITE_AUTH_PASSWORD || "password";

export function isAuthenticated() {
  if (typeof window === "undefined") return false;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const username = window.localStorage.getItem(USERNAME_KEY);
  return !!token && !!username;
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USERNAME_KEY);
}

export function LoginPage() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const ok = username === expectedUsername && password === expectedPassword;
    if (!ok) {
      setLoading(false);
      setError("Invalid username or password");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(USERNAME_KEY, username);
      window.localStorage.setItem(TOKEN_KEY, "ok");
    }

    setLoading(false);
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-sky-400/80">Private Console</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Marham.pk Scraper</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to access the internal scraping dashboard.</p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl shadow-black/50 backdrop-blur">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                autoComplete="username"
                placeholder="Enter username"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                autoComplete="current-password"
                placeholder="Enter password"
              />
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-[11px] text-slate-500 text-center">
            Access is restricted. Share credentials only with trusted collaborators.
          </p>
        </div>
      </div>
    </div>
  );
}
