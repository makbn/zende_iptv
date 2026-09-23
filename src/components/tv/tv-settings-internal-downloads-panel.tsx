"use client";

import { Button } from "@appica/ui-react/button";
import { Input } from "@appica/ui-react/input";
import { Folder, FolderOpen, HardDriveDownload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { zendeFetch } from "@/lib/auth/zende-fetch";

type Settings = {
  configured: boolean;
  directoryPath: string | null;
  allowedRoots: string[];
  error?: string;
};

type DirectoryListing = {
  current: string;
  parent: string | null;
  roots: string[];
  directories: Array<{ name: string; path: string }>;
  error?: string;
};

export function TvSettingsInternalDownloadsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("Downloads");

  const loadSettings = useCallback(async () => {
    setBusy(true);
    const response = await zendeFetch("/api/settings/internal-downloads", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as Settings;
    if (!response.ok) setMessage(body.error || "Could not load internal download settings.");
    else setSettings(body);
    setBusy(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSettings]);

  const browse = useCallback(async (directory?: string | null) => {
    setBusy(true);
    setMessage(null);
    const query = directory ? `?path=${encodeURIComponent(directory)}` : "";
    const response = await zendeFetch(`/api/settings/internal-downloads/directories${query}`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as DirectoryListing;
    if (!response.ok) setMessage(body.error || "Could not browse server folders.");
    else setListing(body);
    setBusy(false);
  }, []);

  const save = useCallback(async (directoryPath: string | null) => {
    setBusy(true);
    setMessage(null);
    const response = await zendeFetch("/api/settings/internal-downloads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directoryPath }),
    });
    const body = (await response.json().catch(() => ({}))) as Settings;
    if (!response.ok) setMessage(body.error || "Could not save the directory.");
    else {
      setSettings(body);
      setListing(null);
      setMessage(directoryPath ? "Internal download directory saved." : "Internal downloads disabled.");
    }
    setBusy(false);
  }, []);

  const createFolder = useCallback(async () => {
    if (!listing || !newFolder.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await zendeFetch("/api/settings/internal-downloads/directories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: listing.current, name: newFolder.trim() }),
    });
    const body = (await response.json().catch(() => ({}))) as DirectoryListing;
    if (!response.ok) setMessage(body.error || "Could not create folder.");
    else {
      setListing(body);
      setNewFolder("Downloads");
    }
    setBusy(false);
  }, [listing, newFolder]);

  return (
    <section className="rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border" aria-labelledby="internal-download-heading">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-strong">
          <HardDriveDownload className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Administrator only</p>
          <h2 id="internal-download-heading" className="mt-1 text-[18px] font-semibold text-foreground-intense">Internal downloads</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground-muted">
            Movie and episode downloads requested from the web or Android TV run on this server and are saved here. TV users cannot change this directory.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-background px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Selected server folder</p>
        <p className="mt-1 break-all font-mono text-sm text-foreground-intense">
          {settings?.configured ? settings.directoryPath : "Not configured"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={() => void browse(settings?.directoryPath)} disabled={busy}>
          <FolderOpen className="size-4" aria-hidden /> Choose server folder
        </Button>
        {settings?.configured ? <Button type="button" variant="secondary" onClick={() => void save(null)} disabled={busy}>Disable</Button> : null}
        {busy ? <ZendeSpinner size="tiny" label="Loading download folders" /> : null}
      </div>

      {listing ? (
        <div className="mt-5 rounded-xl border border-border bg-background p-4" role="dialog" aria-label="Choose internal download folder">
          <p className="break-all font-mono text-sm text-foreground-intense">{listing.current}</p>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
            {listing.parent ? <Button type="button" variant="ghost" className="justify-start" onClick={() => void browse(listing.parent)}>← Parent folder</Button> : null}
            {listing.directories.map((directory) => (
              <Button key={directory.path} type="button" variant="ghost" className="justify-start" onClick={() => void browse(directory.path)}>
                <Folder className="size-4" aria-hidden /> {directory.name}
              </Button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Input value={newFolder} onChange={(event) => setNewFolder(event.target.value)} aria-label="New folder name" className="max-w-xs" />
            <Button type="button" variant="secondary" onClick={() => void createFolder()} disabled={busy || !newFolder.trim()}>Create folder</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save(listing.current)} disabled={busy}>Use this folder</Button>
            <Button type="button" variant="ghost" onClick={() => setListing(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-foreground-intense" role="status">{message}</p> : null}
    </section>
  );
}
