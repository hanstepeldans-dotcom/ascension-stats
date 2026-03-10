"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConnectionStatus = {
  provider: string;
  status: string;
  connectedAt: string | null;
  lastError: string | null;
  tokenUrlHost: string | null;
};

type ConnectionsResponse = {
  connections: ConnectionStatus[];
  fanvueConfigured: boolean;
};

type ValidateResponse = {
  ok: boolean;
  missing: string[];
  defaultsApplied: { authorizationUrl: string; tokenUrl: string; apiBaseUrl: string };
};

type PreflightResponse = {
  ok: boolean;
  checks: {
    port3000: boolean;
    appBaseUrl: string;
    redirectUri: string;
    authorizationUrl: string;
    tokenUrl: string;
    scope: string;
    hasClientId: boolean;
    hasClientSecret: boolean;
    usesAuthFanvueHost: boolean;
    hasPkce: boolean;
  };
  basicAuthNote?: string;
  problems: string[];
  redirectUriHint: string;
};

async function fetchPreflight(): Promise<PreflightResponse> {
  const res = await fetch("/api/fanvue/oauth/preflight");
  if (!res.ok) throw new Error("Preflight check failed");
  return res.json();
}

type DiagnosticsResponse = {
  ok: boolean;
  connectionStatus: string | null;
  lastError: string | null;
  lastDebugJson: {
    status?: number;
    statusText?: string;
    tokenUrlHost?: string;
    responseJson?: { error?: string; error_description?: string } | null;
    responseTextPreview?: string | null;
    sentClientSecret?: boolean;
    redirectUri?: string;
    attemptedAuthMethod?: "none" | "basic";
    retryAttempted?: boolean;
    finalAuthMethodUsed?: "none" | "basic";
  } | null;
};

async function fetchDiagnostics(): Promise<DiagnosticsResponse> {
  const res = await fetch("/api/fanvue/oauth/diagnostics");
  if (!res.ok) {
    if (res.status === 404) throw new Error("Diagnostics only available in development.");
    throw new Error("Failed to load diagnostics");
  }
  return res.json();
}

type ExploreResponse = {
  endpoints: Array<{
    endpoint: string;
    status: number;
    preview?: unknown;
    responseTextPreview?: string;
    error?: string;
    insufficientScopes?: boolean;
  }>;
};

async function fetchScopes(): Promise<{ scope: string }> {
  const res = await fetch("/api/fanvue/scopes");
  if (!res.ok) throw new Error("Failed to load scopes");
  return res.json();
}

async function fetchExplore(): Promise<ExploreResponse> {
  const res = await fetch("/api/fanvue/explore");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data?.error as string) ?? "Failed to explore API");
  }
  return res.json();
}

type SyncLastErrorResponse = {
  lastError: string | null;
  lastDebugJson: {
    status?: number;
    endpoint?: string;
    method?: string;
    queryParams?: Record<string, string>;
    responsePreview?: string;
  } | null;
};

async function fetchSyncLastError(): Promise<SyncLastErrorResponse> {
  const res = await fetch("/api/fanvue/sync/last-error");
  if (!res.ok) throw new Error("Failed to load sync error details");
  return res.json();
}

async function fetchConnections(): Promise<ConnectionsResponse> {
  const res = await fetch("/api/settings/connections");
  if (!res.ok) throw new Error("Failed to load connections");
  return res.json();
}

async function fetchValidate(): Promise<ValidateResponse> {
  const res = await fetch("/api/fanvue/config/validate");
  if (!res.ok) throw new Error("Failed to validate");
  return res.json();
}

async function disconnectFanvue(): Promise<void> {
  const res = await fetch("/api/fanvue/oauth/disconnect", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data?.error as string) ?? "Failed to disconnect");
  }
}

