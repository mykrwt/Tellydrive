"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/app/actions";

function Button() {
  const { pending } = useFormStatus();
  return <button className="signout-button" type="submit" disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>;
}

export function SignOutButton() {
  return <form action={signOut}><Button /></form>;
}
