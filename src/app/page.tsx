import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/config/site";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      {data.user ? (
        <p className="text-sm">Signed in as {data.user.email}</p>
      ) : (
        <Link className="text-sm underline" href="/login">
          Sign in / Sign up
        </Link>
      )}
    </main>
  );
}
