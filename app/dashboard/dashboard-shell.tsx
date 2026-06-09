"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Boxes,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  ShoppingBag,
  Truck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

const navigationGroups = [
  {
    label: "Operación",
    items: [
      { label: "Panel", href: "/dashboard", icon: LayoutDashboard },
      { label: "Solicitudes", href: "/dashboard/solicitudes", icon: ClipboardList },
    ],
  },
  {
    label: "Catálogos",
    items: [
      { label: "Clientes", href: "/dashboard/clientes", icon: UsersRound },
      { label: "Proveedores", href: "/dashboard/proveedores", icon: Building2 },
      { label: "Contactos", href: "/dashboard/contactos", icon: UserRound },
      { label: "Productos", href: "/dashboard/productos", icon: Package },
      {
        label: "Métodos de pago",
        href: "/dashboard/metodos-pago",
        icon: CreditCard,
      },
    ],
  },
  {
    label: "Compras",
    items: [
      { label: "Cotizaciones", href: "/dashboard/cotizaciones", icon: FileText },
      { label: "Órdenes", href: "/dashboard/ordenes", icon: Boxes },
      {
        label: "Compras / Recolecciones",
        href: "/dashboard/compras",
        icon: ShoppingBag,
      },
      { label: "Entregas", href: "/dashboard/entregas", icon: Truck },
      { label: "Facturación", href: "/dashboard/facturacion", icon: ReceiptText },
    ],
  },
];

type DashboardShellProps = {
  actions?: ReactNode;
  children?: ReactNode;
  description?: string;
  eyebrow?: string;
  title?: string;
};

export function DashboardShell({
  actions,
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

  const isActiveRoute = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <main className="min-h-screen bg-[#f4f3ef] text-stone-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-stone-200/80 bg-white/95 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4 border-b border-stone-200/80 px-5 py-5 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Control
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Proveeduría
              </h1>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 px-3 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 lg:hidden"
              disabled={isSigningOut}
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Salir
            </button>
          </div>

          <nav className="flex gap-3 overflow-x-auto px-4 py-4 lg:flex-col lg:gap-6 lg:overflow-x-visible">
            {navigationGroups.map((group) => (
              <div className="flex shrink-0 gap-2 lg:block" key={group.label}>
                <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-wide text-stone-400 lg:mb-2 lg:block">
                  {group.label}
                </p>
                <div className="flex gap-2 lg:flex-col">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActiveRoute(item.href);

                    return (
                      <Link
                        className={`inline-flex h-10 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition ${
                          isActive
                            ? "bg-stone-950 text-white shadow-sm"
                            : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                        }`}
                        href={item.href}
                        key={item.href}
                      >
                        <Icon
                          aria-hidden="true"
                          className={`h-4 w-4 ${
                            isActive ? "text-emerald-300" : "text-stone-400"
                          }`}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
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
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-200 px-4 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSigningOut}
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {isSigningOut ? "Cerrando..." : "Cerrar sesión"}
            </button>
          </header>

          <div className="flex-1 px-5 py-6 sm:px-8 lg:py-8">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {eyebrow}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  {title}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                  {description}
                </p>
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {actions}
                </div>
              ) : null}
            </div>

            {children ?? (
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["Solicitudes abiertas", "Pendientes de revisar"],
                  ["Cotizaciones", "En preparación"],
                  ["Entregas", "Seguimiento operativo"],
                ].map(([title, description]) => (
                  <article
                    className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70"
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
