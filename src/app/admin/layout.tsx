"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { clientAuth } from "@/lib/firebase/client";
import { Logo } from "@/components/logo";
import { FullPageSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/classes", label: "Classes" },
  { href: "/admin/debates", label: "Debates" },
];

function AdminChrome({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (!loading && !user && !isLogin) {
      router.replace("/admin/login");
    }
  }, [loading, user, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (loading || !user) return <FullPageSpinner label="Loading Digital Jury…" />;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/50 bg-surface-container-lowest/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-6 px-4 md:px-8">
          <Link href="/admin" aria-label="Digital Jury dashboard">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-on-surface-variant sm:block">
              {user.email}
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut(clientAuth());
                router.replace("/admin/login");
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminChrome>{children}</AdminChrome>
    </AuthProvider>
  );
}
