"use client";

import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthHeader() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? (
    <>
      <Link className="button button-quiet" href="/dashboard">Open dashboard</Link>
      <UserButton />
    </>
  ) : (
    <>
      <SignInButton>
        <button className="button button-quiet">Log in</button>
      </SignInButton>
      <SignUpButton>
        <button className="button button-primary">Start for free <span>→</span></button>
      </SignUpButton>
    </>
  );
}
