"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/actions";

type Props = {
  mode: "signin" | "signup";
  database: "telegram" | "local" | "unconfigured";
  initialError?: string;
};

function MailIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4z"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>;
}
function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
}
function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.7-4 3.2-6 7.5-6s6.8 2 7.5 6"/></svg>;
}
function EyeIcon({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>{!open && <path d="m4 4 16 16"/>}</svg>;
}

export function AuthForm({ mode, database, initialError }: Props) {
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  const [showPassword, setShowPassword] = useState(false);
  const isSignIn = mode === "signin";

  return (
    <div className="auth-card">
      <div className="card-heading">
        <p className="eyebrow">{isSignIn ? "Welcome back" : "Get started"}</p>
        <h1>{isSignIn ? "Sign in to Tellybase" : "Create your account"}</h1>
        <p>{isSignIn ? "Enter your details to access your private workspace." : "One account. A private workspace backed by Telegram."}</p>
      </div>

      <div className="auth-tabs" role="navigation" aria-label="Authentication">
        <Link className={isSignIn ? "active" : ""} href="/sign-in">Sign in</Link>
        <Link className={!isSignIn ? "active" : ""} href="/sign-up">Create account</Link>
      </div>

      <form action={formAction} className="auth-form">
        {!isSignIn && (
          <div className="field-group">
            <label htmlFor="name">Full name</label>
            <div className="input-shell">
              <span className="input-icon"><UserIcon /></span>
              <input id="name" name="name" type="text" placeholder="Alex Morgan" autoComplete="name" minLength={2} maxLength={60} required autoFocus />
            </div>
          </div>
        )}

        <div className="field-group">
          <label htmlFor="email">Email address</label>
          <div className="input-shell">
            <span className="input-icon"><MailIcon /></span>
            <input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} required autoFocus={isSignIn} />
          </div>
        </div>

        <div className="field-group">
          <div className="label-row">
            <label htmlFor="password">Password</label>
            {isSignIn && <span className="helper-copy">8+ characters</span>}
          </div>
          <div className="input-shell">
            <span className="input-icon"><LockIcon /></span>
            <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder={isSignIn ? "Enter your password" : "At least 8 characters"} autoComplete={isSignIn ? "current-password" : "new-password"} minLength={8} maxLength={128} required />
            <button className="reveal-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><EyeIcon open={showPassword} /></button>
          </div>
          {!isSignIn && <span className="field-hint">Use at least one letter and one number.</span>}
        </div>

        {!isSignIn && (
          <div className="field-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <div className="input-shell">
              <span className="input-icon"><LockIcon /></span>
              <input id="confirmPassword" name="confirmPassword" type={showPassword ? "text" : "password"} placeholder="Repeat your password" autoComplete="new-password" minLength={8} maxLength={128} required />
            </div>
          </div>
        )}

        {isSignIn && (
          <label className="remember-row">
            <input name="remember" type="checkbox" />
            <span className="checkmark" aria-hidden="true" />
            <span>Keep me signed in for 30 days</span>
          </label>
        )}

        {state.error && <div className="form-error" role="alert"><span aria-hidden="true">!</span>{state.error}</div>}

        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? <><span className="spinner" />{isSignIn ? "Signing in…" : "Creating account…"}</> : <>{isSignIn ? "Sign in" : "Create account"}<span aria-hidden="true">→</span></>}
        </button>
      </form>

      <p className="switch-copy">
        {isSignIn ? "New to Tellybase?" : "Already have an account?"}{" "}
        <Link href={isSignIn ? "/sign-up" : "/sign-in"}>{isSignIn ? "Create an account" : "Sign in"}</Link>
      </p>

      <div className={`database-status ${database}`}>
        <span className="status-dot" />
        {database === "telegram" ? "Account database connected to Telegram" : database === "local" ? "Local database · development mode" : "Telegram database needs configuration"}
      </div>
    </div>
  );
}
