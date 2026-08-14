import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

const links = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/training", label: "Training" },
  { href: "/shift-notes", label: "Shift Notes" },
];

const ownerLinks = [
  { href: "/inventory", label: "Inventory" },
  { href: "/reports", label: "Reports" },
];

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const visibleLinks =
    profile?.role === "owner_admin" ? [...links, ...ownerLinks] : links;

  return (
    <nav className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-5">
          <span className="text-sm font-semibold text-zinc-900">Clopen</span>
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-500 hover:text-zinc-900"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <SignOutButton />
      </div>
    </nav>
  );
}
