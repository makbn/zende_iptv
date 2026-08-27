"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { TvAddStreamWizard } from "./tv-add-stream-wizard";

import { Button } from "@appica/ui-react/button";
import { Card } from "@appica/ui-react/card";
import { Input } from "@appica/ui-react/input";
import { zendeFetch } from "@/lib/auth/zende-fetch";

type Provider = {
  id: string;
  name: string;
  kind: string;
  serverUrl: string | null;
  playlistUrl: string | null;
  username: string | null;
  hasPassword: boolean;
  enabled: boolean;
  channelCount: number;
};

type ProviderChannel = {
  id: string;
  providerId: string;
  name: string;
  url: string;
  groupTitle: string | null;
  tvgId: string | null;
  tvgLogo: string | null;
  contentType: string | null;
};

export function TvIptvProvidersSection() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [channels, setChannels] = useState<ProviderChannel[]>([]);
  const [channelTotal, setChannelTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerDraft, setProviderDraft] = useState({ name: "", serverUrl: "", playlistUrl: "", username: "", password: "" });
  const [editingChannel, setEditingChannel] = useState<ProviderChannel | null>(null);
  const [channelDraft, setChannelDraft] = useState({ name: "", url: "", groupTitle: "", tvgId: "", tvgLogo: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadProviders = useCallback(async () => {
    const response = await zendeFetch("/api/providers");
    const body = (await response.json().catch(() => ({}))) as { providers?: Provider[] };
    if (response.ok) setProviders(body.providers ?? []);
    setLoading(false);
  }, []);

  const loadChannels = useCallback(async (providerId: string, search = "") => {
    const response = await zendeFetch(`/api/providers/${providerId}/channels?q=${encodeURIComponent(search)}&limit=250`);
    const body = (await response.json().catch(() => ({}))) as { channels?: ProviderChannel[]; total?: number };
    if (response.ok) {
      setChannels(body.channels ?? []);
      setChannelTotal(body.total ?? 0);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProviders(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProviders]);
  useEffect(() => {
    if (!expandedId) return;
    const timer = window.setTimeout(() => void loadChannels(expandedId, query), 180);
    return () => window.clearTimeout(timer);
  }, [expandedId, loadChannels, query]);

  const beginProviderEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setProviderDraft({
      name: provider.name,
      serverUrl: provider.serverUrl ?? "",
      playlistUrl: provider.playlistUrl ?? "",
      username: provider.username ?? "",
      password: "",
    });
  };

  const saveProvider = async () => {
    if (!editingProvider) return;
    const response = await zendeFetch(`/api/providers/${editingProvider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(providerDraft),
    });
    if (!response.ok) return setStatus("Could not update provider.");
    setEditingProvider(null);
    setStatus("Provider updated.");
    await loadProviders();
  };

  const beginChannelEdit = (channel: ProviderChannel) => {
    setEditingChannel(channel);
    setChannelDraft({
      name: channel.name,
      url: channel.url,
      groupTitle: channel.groupTitle ?? "",
      tvgId: channel.tvgId ?? "",
      tvgLogo: channel.tvgLogo ?? "",
    });
  };

  const saveChannel = async () => {
    if (!editingChannel) return;
    const response = await zendeFetch(`/api/providers/${editingChannel.providerId}/channels/${editingChannel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channelDraft),
    });
    if (!response.ok) return setStatus("Could not update stream.");
    setEditingChannel(null);
    setStatus("Stream updated.");
    await loadChannels(editingChannel.providerId, query);
  };

  return (
    <Card frame="solid" contentProps={{ className: "p-5 sm:p-6" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3 sm:flex-1">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background-muted">
            <Building2 className="size-5 text-foreground-muted" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground-intense">IPTV providers</h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
              Providers and streams use database IDs. Duplicate channel names remain separate and retain their provider-owned playback URL.
            </p>
          </div>
        </div>
        <Button size="sm" variant="primary" className="w-full shrink-0 sm:w-auto" onClick={() => setWizardOpen(true)}>
          <Plus className="size-4" aria-hidden /> Add Stream
        </Button>
      </div>

      <TvAddStreamWizard open={wizardOpen} onOpenChange={setWizardOpen} onAdded={() => void loadProviders()} />

      {status ? <p className="mt-4 text-sm text-foreground-muted" role="status">{status}</p> : null}
      {loading ? <p className="mt-5 text-sm text-foreground-muted">Loading providers…</p> : null}
      {!loading && providers.length === 0 ? (
        <p className="mt-5 rounded-lg border border-border bg-background-muted p-4 text-sm text-foreground-muted">
          No relational providers yet. Import an M3U or Xtream account below and give it a provider name.
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {providers.map((provider) => (
          <Card key={provider.id} frame="solid" contentProps={{ className: "p-4" }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground-intense">{provider.name}</h3>
                  <span className="rounded-full border border-border bg-background-muted px-2.5 py-1 text-xs text-foreground-muted">{provider.kind.toUpperCase()}</span>
                  <span className="rounded-full border border-border bg-background-muted px-2.5 py-1 text-xs text-foreground-muted">{provider.channelCount.toLocaleString()} streams</span>
                  {!provider.enabled ? <span className="rounded-full border border-warning bg-warning-subtle px-2.5 py-1 text-xs text-warning-strong">Disabled</span> : null}
                </div>
                <p className="mt-1 truncate text-xs text-foreground-muted">{provider.serverUrl ?? provider.playlistUrl ?? "Provider source"}</p>
                <p className="mt-1 font-mono text-xs text-foreground-muted">ID: {provider.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  const next = expandedId === provider.id ? null : provider.id;
                  setExpandedId(next);
                  setQuery("");
                  if (next) void loadChannels(next);
                }}>
                  <ChevronDown className="size-4" aria-hidden />
                  Streams
                </Button>
                <Button variant="secondary" size="sm" onClick={() => beginProviderEdit(provider)}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={async () => {
                  await zendeFetch(`/api/providers/${provider.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: !provider.enabled }),
                  });
                  await loadProviders();
                }}>{provider.enabled ? "Disable" : "Enable"}</Button>
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (!window.confirm(`Remove ${provider.name} and all linked streams?`)) return;
                  await zendeFetch(`/api/providers?id=${provider.id}`, { method: "DELETE" });
                  if (expandedId === provider.id) setExpandedId(null);
                  await loadProviders();
                }}><Trash2 className="size-4" aria-hidden /> Remove</Button>
              </div>
            </div>

            {editingProvider?.id === provider.id ? (
              <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
                <Input value={providerDraft.name} onValueChange={(name) => setProviderDraft((draft) => ({ ...draft, name }))} placeholder="Provider name" />
                <Input value={providerDraft.serverUrl} onValueChange={(serverUrl) => setProviderDraft((draft) => ({ ...draft, serverUrl }))} placeholder="Server URL" />
                <Input value={providerDraft.playlistUrl} onValueChange={(playlistUrl) => setProviderDraft((draft) => ({ ...draft, playlistUrl }))} placeholder="Playlist URL" />
                <Input value={providerDraft.username} onValueChange={(username) => setProviderDraft((draft) => ({ ...draft, username }))} placeholder="Username" />
                <Input type="password" value={providerDraft.password} onValueChange={(password) => setProviderDraft((draft) => ({ ...draft, password }))} placeholder={provider.hasPassword ? "Leave blank to keep password" : "Password"} />
                <div className="flex gap-2"><Button size="sm" onClick={() => void saveProvider()}>Save provider</Button><Button size="sm" variant="secondary" onClick={() => setEditingProvider(null)}>Cancel</Button></div>
              </div>
            ) : null}

            {expandedId === provider.id ? (
              <div className="mt-4 border-t border-border pt-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
                  <Input value={query} onValueChange={setQuery} placeholder="Search this provider’s streams" className="pl-10" />
                </label>
                <p className="mt-2 text-xs text-foreground-muted">Showing {channels.length.toLocaleString()} of {channelTotal.toLocaleString()}</p>
                <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
                  {channels.map((channel) => (
                    <div key={channel.id} className="rounded-lg border border-border bg-background-muted p-3">
                      {editingChannel?.id === channel.id ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input value={channelDraft.name} onValueChange={(name) => setChannelDraft((draft) => ({ ...draft, name }))} placeholder="Channel name" />
                          <Input value={channelDraft.url} onValueChange={(url) => setChannelDraft((draft) => ({ ...draft, url }))} placeholder="Stream URL" />
                          <Input value={channelDraft.groupTitle} onValueChange={(groupTitle) => setChannelDraft((draft) => ({ ...draft, groupTitle }))} placeholder="Group" />
                          <Input value={channelDraft.tvgId} onValueChange={(tvgId) => setChannelDraft((draft) => ({ ...draft, tvgId }))} placeholder="EPG ID" />
                          <Input value={channelDraft.tvgLogo} onValueChange={(tvgLogo) => setChannelDraft((draft) => ({ ...draft, tvgLogo }))} placeholder="Logo URL" />
                          <div className="flex gap-2"><Button size="sm" onClick={() => void saveChannel()}>Save stream</Button><Button size="sm" variant="secondary" onClick={() => setEditingChannel(null)}>Cancel</Button></div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="font-medium text-foreground-intense">{channel.name}</p><p className="mt-1 truncate text-xs text-foreground-muted">{channel.groupTitle ?? channel.contentType ?? "Stream"}</p><p className="mt-1 truncate font-mono text-xs text-foreground-muted">{channel.url}</p><p className="mt-1 font-mono text-xs text-foreground-muted">Channel ID: {channel.id}</p></div>
                          <div className="flex shrink-0 gap-2"><Button size="sm" variant="secondary" onClick={() => beginChannelEdit(channel)}>Edit</Button><Button size="sm" variant="destructive" onClick={async () => { await zendeFetch(`/api/providers/${provider.id}/channels/${channel.id}`, { method: "DELETE" }); await loadChannels(provider.id, query); await loadProviders(); }}>Remove</Button></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </Card>
  );
}
