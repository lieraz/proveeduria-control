import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Control Proveeduría
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-stone-950">
            Iniciar sesión
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Accede al panel interno para administrar clientes, proveedores,
            requerimientos y facturación.
          </p>
        </div>

        <LoginForm />
      </section>
    </main>
  );
}
