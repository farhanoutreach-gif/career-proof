"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/config/site";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(mode: "signin" | "signup") {
    setMessage(null);
    const supabase = createClient();
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) return setMessage(error.message);
    if (mode === "signup" && !data.session) {
      return setMessage("Check your email to confirm your account, then sign in.");
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <input
        className="rounded border p-2"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="rounded border p-2"
        type="password"
        placeholder="Password (min 6 characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={() => submit("signin")}>
          Sign in
        </button>
        <button className="rounded border px-4 py-2" onClick={() => submit("signup")}>
          Sign up
        </button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </main>
  );
}
