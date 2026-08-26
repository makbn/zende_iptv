"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";

import { Input } from "@appica/ui-react/input";

import { Button } from "@appica/ui-react/button";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

type RowUser = {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
  isDisabled: boolean;
  isBootstrapAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  lastLoginLocation: string | null;
  lastLoginDevice: string | null;
  _count: { favorites: number; viewingHistory: number };
};

type UserActivity = RowUser & {
  lastLoginIp: string | null;
  viewingHistory: Array<{
    name: string;
    groupTitle: string | null;
    lastOpenedAt: string;
    openCount: number;
  }>;
};

function formatActivityDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

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
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [activityId, setActivityId] = useState<string | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);

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

  const changeOwnPassword = useCallback(async () => {
    if (newPass !== newPass2) {
      setHint("New passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await zendeFetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setHint(typeof data?.error === "string" ? data.error : "Password update failed.");
      return;
    }
    setCurrentPass("");
    setNewPass("");
    setNewPass2("");
    setHint("Password changed. Sign in again with your new password.");
    await logout();
  }, [currentPass, newPass, newPass2, logout]);

  const toggleDisabled = useCallback(async (target: RowUser) => {
    const res = await zendeFetch(`/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDisabled: !target.isDisabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHint(typeof data?.error === "string" ? data.error : "Account update failed.");
      return;
    }
    await loadUsers();
    setHint(target.isDisabled ? "Customer enabled." : "Customer disabled.");
  }, [loadUsers]);

  const loadActivity = useCallback(async (id: string) => {
    if (activityId === id) {
      setActivityId(null);
      setActivity(null);
      return;
    }
    setActivityBusy(true);
    setActivityId(id);
    const res = await zendeFetch(`/api/admin/users/${id}/activity`);
    const data = await res.json().catch(() => ({}));
    setActivityBusy(false);
    if (!res.ok || !data.user) {
      setHint(typeof data?.error === "string" ? data.error : "Could not load activity.");
      setActivityId(null);
      return;
    }
    setActivity(data.user as UserActivity);
  }, [activityId]);

  const clearUserData = useCallback(async (id: string, kind: "favorites" | "history") => {
    const label = kind === "favorites" ? "favorites" : "viewing history";
    if (!confirm(`Clear this customer's ${label}?`)) return;
    const res = await zendeFetch(`/api/admin/users/${id}/personal-data`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHint(typeof data?.error === "string" ? data.error : "Cleanup failed.");
      return;
    }
    setHint(`${kind === "favorites" ? "Favorites" : "Viewing history"} cleared.`);
    await loadUsers();
    if (activityId === id) await loadActivity(id);
  }, [activityId, loadActivity, loadUsers]);

  return (
    <Card
      frame="solid"
      inset={false}
      render={<section aria-labelledby="settings-auth-heading" />}
      contentProps={{ className: "p-6" }}
    >
      <h2
        id="settings-auth-heading"
        className="text-[18px] font-semibold text-foreground-intense"
      >
        Authentication
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground-intense">
        Optional login protects this deployment. Access and refresh tokens are stored in
        this browser until you sign out.
      </p>

      {!authEnabled && userCount > 0 && !user ? (
        <div className="mt-6 rounded-xl border border-border bg-warning-subtle px-5 py-4">
          <p className="text-[15px] font-medium text-foreground-intense">
            Login is optional right now, but accounts already exist.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground-intense">
            Sign in as an <span className="text-foreground-intense">administrator</span> to turn on
            required login or manage users. In open-access mode only admins can sign in for
            management.
          </p>
          <Link
            href="/login?next=/settings"
            className="mt-4 inline-flex rounded-xl border border-border bg-background-muted px-4 py-2.5 text-[14px] font-semibold text-foreground-intense outline-none transition-colors hover:bg-background-muted focus-visible:ring-2 focus-visible:ring-border"
          >
            Sign in as admin
          </Link>
        </div>
      ) : null}

      {!authEnabled && userCount === 0 ? (
        <form
          className="mt-6 space-y-4 rounded-xl border border-border bg-background p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onBootstrap();
          }}
        >
          <p className="text-[15px] font-medium text-foreground-intense">
            Create the administrator
          </p>
          <p className="text-[14px] text-foreground-intense">
            This account always remains the bootstrap administrator (it cannot be
            deleted). Server recovery script can reset its password if you lock
            yourself out.
          </p>
          <label className="block">
            <span className="text-[13px] text-foreground-intense">Username</span>
            <Input
              name="bootstrap-username"
              autoComplete="username"
              value={bootUser}
              onValueChange={(value) => setBootUser(value)}
              inputSize="lg"
              className="mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-foreground-intense">Password</span>
            <Input
              name="bootstrap-password"
              type="password"
              autoComplete="new-password"
              value={bootPass}
              onValueChange={(value) => setBootPass(value)}
              inputSize="lg"
              className="mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-foreground-intense">Confirm password</span>
            <Input
              name="bootstrap-password-confirm"
              type="password"
              autoComplete="new-password"
              value={bootPass2}
              onValueChange={(value) => setBootPass2(value)}
              inputSize="lg"
              className="mt-1 w-full"
            />
          </label>
          <Button variant="primary"
            size="lg"
            type="submit"
            disabled={busy}
          >
            Enable login & create administrator
          </Button>
        </form>
      ) : null}

      {user ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-foreground-intense">
            Signed in as{" "}
            <span className="font-medium text-foreground-intense">{user.username}</span>
            {user.role === "ADMIN" ? " (admin)" : ""}
          </span>
          <Button variant="secondary" type="button" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      ) : null}

      {user ? (
        <form
          className="mt-6 grid gap-3 rounded-xl border border-border bg-background p-5 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void changeOwnPassword();
          }}
        >
          <div className="sm:col-span-3">
            <p className="text-[15px] font-medium text-foreground-intense">Change my password</p>
            <p className="mt-1 text-[13px] text-foreground-intense">You will be signed out after the password changes.</p>
          </div>
          <Input inputSize="lg" type="password" autoComplete="current-password" placeholder="Current password" value={currentPass} onValueChange={(value) => setCurrentPass(value)} />
          <Input inputSize="lg" type="password" autoComplete="new-password" placeholder="New password" value={newPass} onValueChange={(value) => setNewPass(value)} />
          <div className="flex gap-2">
            <Input inputSize="lg" type="password" autoComplete="new-password" placeholder="Confirm new password" value={newPass2} onValueChange={(value) => setNewPass2(value)} className="min-w-0 flex-1" />
            <Button variant="primary" size="lg" type="submit" disabled={busy}>Change</Button>
          </div>
        </form>
      ) : null}

      {isAdmin && user && userCount > 0 ? (
        <div className="mt-8 border-t border-border pt-8">
          <p className="text-[15px] font-medium text-foreground-intense">
            {authEnabled ? "Login requirement" : "Require login for visitors"}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-foreground-intense">
            {authEnabled
              ? "Visitors must sign in. You can restore open access below; user accounts are kept."
              : "The app is open to everyone. Turn this on to require a signed-in session for all pages."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!authEnabled ? (
              <Button variant="primary"
                size="lg"
                type="button"
                disabled={busy}
                onClick={() => void onToggleAuth(true)}
              >
                Require login for everyone
              </Button>
            ) : (
              <Button variant="destructive"
                size="lg"
                type="button"
                disabled={busy}
                onClick={() => void onToggleAuth(false)}
              >
                Allow access without login
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {isAdmin && user && userCount > 0 ? (
        <div className="mt-10 border-t border-border pt-10">
          <h3 className="text-[16px] font-semibold text-foreground-intense">Accounts</h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Username"
              value={nuUser}
              onValueChange={(value) => setNuUser(value)}
              inputSize="lg"
            />
            <Input
              type="password"
              placeholder="Password"
              value={nuPass}
              onValueChange={(value) => setNuPass(value)}
              inputSize="lg"
            />
            <div className="flex gap-2">
              <Select
                value={nuRole}
                onValueChange={(value) => setNuRole(value === "ADMIN" ? "ADMIN" : "USER")
                }
                size="lg"
              >
<SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="USER">Customer</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent></Select>
              <Button variant="primary"
                size="lg"
                type="button"
                disabled={busy}
                onClick={() => void onCreateUser()}
              >
                Add user
              </Button>
            </div>
          </div>

          <ul className="mt-6 space-y-2">
            {users.map((u) => (
              <Card
                key={u.id}
                frame="solid"
                inset={false}
                render={<li />}
                contentProps={{ className: "p-4" }}
              >
                {editId === u.id ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="block flex-1 min-w-[140px]">
                      <span className="text-[11px] text-foreground-intense">Username</span>
                      <Input
                        value={editName}
                        onValueChange={(value) => setEditName(value)}
                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-[14px] text-foreground-intense"
                      />
                    </label>
                    <label className="block flex-1 min-w-[140px]">
                      <span className="text-[11px] text-foreground-intense">
                        New password (optional)
                      </span>
                      <Input
                        type="password"
                        value={editPass}
                        onValueChange={(value) => setEditPass(value)}
                        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-[14px] text-foreground-intense"
                      />
                    </label>
                    <Select
                      value={editRole}
                      onValueChange={(value) => setEditRole(value === "ADMIN" ? "ADMIN" : "USER")
                      }
                    >
<SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="USER">Customer</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent></Select>
                    <div className="flex gap-2">
                      <Button variant="primary"
                        type="button"
                        onClick={() => void saveEdit()}
                      >
                        Save
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setEditId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground-intense">{u.username}</p>
                      <p className="text-[12px] text-foreground-intense">
                        {u.role === "USER" ? "CUSTOMER" : "ADMIN"}
                        {u.isDisabled ? " · disabled" : ""}
                        {u.isBootstrapAdmin ? " · primary administrator" : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-foreground-intense">
                        Last activity: {formatActivityDate(u.lastActivityAt)} · {u._count.favorites} favorites · {u._count.viewingHistory} watched
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" type="button" onClick={() => void loadActivity(u.id)}>
                        {activityId === u.id ? "Hide activity" : "Activity"}
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => startEdit(u)}
                        size="sm"
                      >
                        Edit
                      </Button>
                      {!u.isBootstrapAdmin && u.id !== user.id ? (
                        <Button variant={u.isDisabled ? "primary" : "destructive"} size="sm" type="button" onClick={() => void toggleDisabled(u)}>
                          {u.isDisabled ? "Enable" : "Disable"}
                        </Button>
                      ) : null}
                      {!u.isBootstrapAdmin ? (
                        <Button variant="destructive"
                          size="sm"
                          type="button"
                          onClick={() => void onDeleteUser(u.id)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
                {activityId === u.id ? (
                  <div className="mt-4 border-t border-border pt-4">
                    {activityBusy || activity?.id !== u.id ? (
                      <p className="flex items-center gap-2 text-[13px] text-foreground-intense"><ZendeSpinner size="tiny" label="Loading account activity" /> Loading account activity…</p>
                    ) : (
                      <>
                        <div className="grid gap-2 text-[12px] text-foreground-intense sm:grid-cols-2">
                          <p>Last login: <span className="text-foreground-intense">{formatActivityDate(activity.lastLoginAt)}</span></p>
                          <p>Last activity: <span className="text-foreground-intense">{formatActivityDate(activity.lastActivityAt)}</span></p>
                          <p>Location: <span className="text-foreground-intense">{activity.lastLoginLocation || activity.lastLoginIp || "Unavailable"}</span></p>
                          <p className="truncate" title={activity.lastLoginDevice ?? undefined}>Device: <span className="text-foreground-intense">{activity.lastLoginDevice || "Unavailable"}</span></p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="destructive" size="sm" type="button" onClick={() => void clearUserData(u.id, "favorites")}>Clear favorites</Button>
                          <Button variant="destructive" size="sm" type="button" onClick={() => void clearUserData(u.id, "history")}>Clear recently watched</Button>
                        </div>
                        <h4 className="mt-5 text-[13px] font-semibold text-foreground-intense">Last 50 watched channels and media</h4>
                        {activity.viewingHistory.length ? (
                          <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
                            {activity.viewingHistory.map((entry, index) => (
                              <li key={`${entry.name}-${entry.lastOpenedAt}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-background-muted px-3 py-2 text-[12px]">
                                <span className="min-w-0 truncate text-foreground-intense">{entry.name}{entry.groupTitle ? ` · ${entry.groupTitle}` : ""}</span>
                                <span className="shrink-0 text-foreground-intense">{formatActivityDate(entry.lastOpenedAt)} · {entry.openCount}×</span>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="mt-2 text-[12px] text-foreground-intense">No viewing history.</p>}
                      </>
                    )}
                  </div>
                ) : null}
              </Card>
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
              ? "text-success-strong"
              : "text-warning-strong",
          )}
          role="status"
        >
          {hint}
        </p>
      ) : null}
    </Card>
  );
}
