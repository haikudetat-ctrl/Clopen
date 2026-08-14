"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-6">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Sign in to Clopen
      </h1>
      {status === "sent" ? (
        <p className="text-sm text-zinc-500">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@restaurant.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Send magic link
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">
              Something went wrong. Try again.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
