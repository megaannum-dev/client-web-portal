"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import type { PortalUser } from "@/types/portal";

type DemoRole = Extract<PortalUser["role"], "RM" | "MOBO" | "ADMIN">;

const ROLES: {
  role: DemoRole;
  num: number;
  name: string;
  desc: string;
  route: string;
}[] = [
  {
    role: "RM",
    num: 1,
    name: "Relationship Manager",
    desc: "Onboarding & renewal, subscriptions, reports",
    route: "/rm/dashboard",
  },
  {
    role: "MOBO",
    num: 2,
    name: "Middle / Back Office",
    desc: "Reconciliation, exceptions, monthly reports",
    route: "/mobo/dashboard",
  },
  {
    role: "ADMIN",
    num: 3,
    name: "Admin",
    desc: "Full access — inherits the MOBO workspace",
    route: "/rm/dashboard",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { signInDemo } = useAuth();

  const [name, setName] = useState("Joe Doe");
  const [selectedRole, setSelectedRole] = useState<DemoRole>("RM");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = ROLES.find((r) => r.role === selectedRole)!;
    setSubmitting(true);
    signInDemo(name.trim() || "Joe Doe", selectedRole);
    router.push(target.route);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-dim px-4 py-12">
      <div className="flex w-full max-w-[440px] flex-col items-center">
        {/* Brand lockup */}
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/favicon.png"
            alt="Megaannum"
            width={44}
            height={44}
            className="block size-11"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[22px] font-bold text-on-surface">CRM</span>
            <span className="text-[13px] text-secondary">Internal Admins Portal</span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full rounded-2xl border border-outline-variant bg-surface-lowest p-8 shadow-card">
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.01em] text-on-surface">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Demo access — Enter your name and select your role.
          </p>

          <form className="mt-6 flex flex-col gap-5" autoComplete="off" onSubmit={onSubmit}>
            {/* Name */}
            <div className="flex flex-col gap-[7px]">
              <label
                htmlFor="name"
                className="text-xs font-bold uppercase tracking-[0.05em] text-secondary"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                placeholder="e.g. Joe Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-surface-lowest px-3.5 py-[11px] text-[15px] text-on-surface outline-none transition placeholder:text-[#a7a3a0] focus:border-primary focus:shadow-[0_0_0_3px_rgba(242,116,5,0.30)]"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-[7px]">
              <span className="text-xs font-bold uppercase tracking-[0.05em] text-secondary">
                Role
              </span>
              <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Select role">
                {ROLES.map((r) => {
                  const active = r.role === selectedRole;
                  return (
                    <button
                      key={r.role}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedRole(r.role)}
                      className={`flex w-full items-center gap-3.5 rounded-[10px] border px-3.5 py-3 text-left transition ${
                        active
                          ? "border-primary bg-primary-fixed shadow-[0_0_0_1px_#f27405]"
                          : "border-outline-variant bg-surface-lowest hover:bg-surface-low"
                      }`}
                    >
                      <span
                        className={`grid size-[34px] flex-none place-items-center rounded-lg text-base font-bold transition ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-container text-secondary"
                        }`}
                      >
                        {r.num}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-on-surface">{r.name}</span>
                        <span className="text-[12.5px] text-secondary">{r.desc}</span>
                      </span>
                      <span
                        className={`ml-auto flex-none rounded-full border px-[9px] py-[3px] text-[11px] font-bold tracking-[0.05em] ${
                          active
                            ? "border-primary-fixed-dim text-primary-on-container"
                            : "border-outline-variant text-secondary"
                        }`}
                      >
                        {r.role}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full rounded-lg bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Login"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
