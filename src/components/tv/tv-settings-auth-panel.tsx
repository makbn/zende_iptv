"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

type RowUser = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  isBootstrapAdmin: boolean;
};

export function TvSettingsAuthPanel() {
  const {
    authEnabled,
    user,
    userCount,
    bootstrap,
    logout,
    refresh,
  } = useAuth();

  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bootUser, setBootUser] = useState("");
  const [bootPass, setBootPass] = useState("");
  const [bootPass2, setBootPass2] = useState("");

  const [nuUser, setNuUser] = useState("");
  const [nuPass, setNuPass] = useState("");
  const [nuRole, setNuRole] = useState<"ADMIN" | "USER">("USER");

  const [users, setUsers] = useState<RowUser[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editRole, setEditRole] = useState<"ADMIN" | "USER">("USER");

  const loadUsers = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    const res = await zendeFetch("/api/admin/users");
    if (!res.ok) return;
    const data = (await res.json()) as { users?: RowUser[] };
    if (data.users) setUsers(data.users);
  }, [user?.role]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadUsers();
    });
  }, [loadUsers]);

  const onBootstrap = useCallback(async () => {
    setHint(null);
    if (bootPass !== bootPass2) {
      setHint("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await bootstrap(bootUser.trim(), bootPass);
      setHint("Administrator created — this browser is now signed in.");
      setBootUser("");
      setBootPass("");
      setBootPass2("");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "Could not create administrator.");
    } finally {
      setBusy(false);
    }
  }, [bootstrap, bootUser, bootPass, bootPass2]);

  const onToggleAuth = useCallback(
    async (enabled: boolean) => {
      setHint(null);
      setBusy(true);
      try {
        const res = await zendeFetch("/api/auth/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setHint(
            typeof data?.error === "string"
              ? data.error
              : "Could not update login settings.",
          );
          return;
        }
        await refresh();
        setHint(
          enabled
            ? "Login is now required."
            : "Open access restored (accounts kept).",
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onCreateUser = useCallback(async () => {
    setHint(null);
    setBusy(true);
    try {
      const res = await zendeFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nuUser.trim(),
          password: nuPass,
          role: nuRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHint(
          typeof data?.error === "string" ? data.error : "Could not create user.",
        );
        return;
      }
      setNuUser("");
      setNuPass("");
      await loadUsers();
      setHint("User created.");
    } finally {
      setBusy(false);
    }
  }, [nuUser, nuPass, nuRole, loadUsers]);

  const onDeleteUser = useCallback(
    async (id: string) => {
      if (!confirm("Remove this user?")) return;
      const res = await zendeFetch(`/api/admin/users/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setHint(
          typeof data?.error === "string" ? data.error : "Could not remove user.",
        );
        return;
      }
      await loadUsers();
      await refresh();
    },
    [loadUsers, refresh],
  );

  const startEdit = useCallback((u: RowUser) => {
    setEditId(u.id);
    setEditName(u.username);
    setEditPass("");
    setEditRole(u.role);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editId) return;
    const res = await zendeFetch(`/api/admin/users/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: editName.trim(),
        ...(editPass ? { password: editPass } : {}),
        role: editRole,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHint(typeof data?.error === "string" ? data.error : "Update failed.");
      return;
    }
    setEditId(null);
    await loadUsers();
    await refresh();
    setHint("User updated.");
  }, [editId, editName, editPass, editRole, loadUsers, refresh]);

  const isAdmin = user?.role === "ADMIN";

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
      )}
      aria-labelledby="settings-auth-heading"
    >
      <h2
        id="settings-auth-heading"
        className="text-[18px] font-semibold text-white"
      >
        Authentication
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-white/50">
        Optional login protects this deployment. Access and refresh tokens are stored in
        this browser until you sign out.
      </p>

      {!authEnabled && userCount > 0 && !user ? (
        <div className="mt-6 rounded-xl border border-white/[0.1] bg-amber-500/10 px-5 py-4">
          <p className="text-[15px] font-medium text-white/90">
            Login is optional right now, but accounts already exist.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-white/55">
            Sign in as an <span className="text-white/75">administrator</span> to turn on
            required login or manage users. In open-access mode only admins can sign in for
            management.
          </p>
          <Link
            href="/login?next=/settings"
            className="mt-4 inline-flex rounded-xl border border-white/[0.14] bg-white/[0.08] px-4 py-2.5 text-[14px] font-semibold text-white outline-none transition-colors hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white"
          >
            Sign in as admin
          </Link>
        </div>
      ) : null}

      {!authEnabled && userCount === 0 ? (
        <form
          className="mt-6 space-y-4 rounded-xl border border-white/[0.08] bg-black/20 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onBootstrap();
          }}
        >
          <p className="text-[15px] font-medium text-white/85">
            Create the administrator
          </p>
          <p className="text-[14px] text-white/45">
            This account always remains the bootstrap administrator (it cannot be
            deleted). Server recovery script can reset its password if you lock
            yourself out.
          </p>
          <label className="block">
            <span className="text-[13px] text-white/55">Username</span>
            <input
              name="bootstrap-username"
              autoComplete="username"
              value={bootUser}
              onChange={(e) => setBootUser(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-white/55">Password</span>
            <input
              name="bootstrap-password"
              type="password"
              autoComplete="new-password"
              value={bootPass}
              onChange={(e) => setBootPass(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-white/55">Confirm password</span>
            <input
              name="bootstrap-password-confirm"
              type="password"
              autoComplete="new-password"
              value={bootPass2}
              onChange={(e) => setBootPass2(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 text-[15px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="outline-none disabled:opacity-50"
          >
            <ZenedeGlass variant="ctaPill">
              <span className="flex px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                Enable login & create administrator
              </span>
            </ZenedeGlass>
          </button>
        </form>
      ) : null}

      {user ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-white/55">
            Signed in as{" "}
            <span className="font-medium text-white/85">{user.username}</span>
            {user.role === "ADMIN" ? " (admin)" : ""}
          </span>
          <button type="button" onClick={() => void logout()} className="outline-none">
            <ZenedeGlass variant="heroSecondary" className="inline-block">
              <span className="flex px-4 py-2 text-[14px] font-semibold text-white">
                Sign out
              </span>
            </ZenedeGlass>
          </button>
        </div>
      ) : null}

      {isAdmin && user && userCount > 0 ? (
        <div className="mt-8 border-t border-white/[0.08] pt-8">
          <p className="text-[15px] font-medium text-white/90">
            {authEnabled ? "Login requirement" : "Require login for visitors"}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-white/45">
            {authEnabled
              ? "Visitors must sign in. You can restore open access below; user accounts are kept."
              : "The app is open to everyone. Turn this on to require a signed-in session for all pages."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!authEnabled ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onToggleAuth(true)}
                className="outline-none disabled:opacity-40"
              >
                <ZenedeGlass variant="ctaPill">
                  <span className="flex px-5 py-2.5 text-[14px] font-semibold text-zinc-950">
                    Require login for everyone
                  </span>
                </ZenedeGlass>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onToggleAuth(false)}
                className="outline-none disabled:opacity-40"
              >
                <ZenedeGlass variant="heroSecondary" className="inline-block">
                  <span className="flex px-5 py-2.5 text-[14px] font-semibold text-white">
                    Allow access without login
                  </span>
                </ZenedeGlass>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {isAdmin && user && userCount > 0 ? (
        <div className="mt-10 border-t border-white/[0.08] pt-10">
          <h3 className="text-[16px] font-semibold text-white">Accounts</h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Username"
              value={nuUser}
              onChange={(e) => setNuUser(e.target.value)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/35 px-3 text-[14px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={nuPass}
              onChange={(e) => setNuPass(e.target.value)}
              className="h-11 rounded-xl border border-white/[0.12] bg-black/35 px-3 text-[14px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
            />
            <div className="flex gap-2">
              <select
                value={nuRole}
                onChange={(e) =>
                  setNuRole(e.target.value === "ADMIN" ? "ADMIN" : "USER")
                }
                className="h-11 flex-1 rounded-xl border border-white/[0.12] bg-black/35 px-3 text-[14px] text-white outline-none"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onCreateUser()}
                className="outline-none"
              >
                <ZenedeGlass variant="ctaPill">
                  <span className="flex px-4 py-2 text-[13px] font-semibold text-zinc-950">
                    Add user
                  </span>
                </ZenedeGlass>
              </button>
            </div>
          </div>

          <ul className="mt-6 space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3"
              >
                {editId === u.id ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="block flex-1 min-w-[140px]">
                      <span className="text-[11px] text-white/45">Username</span>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/40 px-2 text-[14px] text-white"
                      />
                    </label>
                    <label className="block flex-1 min-w-[140px]">
                      <span className="text-[11px] text-white/45">
                        New password (optional)
                      </span>
                      <input
                        type="password"
                        value={editPass}
                        onChange={(e) => setEditPass(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/40 px-2 text-[14px] text-white"
                      />
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value === "ADMIN" ? "ADMIN" : "USER")
                      }
                      className="h-10 rounded-lg border border-white/[0.12] bg-black/40 px-2 text-[13px] text-white"
                    >
                      <option value="USER">User</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        className="rounded-lg bg-white/15 px-3 py-2 text-[13px] text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="rounded-lg px-3 py-2 text-[13px] text-white/55"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{u.username}</p>
                      <p className="text-[12px] text-white/38">
                        {u.role}
                        {u.isBootstrapAdmin ? " · primary administrator" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        className="rounded-lg px-3 py-1.5 text-[13px] text-white/75 hover:bg-white/10"
                      >
                        Edit
                      </button>
                      {!u.isBootstrapAdmin ? (
                        <button
                          type="button"
                          onClick={() => void onDeleteUser(u.id)}
                          className="rounded-lg px-3 py-1.5 text-[13px] text-red-300/95 hover:bg-white/10"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hint ? (
        <p
          className={cn(
            "mt-5 text-[14px]",
            hint.includes("created") ||
              hint.includes("Login") ||
              hint.includes("restored") ||
              hint.includes("updated") ||
              hint.includes("Signed")
              ? "text-emerald-400/95"
              : "text-amber-300/95",
          )}
          role="status"
        >
          {hint}
        </p>
      ) : null}
    </section>
  );
}
