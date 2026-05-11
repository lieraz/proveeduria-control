"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/src/lib/supabase/client";

const navigation = [
  { label: "Panel", href: "/dashboard" },
  { label: "Clientes", href: "/dashboard/clientes" },
  { label: "Proveedores", href: "/dashboard/proveedores" },
  { label: "Productos", href: "/dashboard/productos" },
  { label: "Solicitudes", href: "/dashboard/solicitudes" },
  { label: "Cotizaciones", href: "/dashboard/cotizaciones" },
  { label: "Órdenes", href: "/dashboard/ordenes" },
  { label: "Entregas", href: "/dashboard/entregas" },
  { label: "Facturación", href: "/dashboard/facturacion" },
];

type DashboardShellProps = {
  children?: ReactNode;
  description?: string;
  eyebrow?: string;
  title?: string;
};

export function DashboardShell({
  children,
  description = "Vista inicial para coordinar solicitudes, cotizaciones, compras, entregas y facturación del equipo interno.",
  eyebrow = "Panel principal",
  title = "Control Proveeduría",
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function handleLogout() {
    setIsSigningOut(true);

    const supabase = createClient();
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-100 text-sm font-medium text-stone-600">
        Verificando sesión...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-stone-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 border-b border-stone-200 px-5 py-5 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Control
              </p>
              <h1 className="mt-1 text-xl font-semibold">Proveeduría</h1>
            </div>
            <button
              className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 lg:hidden"
              disabled={isSigningOut}
              onClick={handleLogout}
              type="button"
            >
              Salir
            </button>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 py-4 lg:flex-col lg:overflow-x-visible">
            {navigation.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-800 text-white hover:bg-emerald-900"
                      : "text-stone-700 hover:bg-emerald-50 hover:text-emerald-900"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="hidden items-center justify-between border-b border-stone-200 bg-white px-8 py-5 lg:flex">
            <div>
              <p className="text-sm text-stone-500">Sesión activa</p>
              <p className="mt-1 text-sm font-medium text-stone-800">
                {user?.email}
              </p>
            </div>
            <button
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSigningOut}
              onClick={handleLogout}
              type="button"
            >
              {isSigningOut ? "Cerrando..." : "Cerrar sesión"}
            </button>
          </header>

          <div className="flex-1 px-5 py-6 sm:px-8">
            <div className="mb-8">
              <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                {eyebrow}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                {title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                {description}
              </p>
            </div>

            {children ?? (
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["Solicitudes abiertas", "Pendientes de revisar"],
                  ["Cotizaciones", "En preparación"],
                  ["Entregas", "Seguimiento operativo"],
                ].map(([title, description]) => (
                  <article
                    className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
                    key={title}
                  >
                    <h3 className="text-base font-semibold">{title}</h3>
                    <p className="mt-2 text-sm text-stone-600">{description}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