async function saveFanvueEnv(body: { clientId: string; clientSecret: string }): Promise<{ ok: boolean }> {
  const res = await fetch("/api/dev/env/fanvue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data?.error as string) ?? "Failed to save");
  return data;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [setupClientId, setSetupClientId] = useState("");
  const [setupClientSecret, setSetupClientSecret] = useState("");
  const [preflightResult, setPreflightResult] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<DiagnosticsResponse | null>(null);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [syncDetailsData, setSyncDetailsData] = useState<SyncLastErrorResponse | null>(null);
  const [syncDetailsLoading, setSyncDetailsLoading] = useState(false);
  const [syncDetailsError, setSyncDetailsError] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreData, setExploreData] = useState<ExploreResponse | null>(null);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [inflowwUploadOpen, setInflowwUploadOpen] = useState(false);
  const [inflowwFile, setInflowwFile] = useState<File | null>(null);
  const [inflowwDragging, setInflowwDragging] = useState(false);
  const [inflowwUploading, setInflowwUploading] = useState(false);
  const [inflowwUploadError, setInflowwUploadError] = useState<string | null>(null);
  const [inflowwConnected, setInflowwConnected] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("infloww-file-name");
  });
  const [inflowwFileName, setInflowwFileName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("infloww-file-name") ?? "";
  });

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "connections"],
    queryFn: fetchConnections,
  });

  const { data: validate, refetch: refetchValidate } = useQuery({
    queryKey: ["fanvue", "validate"],
    queryFn: fetchValidate,
  });

  const { data: scopesData } = useQuery({
    queryKey: ["fanvue", "scopes"],
    queryFn: fetchScopes,
    enabled: !!(data?.fanvueConfigured),
  });

  const saveEnvMutation = useMutation({
    mutationFn: saveFanvueEnv,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fanvue", "validate"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "connections"] });
      setBannerSuccess("Saved. Restart the dev server to apply env changes.");
      setBannerError(null);
      setSetupClientId("");
      setSetupClientSecret("");
      setTimeout(() => setBannerSuccess(null), 8000);
    },
    onError: (err: Error) => {
      setBannerError(err.message);
      setBannerSuccess(null);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectFanvue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "connections"] });
      setBannerSuccess("Fanvue disconnected.");
      setBannerError(null);
      setTimeout(() => setBannerSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setBannerError(err.message);
      setBannerSuccess(null);
    },
  });

  const connections = data?.connections ?? [];
  const fanvueConfigured = data?.fanvueConfigured ?? false;
  const fanvue = connections.find((c) => c.provider === "FANVUE");
  const fanvueConnected = fanvue?.status === "CONNECTED";
  const fanvueLastError = fanvue?.status === "ERROR" ? fanvue.lastError : null;

  useEffect(() => {
    const fanvueConnected = searchParams.get("fanvue_connected");
    const fanvueError = searchParams.get("fanvue_error");
    const error = searchParams.get("error");
    const reason = searchParams.get("reason");
    if (fanvueConnected === "1") {
      setBannerSuccess("Fanvue account connected successfully.");
      setBannerError(null);
      setTimeout(() => setBannerSuccess(null), 5000);
    } else if (fanvueError === "1") {
      const detail = error
        ? decodeURIComponent(error)
        : reason
          ? `Reason: ${reason.replace(/_/g, " ")}`
          : null;
      setBannerError(
        detail ? `Fanvue connection failed. Please try again. (${detail})` : "Fanvue connection failed. Please try again."
      );
      setBannerSuccess(null);
    } else if (error) {
      setBannerError(decodeURIComponent(error));
      setBannerSuccess(null);
    }
  }, [searchParams]);

  const clearBanner = useCallback(() => {
    setBannerError(null);
    setBannerSuccess(null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
        <p className="text-zinc-400">
          Connect your provider accounts to sync analytics.
        </p>
      </div>

      {fanvueLastError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-400">
          <p className="text-sm font-medium">Fanvue connection error</p>
          <p className="mt-1 text-sm opacity-90">{fanvueLastError}</p>
          {fanvue?.status === "ERROR" &&
            fanvueLastError.toLowerCase().includes("invalid_client") &&
            (fanvue?.tokenUrlHost === "auth.fanvue.com" || fanvue?.tokenUrlHost == null) && (
              <p className="mt-2 text-xs opacity-90">
                Fanvue token endpoint requires client authentication. The app will retry using Basic Auth automatically.
              </p>
            )}
          <p className="mt-2 text-xs opacity-75">Fix the issue above, then try Connect Fanvue again or run the preflight check.</p>
        </div>
      )}

      {(fanvueLastError?.includes("insufficient_scopes") ||
        exploreData?.endpoints?.some((e) => e.insufficientScopes)) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-400">
          <p className="text-sm font-medium">Fanvue token is missing required scopes</p>
          <p className="mt-1 text-sm opacity-90">
            In the Fanvue dashboard, enable the required scopes. Then click <strong>Reconnect</strong> (or Disconnect → Connect Fanvue) to re-authorize and refresh your token scopes.
          </p>
        </div>
      )}

      {fanvue?.status === "ERROR" &&
        fanvue?.lastError?.startsWith("fanvue_sync_failed") &&
        session?.user?.role === "ADMIN" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-400">
          <p className="text-sm font-medium">Fanvue sync failed</p>
          <p className="mt-1 text-sm opacity-90">{fanvue.lastError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            disabled={syncDetailsLoading}
            onClick={async () => {
              setSyncDetailsError(null);
              setSyncDetailsData(null);
              setSyncDetailsOpen(true);
              setSyncDetailsLoading(true);
              try {
                const data = await fetchSyncLastError();
                setSyncDetailsData(data);
              } catch (e) {
                setSyncDetailsError(e instanceof Error ? e.message : "Failed to load");
              } finally {
                setSyncDetailsLoading(false);
              }
            }}
          >
            {syncDetailsLoading ? "Loading…" : "View sync details"}
          </Button>
        </div>
      )}

      {(bannerError || bannerSuccess) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            bannerError
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-green-500/30 bg-green-500/10 text-green-400"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">{bannerError ?? bannerSuccess}</p>
            <button
              type="button"
              onClick={clearBanner}
              className="shrink-0 text-current opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {validate && !validate.ok && (
        <Card className="border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white">Fanvue setup</CardTitle>
            <CardDescription className="text-zinc-400">
              Paste your Client ID and Client Secret from the Fanvue dashboard. The app will use default endpoints (no need to fill URLs).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validate.missing.length > 0 && (
              <p className="text-sm text-amber-400/90">
                Missing: {validate.missing.join(", ")}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fanvue-client-id" className="text-zinc-300">Client ID</Label>
                <Input
                  id="fanvue-client-id"
                  type="text"
                  placeholder="Paste from Fanvue"
                  value={setupClientId}
                  onChange={(e) => setSetupClientId(e.target.value)}
                  className="border-white/20 bg-white/5 text-white placeholder:text-zinc-500"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fanvue-client-secret" className="text-zinc-300">Client Secret</Label>
                <Input
                  id="fanvue-client-secret"
                  type="password"
                  placeholder="Paste from Fanvue"
                  value={setupClientSecret}
                  onChange={(e) => setSetupClientSecret(e.target.value)}
                  className="border-white/20 bg-white/5 text-white placeholder:text-zinc-500"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {session?.user?.role === "ADMIN" && (
                <Button
                  className="bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90"
                  disabled={!setupClientId.trim() || !setupClientSecret.trim() || saveEnvMutation.isPending}
                  onClick={() =>
                    saveEnvMutation.mutate({
                      clientId: setupClientId.trim(),
                      clientSecret: setupClientSecret.trim(),
                    })
                  }
                >
                  {saveEnvMutation.isPending ? "Saving…" : "Save to .env (local dev)"}
                </Button>
              )}
              <Button
                variant="outline"
                className="border-white/20 text-zinc-300 hover:bg-white/10"
                onClick={() => refetchValidate()}
              >
                Validate config
              </Button>
            </div>
            {session?.user?.role !== "ADMIN" && (
              <p className="text-xs text-zinc-500">Only admins can save to .env. Ask an admin or add the vars manually.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-white/10 bg-white/[0.04] backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Provider connections</CardTitle>
          <CardDescription className="text-zinc-400">
            Connect Fanvue (and later Infloww) to sync analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-zinc-300 hover:bg-white/10"
              disabled={preflightLoading}
              onClick={async () => {
                setPreflightLoading(true);
                setPreflightResult(null);
                try {
                  const data = await fetchPreflight();
                  setPreflightResult(data);
                } catch {
                  setBannerError("Preflight check failed.");
                } finally {
                  setPreflightLoading(false);
                }
              }}
            >
              {preflightLoading ? "Running…" : "Run Fanvue preflight check"}
            </Button>
          </div>
          {preflightResult && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <p className="text-sm font-medium text-white">
                {preflightResult.ok ? "All checks passed" : "Issues to fix"}
              </p>
              <ul className="space-y-1.5 text-sm">
                <li className={preflightResult.checks.port3000 ? "text-emerald-400" : "text-red-400"}>
                  {preflightResult.checks.port3000 ? "✓" : "✗"} Port 3000: {preflightResult.checks.port3000 ? "APP_BASE_URL uses port 3000" : "APP_BASE_URL is not localhost:3000 — run npm run dev on port 3000 or set APP_BASE_URL and Fanvue redirect to match."}
                </li>
                <li className={preflightResult.checks.hasClientId ? "text-emerald-400" : "text-red-400"}>
                  {preflightResult.checks.hasClientId ? "✓" : "✗"} FANVUE_CLIENT_ID set
                </li>
                <li className={preflightResult.checks.hasClientSecret ? "text-emerald-400" : "text-red-400"}>
                  {preflightResult.checks.hasClientSecret ? "✓" : "✗"} FANVUE_CLIENT_SECRET set
                </li>
                <li className={preflightResult.checks.usesAuthFanvueHost ? "text-emerald-400" : "text-red-400"}>
                  {preflightResult.checks.usesAuthFanvueHost ? "✓" : "✗"} Authorization URL: {preflightResult.checks.usesAuthFanvueHost ? "https://auth.fanvue.com/oauth2/auth" : "Must be https://auth.fanvue.com/oauth2/auth"}
                </li>
                <li className={preflightResult.checks.hasPkce ? "text-emerald-400" : "text-zinc-400"}>
                  ✓ PKCE (S256) enabled
                </li>
              </ul>
              {preflightResult.basicAuthNote && (
                <p className="text-xs text-zinc-500">{preflightResult.basicAuthNote}</p>
              )}
              {preflightResult.problems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs font-medium text-amber-400/90 mb-2">Fix these:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-zinc-300">
                    {preflightResult.problems.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preflightResult.ok && (
                <p className="text-xs text-zinc-500">
                  In Fanvue dashboard, set redirect URL to: <code className="rounded bg-white/10 px-1">{preflightResult.redirectUriHint}</code>
                </p>
              )}
            </div>
          )}
          {isLoading ? (
            <div className="h-20 animate-pulse rounded bg-white/10" />
          ) : (
            <>
              {/* Fanvue card */}
              <div className="flex flex-col gap-4 rounded-lg border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">Fanvue</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      variant={
                        fanvue?.status === "CONNECTED"
                          ? "default"
                          : fanvue?.status === "ERROR"
                            ? "destructive"
                            : "secondary"
                      }
                      className={
                        fanvue?.status === "CONNECTED"
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : fanvue?.status === "ERROR"
                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : "bg-white/10 text-zinc-400 border-white/10"
                      }
                    >
                      {fanvue?.status === "CONNECTED"
                        ? "Connected"
                        : fanvue?.status === "ERROR"
                          ? "Error"
                          : "Not connected"}
                    </Badge>
                    {fanvue?.connectedAt && (
                      <span className="text-xs text-zinc-500">
                        Connected at {new Date(fanvue.connectedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {!fanvueConfigured && (
                    <p className="mt-2 text-sm text-amber-400/90">
                      {validate && !validate.ok
                        ? "Complete the Fanvue setup above, then restart the dev server."
                        : "Set FANVUE_CLIENT_ID and FANVUE_CLIENT_SECRET in .env (see Settings → Fanvue setup)."}
                    </p>
                  )}
                  {fanvueConfigured && scopesData?.scope && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-zinc-500">Requested scopes</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-zinc-400 break-all font-mono bg-white/5 px-2 py-1 rounded">
                          {scopesData.scope}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-400 hover:text-white h-7 text-xs"
                          onClick={() => {
                            void navigator.clipboard.writeText(scopesData.scope);
                          }}
                        >
                          Copy scopes
                        </Button>
                      </div>
                      {scopesData.scope.trim() === "openid offline_access offline" && (
                        <p className="text-xs text-amber-400 mt-1">
                          Only basic scopes — API calls will return 403. Set FANVUE_SCOPES in .env (e.g. read:creator read:insights read:agency read:self), restart the server, then click Reconnect.
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 mt-0.5">
                        After changing scopes, click Reconnect so Fanvue issues a new token with these scopes.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {fanvue?.status === "ERROR" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      onClick={async () => {
                        setDiagnosticsOpen(true);
                        setDiagnosticsError(null);
                        setDiagnosticsData(null);
                        setDiagnosticsLoading(true);
                        try {
                          const data = await fetchDiagnostics();
                          setDiagnosticsData(data);
                        } catch (e) {
                          setDiagnosticsError(e instanceof Error ? e.message : "Failed to load");
                        } finally {
                          setDiagnosticsLoading(false);
                        }
                      }}
                    >
                      View diagnostics
                    </Button>
                  )}
                  {fanvueConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      disabled={syncLoading}
                      onClick={async () => {
                        setSyncMessage(null);
                        setSyncLoading(true);
                        setSyncProgress(0);
                        const progressInterval = setInterval(() => {
                          setSyncProgress((p) => {
                            if (p >= 90) return 90;
                            return Math.min(90, p + (90 - p) * 0.06);
                          });
                        }, 500);
                        try {
                          const res = await fetch("/api/fanvue/sync", { method: "POST" });
                          const json = await res.json().catch(() => ({}));
                          clearInterval(progressInterval);
                          setSyncProgress(100);
                          if (res.ok && json.ok) {
                            setSyncMessage(json.message ?? "Synced.");
                            queryClient.invalidateQueries({ queryKey: ["dashboard-revenue"] });
                          } else {
                            setSyncMessage(json.error ?? "Sync failed.");
                            if (json.error === "insufficient_scopes" || json.error === "fanvue_sync_failed") {
                              queryClient.invalidateQueries({ queryKey: ["settings", "connections"] });
                            }
                          }
                        } catch {
                          clearInterval(progressInterval);
                          setSyncProgress(100);
                          setSyncMessage("Sync failed.");
                        } finally {
                          clearInterval(progressInterval);
                          setSyncLoading(false);
                          setTimeout(() => setSyncProgress(0), 400);
                        }
                      }}
                    >
                      {syncLoading ? `Syncing… ${Math.round(syncProgress)}%` : "Sync Fanvue Data"}
                    </Button>
                  )}
                  {fanvueConnected && session?.user?.role === "ADMIN" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      disabled={exploreLoading}
                      onClick={async () => {
                        setExploreOpen(true);
                        setExploreError(null);
                        setExploreData(null);
                        setExploreLoading(true);
                        try {
                          const data = await fetchExplore();
                          setExploreData(data);
                        } catch (e) {
                          setExploreError(e instanceof Error ? e.message : "Failed to explore");
                        } finally {
                          setExploreLoading(false);
                        }
                      }}
                    >
                      {exploreLoading ? "Exploring…" : "Explore Fanvue API"}
                    </Button>
                  )}
                  {fanvueConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      disabled={reconnectLoading || disconnectMutation.isPending}
                      onClick={async () => {
                        setReconnectLoading(true);
                        try {
                          await disconnectMutation.mutateAsync();
                          window.location.href = "/api/fanvue/oauth/start";
                        } catch {
                          setReconnectLoading(false);
                        }
                      }}
                      title="Disconnect then re-authorize so new scopes apply. You’ll need to approve again on Fanvue."
                    >
                      {reconnectLoading ? "Reconnecting…" : "Reconnect"}
                    </Button>
                  )}
                  {fanvueConnected && session?.user?.role === "ADMIN" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                      disabled={reconnectLoading || disconnectMutation.isPending}
                      onClick={() => {
                        window.location.href = "/api/fanvue/oauth/start?fresh=1";
                      }}
                      title="Clears local token state and adds prompt=consent + max_age=0 to force a new Fanvue approval screen."
                    >
                      Force fresh Fanvue auth
                    </Button>
                  )}
                  {fanvueConnected ? (
                    <Button
                      variant="outline"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending || reconnectLoading}
                    >
                      {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      className="bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90"
                      disabled={!fanvueConfigured}
                      asChild
                    >
                      <a href="/api/fanvue/oauth/start">Connect Fanvue</a>
                    </Button>
                  )}
                </div>
                {syncLoading && (
                  <div className="space-y-1.5 pt-1">
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-white/60 transition-[width] duration-300 ease-out"
                        style={{ width: `${syncProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500 tabular-nums">{Math.round(syncProgress)}%</p>
                  </div>
                )}
                {(syncMessage || rebuildMessage) && (
                  <p className={`text-sm ${(rebuildMessage ?? syncMessage)?.startsWith("Rebuild") || (rebuildMessage ?? syncMessage)?.startsWith("Synced") ? "text-emerald-400" : "text-amber-400"}`}>
                    {rebuildMessage ?? syncMessage}
                  </p>
                )}
              </div>

              {/* Rebuild Fanvue confirm dialog */}
              <Dialog open={rebuildConfirmOpen} onOpenChange={setRebuildConfirmOpen}>
                <DialogContent
                  onClose={() => setRebuildConfirmOpen(false)}
                  showClose={true}
                  className="max-w-md border-white/10 bg-zinc-900"
                >
                  <DialogHeader>
                    <DialogTitle className="text-white">Rebuild Fanvue earnings</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-zinc-400">
                    This will clear and re-import Fanvue earnings data for this month (UTC+2). Continue?
                  </p>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20"
                      onClick={() => setRebuildConfirmOpen(false)}
                      disabled={rebuildLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                      disabled={rebuildLoading}
                      onClick={async () => {
                        setRebuildLoading(true);
                        setRebuildMessage(null);
                        try {
                          const res = await fetch("/api/fanvue/sync?rebuild=1", {
                            method: "POST",
                          });
                          const json = await res.json().catch(() => ({}));
                          if (res.ok && json.ok) {
                            setRebuildMessage(
                              `Rebuild done. Deleted ${json.deletedCreatorDailyRows ?? 0} creator daily rows, ${json.deletedAgencyRows ?? 0} agency rows. ${json.dailyRowsUpserted ?? 0} days synced.`
                            );
                            queryClient.invalidateQueries({ queryKey: ["settings", "connections"] });
                            queryClient.invalidateQueries({ queryKey: ["dashboard-revenue"] });
                            queryClient.invalidateQueries({ queryKey: ["fanvue"] });
                          } else {
                            setRebuildMessage(json.error ?? "Rebuild failed.");
                          }
                          setRebuildConfirmOpen(false);
                        } catch {
                          setRebuildMessage("Rebuild failed.");
                          setRebuildConfirmOpen(false);
                        } finally {
                          setRebuildLoading(false);
                        }
                      }}
                    >
                      {rebuildLoading ? "Rebuilding…" : "Continue"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Fanvue OAuth diagnostics dialog (dev-only data) */}
              <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
                <DialogContent
                  onClose={() => setDiagnosticsOpen(false)}
                  showClose={true}
                  className="max-w-md border-white/10 bg-zinc-900"
                >
                  <DialogHeader>
                    <DialogTitle className="text-white">Fanvue OAuth diagnostics</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    {diagnosticsLoading && <p className="text-zinc-400">Loading…</p>}
                    {diagnosticsError && (
                      <p className="text-red-400">{diagnosticsError}</p>
                    )}
                    {!diagnosticsLoading && diagnosticsData && (
                      <>
                        <p className="text-zinc-400">Connection: {diagnosticsData.connectionStatus ?? "—"}</p>
                        <p className="text-zinc-400">Last error: {diagnosticsData.lastError ?? "—"}</p>
                        {diagnosticsData.lastDebugJson && (
                          <div className="rounded border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-300 space-y-2">
                            <p><span className="text-zinc-500">status:</span> {diagnosticsData.lastDebugJson.status}</p>
                            <p><span className="text-zinc-500">statusText:</span> {diagnosticsData.lastDebugJson.statusText}</p>
                            <p><span className="text-zinc-500">tokenUrlHost:</span> {diagnosticsData.lastDebugJson.tokenUrlHost}</p>
                            <p><span className="text-zinc-500">sentClientSecret:</span> {String(diagnosticsData.lastDebugJson.sentClientSecret)}</p>
                            <p><span className="text-zinc-500">redirectUri:</span> {diagnosticsData.lastDebugJson.redirectUri}</p>
                            {diagnosticsData.lastDebugJson.responseJson && (
                              <>
                                <p><span className="text-zinc-500">error:</span> {diagnosticsData.lastDebugJson.responseJson.error ?? "—"}</p>
                                <p><span className="text-zinc-500">error_description:</span> {diagnosticsData.lastDebugJson.responseJson.error_description ?? "—"}</p>
                              </>
                            )}
                            {diagnosticsData.lastDebugJson.responseTextPreview && (
                              <p><span className="text-zinc-500">responseTextPreview:</span> {diagnosticsData.lastDebugJson.responseTextPreview}</p>
                            )}
                            {diagnosticsData.lastDebugJson.attemptedAuthMethod != null && (
                              <p><span className="text-zinc-500">attemptedAuthMethod:</span> {diagnosticsData.lastDebugJson.attemptedAuthMethod}</p>
                            )}
                            {diagnosticsData.lastDebugJson.retryAttempted != null && (
                              <p><span className="text-zinc-500">retryAttempted:</span> {String(diagnosticsData.lastDebugJson.retryAttempted)}</p>
                            )}
                            {diagnosticsData.lastDebugJson.finalAuthMethodUsed != null && (
                              <p><span className="text-zinc-500">finalAuthMethodUsed:</span> {diagnosticsData.lastDebugJson.finalAuthMethodUsed}</p>
                            )}
                          </div>
                        )}
                        {!diagnosticsData.lastDebugJson && diagnosticsData.lastError && (
                          <p className="text-zinc-500">No debug payload (e.g. not a token exchange failure or production).</p>
                        )}
                      </>
                    )}
                  </div>
                  {!diagnosticsLoading && diagnosticsData && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-zinc-300"
                      onClick={() => {
                        const payload = JSON.stringify(
                          { lastError: diagnosticsData?.lastError, lastDebugJson: diagnosticsData?.lastDebugJson },
                          null,
                          2
                        );
                        void navigator.clipboard.writeText(payload);
                      }}
                    >
                      Copy diagnostics
                    </Button>
                  )}
                </DialogContent>
              </Dialog>

              {/* Fanvue sync error details modal */}
              <Dialog open={syncDetailsOpen} onOpenChange={setSyncDetailsOpen}>
                <DialogContent
                  onClose={() => setSyncDetailsOpen(false)}
                  showClose={true}
                  className="max-w-md border-white/10 bg-zinc-900"
                >
                  <DialogHeader>
                    <DialogTitle className="text-white">Sync error details</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    {syncDetailsLoading && <p className="text-zinc-400">Loading…</p>}
                    {syncDetailsError && (
                      <p className="text-red-400">{syncDetailsError}</p>
                    )}
                    {!syncDetailsLoading && syncDetailsData && (
                      <>
                        {syncDetailsData.lastError && (
                          <p className="text-amber-400">{syncDetailsData.lastError}</p>
                        )}
                        {syncDetailsData.lastDebugJson && (
                          <div className="rounded border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-300 space-y-2">
                            {syncDetailsData.lastDebugJson.status != null && (
                              <p><span className="text-zinc-500">status:</span> {syncDetailsData.lastDebugJson.status}</p>
                            )}
                            {syncDetailsData.lastDebugJson.endpoint != null && (
                              <p><span className="text-zinc-500">endpoint:</span> {syncDetailsData.lastDebugJson.endpoint}</p>
                            )}
                            {syncDetailsData.lastDebugJson.method != null && (
                              <p><span className="text-zinc-500">method:</span> {syncDetailsData.lastDebugJson.method}</p>
                            )}
                            {syncDetailsData.lastDebugJson.queryParams != null && Object.keys(syncDetailsData.lastDebugJson.queryParams).length > 0 && (
                              <p><span className="text-zinc-500">queryParams:</span> {JSON.stringify(syncDetailsData.lastDebugJson.queryParams)}</p>
                            )}
                            {syncDetailsData.lastDebugJson.responsePreview != null && (
                              <p className="break-all"><span className="text-zinc-500">responsePreview:</span> {syncDetailsData.lastDebugJson.responsePreview}</p>
                            )}
                          </div>
                        )}
                        {!syncDetailsData.lastDebugJson && syncDetailsData.lastError && (
                          <p className="text-zinc-500">No debug payload (e.g. production or older error).</p>
                        )}
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Fanvue API explore modal — discovered endpoints */}
              <Dialog open={exploreOpen} onOpenChange={setExploreOpen}>
                <DialogContent
                  onClose={() => setExploreOpen(false)}
                  showClose={true}
                  className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border-white/10 bg-zinc-900"
                >
                  <DialogHeader>
                    <DialogTitle className="text-white">Fanvue API explorer</DialogTitle>
                    <p className="text-xs text-zinc-500">Discovered endpoints (status + response preview)</p>
                  </DialogHeader>
                  <div className="overflow-y-auto space-y-3 text-sm flex-1 min-h-0">
                    {exploreLoading && <p className="text-zinc-400">Loading…</p>}
                    {exploreError && <p className="text-red-400">{exploreError}</p>}
                    {!exploreLoading && exploreData?.endpoints && (
                      <ul className="space-y-4">
                        {exploreData.endpoints.map((item, i) => (
                          <li key={i} className="rounded border border-white/10 bg-black/30 p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-pink-400 font-mono text-xs">{item.endpoint}</code>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                  item.status >= 200 && item.status < 300
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : item.status >= 400
                                      ? "bg-red-500/20 text-red-400"
                                      : "bg-zinc-500/20 text-zinc-400"
                                }`}
                              >
                                {item.status || "—"}
                              </span>
                              {item.insufficientScopes && (
                                <span className="text-xs text-amber-400">
                                  Insufficient scopes — reconnect Fanvue to refresh token scopes.
                                </span>
                              )}
                              {item.error && !item.insufficientScopes && (
                                <span className="text-xs text-amber-400">{item.error}</span>
                              )}
                            </div>
                            {item.preview !== undefined && (
                              <pre className="mt-2 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">
                                {JSON.stringify(item.preview, null, 2)}
                              </pre>
                            )}
                            {item.responseTextPreview !== undefined && (
                              <pre className="mt-2 text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">
                                {item.responseTextPreview}
                              </pre>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {/* Infloww */}
              <div className="flex flex-col gap-4 rounded-lg border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">Infloww</p>
                  {inflowwConnected ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Badge className="border-transparent bg-emerald-500/20 text-emerald-400">Connected</Badge>
                      <span className="text-xs text-zinc-500 truncate max-w-[200px]">{inflowwFileName}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Upload your Infloww data export to sync analytics.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {inflowwConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        localStorage.removeItem("infloww-file-name");
                        setInflowwConnected(false);
                        setInflowwFileName("");
                      }}
                    >
                      Disconnect
                    </Button>
                  )}
                  <Button
                    className={inflowwConnected
                      ? "border border-white/20 bg-transparent text-zinc-300 hover:bg-white/10 hover:text-white"
                      : "bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90"}
                    onClick={() => {
                      setInflowwFile(null);
                      setInflowwUploadOpen(true);
                    }}
                  >
                    {inflowwConnected ? "Re-upload" : "Connect"}
                  </Button>
                </div>
              </div>

              {/* Infloww upload dialog */}
              <Dialog
                open={inflowwUploadOpen}
                onOpenChange={(open) => {
                  setInflowwUploadOpen(open);
                  if (!open) { setInflowwFile(null); setInflowwUploadError(null); }
                }}
              >
                <DialogContent className="max-w-md border-white/10 bg-zinc-900">
                  <DialogHeader>
                    <DialogTitle className="text-white">Connect Infloww</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-zinc-400">
                    Upload your Infloww data export. Supported formats: CSV, XLSX, XLS.
                  </p>

                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setInflowwDragging(true); }}
                    onDragLeave={() => setInflowwDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setInflowwDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) setInflowwFile(file);
                    }}
                    onClick={() => document.getElementById("infloww-file-input")?.click()}
                    className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                      inflowwDragging
                        ? "border-pink-400/60 bg-pink-400/5"
                        : "border-white/20 hover:border-white/40 hover:bg-white/[0.02]"
                    }`}
                  >
                    <input
                      id="infloww-file-input"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setInflowwFile(file);
                      }}
                    />
                    {inflowwFile ? (
                      <>
                        <p className="text-sm font-medium text-white">{inflowwFile.name}</p>
                        <p className="text-xs text-zinc-500">{(inflowwFile.size / 1024).toFixed(1)} KB</p>
                        <p className="text-xs text-zinc-600">Click to change file</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-zinc-400">Drag &amp; drop your file here</p>
                        <p className="text-xs text-zinc-600">or click to browse</p>
                        <p className="mt-1 text-xs text-zinc-600">CSV · XLSX · XLS</p>
                      </>
                    )}
                  </div>

                  {inflowwUploadError && (
                    <p className="text-sm text-red-400 pb-1">{inflowwUploadError}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="border-white/20 text-zinc-300 hover:bg-white/10 hover:text-white"
                      onClick={() => setInflowwUploadOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!inflowwFile || inflowwUploading}
                      className="bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90 disabled:opacity-40"
                      onClick={async () => {
                        if (!inflowwFile) return;
                        setInflowwUploading(true);
                        setInflowwUploadError(null);
                        try {
                          const form = new FormData();
                          form.append("file", inflowwFile);
                          const res = await fetch("/api/infloww/upload", {
                            method: "POST",
                            body: form,
                          });
                          const json = await res.json() as { ok?: boolean; error?: string; rowsUpserted?: number; creators?: string[] };
                          if (!res.ok || !json.ok) {
                            setInflowwUploadError(json.error ?? "Upload failed");
                            return;
                          }
                          localStorage.setItem("infloww-file-name", inflowwFile.name);
                          setInflowwFileName(inflowwFile.name);
                          setInflowwConnected(true);
                          setInflowwUploadOpen(false);
                          setInflowwFile(null);
                          setBannerSuccess(
                            `Infloww data loaded — ${json.rowsUpserted ?? 0} rows for: ${(json.creators ?? []).join(", ")}`
                          );
                          setTimeout(() => setBannerSuccess(null), 8000);
                        } catch (e) {
                          setInflowwUploadError(e instanceof Error ? e.message : "Upload failed");
                        } finally {
                          setInflowwUploading(false);
                        }
                      }}
                    >
                      {inflowwUploading ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-white/10" />
          </div>
          <div className="h-48 animate-pulse rounded-lg bg-white/10" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
