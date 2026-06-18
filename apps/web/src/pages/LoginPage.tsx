/**
 * Login Page — Real Authentication
 *
 * Two-tab interface for Login and Register.
 * Uses email + password with proper validation and error handling.
 */

import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";

type AuthTab = "login" | "register";

export function LoginPage() {
  const navigate = useNavigate();
  const { currentUserId, login, register, loading: authLoading } = useUser();

  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && currentUserId) {
      navigate("/", { replace: true });
    }
  }, [currentUserId, authLoading, navigate]);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setConfirmPassword("");
    setError(null);
  };

  const handleTabSwitch = (newTab: AuthTab) => {
    setTab(newTab);
    resetForm();
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setSubmitting(true);
    setError(null);

    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await register(name.trim(), email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-[100dvh] w-full bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[24px] animate-spin">sync</span>
          </div>
          <p className="text-[13px] text-on-surface-variant font-medium">Restoring session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-background flex items-center justify-center overflow-auto">
      <div className="w-full max-w-[420px] px-6 py-12 flex flex-col items-center animate-fade-in">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-container to-[#4f46e5] flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-white text-[28px]">account_balance</span>
        </div>

        <h1 className="text-[28px] font-bold text-on-surface tracking-tight mb-1">
          CashFlow
        </h1>
        <p className="text-[14px] text-on-surface-variant mb-8">
          Enterprise debt minimization platform
        </p>

        {/* Tab Switcher */}
        <div className="w-full flex gap-1 bg-surface-variant/30 rounded-lg p-1 mb-6">
          <button
            onClick={() => handleTabSwitch("login")}
            className={`flex-1 h-9 rounded-md text-[13px] font-semibold transition-all duration-200 ${
              tab === "login"
                ? "bg-surface-container-high text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => handleTabSwitch("register")}
            className={`flex-1 h-9 rounded-md text-[13px] font-semibold transition-all duration-200 ${
              tab === "register"
                ? "bg-surface-container-high text-on-surface shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="w-full flex items-start gap-2.5 p-3 rounded-lg bg-glow-error border border-error/20 text-error text-[13px] mb-4 animate-fade-in">
            <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  className="input-field pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!email.trim() || !password || submitting}
              className="btn-primary w-full mt-2 h-11"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="w-full flex flex-col gap-4 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="register-name">Full Name</label>
              <input
                id="register-name"
                className="input-field"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="register-email">Email</label>
              <input
                id="register-email"
                className="input-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="register-password">Password</label>
              <div className="relative">
                <input
                  id="register-password"
                  className="input-field pr-10"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  tabIndex={-1}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Must include uppercase, lowercase, and a digit
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-label" htmlFor="register-confirm">Confirm Password</label>
              <input
                id="register-confirm"
                className="input-field"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={!name.trim() || !email.trim() || !password || !confirmPassword || submitting}
              className="btn-primary w-full mt-2 h-11"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        )}

        {/* Demo Credentials */}
        <div className="w-full mt-8 pt-6 border-t border-outline-variant/20">
          <p className="text-[11px] text-on-surface-variant text-center mb-3 uppercase font-medium tracking-wider">
            Demo Credentials
          </p>
          <div className="glass-panel-sm p-3 text-[12px] font-mono text-on-surface-variant space-y-1">
            <div className="flex justify-between">
              <span>alex@cashflow.dev</span>
              <span className="text-on-surface">Password123</span>
            </div>
            <div className="flex justify-between">
              <span>sarah@cashflow.dev</span>
              <span className="text-on-surface">Password123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
