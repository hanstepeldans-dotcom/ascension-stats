"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, EyeOff, Trash2 } from "lucide-react";

const isDev = process.env.NODE_ENV !== "production";

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

async function fetchMembers(): Promise<Member[]> {
  const res = await fetch("/api/members");
  if (!res.ok) throw new Error("Failed to load members");
  return res.json();
}

async function createMember(body: {
  email: string;
  password: string;
  role: "ADMIN" | "MANAGER";
  name?: string | null;
}): Promise<{ ok: true; user: Member }> {
  const res = await fetch("/api/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error === "Email already exists"
        ? "Email already exists"
        : data?.error === "You don't have permission"
          ? "You don't have permission"
          : res.status === 400
            ? "Invalid input"
            : (data?.error as string) ?? "Failed to create member";
    throw new Error(msg);
  }
  if (!data.ok || !data.user) throw new Error("Invalid response");
  return data;
}

async function deleteMember(userId: string): Promise<{ ok: true; deletedId: string }> {
  const res = await fetch(`/api/members?id=${encodeURIComponent(userId)}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data?.error as string) ?? "Failed to delete member";
    throw new Error(msg);
  }
  if (!data.ok || !data.deletedId) throw new Error("Invalid response");
  return data;
}

export default function MembersPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const sessionRole = session?.user?.role;
  const isAdmin =
    sessionRole === "ADMIN" || (isDev && sessionRole === undefined);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
  });

  const createMutation = useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setDialogOpen(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("MANAGER");
      setFormError(null);
      setSuccessMessage("Member added successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      setDeleteTarget(null);
      setDeleteError(null);
      setSuccessMessage("Member removed.");
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setFormError("Email is required");
      return;
    }
    if (!password || password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    createMutation.mutate({
      email: trimmedEmail,
      password,
      role,
      name: name.trim() || null,
    });
  }

  function handleOpenChange(open: boolean) {
    if (!open) setFormError(null);
    setDialogOpen(open);
  }

  return (
    <div className="space-y-6">
      {isDev && (
        <p className="text-xs text-zinc-500" data-marker="members-page-version">
          Members page version: v2-add-member
        </p>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Members
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your team members and access. Only admins can add new users.
          </p>
          {isDev && session?.user && (
            <p className="mt-2 text-xs text-amber-400/90">
              session.user.email: {session.user.email ?? "—"} | session.user.role: {sessionRole ?? "undefined"}
            </p>
          )}
          {(sessionRole === undefined || sessionRole !== "ADMIN") && session?.user && (
            <>
              <p className="mt-2 text-sm text-amber-400/90">
                Your session role is {sessionRole ?? "undefined"}. Log out and log back in.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 border-white/20 text-zinc-400"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Log out to refresh session
              </Button>
            </>
          )}
        </div>
        {isAdmin && (
          <Button
            onClick={() => setDialogOpen(true)}
            className="shrink-0 bg-gradient-to-r from-pink to-pink-muted px-6 text-white hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      {successMessage && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-400">
          {successMessage}
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          onClose={() => setDialogOpen(false)}
          showClose={true}
          className="border-white/10 bg-zinc-900"
        >
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="member-email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="member-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-white/20 bg-white/5 text-white placeholder:text-zinc-500"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-name" className="text-zinc-300">
                Name
              </Label>
              <Input
                id="member-name"
                type="text"
                placeholder="Full name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-white/20 bg-white/5 text-white placeholder:text-zinc-500"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-password" className="text-zinc-300">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="member-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-white/20 bg-white/5 pr-10 text-white placeholder:text-zinc-500"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role" className="text-zinc-300">
                Role
              </Label>
              <select
                id="member-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "ADMIN" | "MANAGER")}
                className="flex h-10 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pink/50"
              >
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-white/20 text-zinc-300 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90"
              >
                {createMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent
          onClose={() => setDeleteTarget(null)}
          showClose={true}
          className="border-white/10 bg-zinc-900"
        >
          <DialogHeader>
            <DialogTitle className="text-white">Delete member?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            This will permanently revoke access for {deleteTarget?.email ?? ""}.
          </p>
          {deleteError && (
            <p className="text-sm text-red-400">{deleteError}</p>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-white/20 text-zinc-300 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white">Members</CardTitle>
          <CardDescription>
            All users who can access the app. Admins can add new members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-zinc-400">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-zinc-400">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-zinc-400">Email</TableHead>
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Role</TableHead>
                  <TableHead className="text-zinc-400">Added</TableHead>
                  {sessionRole === "ADMIN" && (
                    <TableHead className="w-12 text-right text-zinc-400">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="text-white">{m.email}</TableCell>
                    <TableCell className="text-zinc-400">{m.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={m.role === "ADMIN" ? "admin" : "manager"}
                      >
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </TableCell>
                    {sessionRole === "ADMIN" && (
                      <TableCell className="text-right">
                        {m.id !== session?.user?.id ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                            onClick={() => setDeleteTarget(m)}
                            disabled={deleteMutation.isPending}
                            aria-label={`Delete ${m.email}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-zinc-500">—</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
