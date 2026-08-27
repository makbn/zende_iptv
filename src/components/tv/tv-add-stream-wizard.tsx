"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from "@appica/ui-react/dialog";
import { Button } from "@appica/ui-react/button";
import { Input } from "@appica/ui-react/input";
import { Textarea } from "@appica/ui-react/textarea";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { parseM3u } from "@/core/playlist/m3u-parse";
import { isAllowedManualStreamUrl } from "@/lib/channels/manual-channels-store";
import { ChevronRight, FileText, Globe, Link2, MonitorPlay, Radio } from "lucide-react";

type StreamType = "channel" | "url" | "xtream" | "m3u" | null;

export function TvAddStreamWizard({ 
  open, 
  onOpenChange,
  onAdded
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [streamType, setStreamType] = useState<StreamType>(null);
  
  // Single Channel
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [logo, setLogo] = useState("");

  // Playlist URL
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistProviderName, setPlaylistProviderName] = useState("");

  // Xtream
  const [xtreamHost, setXtreamHost] = useState("");
  const [xtreamProviderName, setXtreamProviderName] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");

  // M3U text
  const [m3uPaste, setM3uPaste] = useState("");

  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setStreamType(null);
      setHint(null);
    }, 200);
  };

  const submitSingle = async () => {
    setHint(null);
    const n = name.trim();
    const u = url.trim();
    if (!n || !isAllowedManualStreamUrl(u)) {
      setHint("Enter a channel name and a valid http(s) stream URL.");
      return;
    }
    setBusy(true);
    try {
      const ch = { 
        name: n, 
        url: u, 
        duration: -1,
        ...(groupTitle.trim() ? { groupTitle: groupTitle.trim() } : {}),
        ...(logo.trim() ? { tvgLogo: logo.trim() } : {})
      };
      const res = await zendeFetch("/api/channels/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch }),
      });
      if (res.ok) {
        onAdded();
        handleClose();
      } else {
        setHint("Failed to add channel.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = async () => {
    setHint(null);
    if (!playlistUrl.trim() || !playlistProviderName.trim()) {
      setHint("Enter a provider name and a playlist URL.");
      return;
    }
    setBusy(true);
    try {
      const res = await zendeFetch("/api/playlists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: playlistUrl.trim(), persist: true, providerName: playlistProviderName.trim() }),
      });
      if (res.ok) {
        onAdded();
        handleClose();
      } else {
        const b = await res.json().catch(() => ({}));
        setHint(b.error || "Failed to import from URL.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitXtream = async () => {
    setHint(null);
    if (!xtreamHost.trim() || !xtreamUser.trim() || !xtreamPass.trim() || !xtreamProviderName.trim()) {
      setHint("Enter a provider name, host, username, and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await zendeFetch("/api/playlists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: xtreamProviderName.trim(),
          xtream: { host: xtreamHost.trim(), username: xtreamUser.trim(), password: xtreamPass.trim() },
          persist: true,
        }),
      });
      if (res.ok) {
        onAdded();
        handleClose();
      } else {
        const b = await res.json().catch(() => ({}));
        setHint(b.error || "Failed to import Xtream.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitM3u = async () => {
    setHint(null);
    const text = m3uPaste.trim();
    if (!text) {
      setHint("Paste M3U text first.");
      return;
    }
    const parsed = parseM3u(text);
    const valid = parsed.filter(ch => isAllowedManualStreamUrl(ch.url));
    if (valid.length === 0) {
      setHint("No valid stream URLs found.");
      return;
    }
    setBusy(true);
    try {
      const res = await zendeFetch("/api/channels/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: valid }),
      });
      if (res.ok) {
        onAdded();
        handleClose();
      } else {
        setHint("Failed to import pasted channels.");
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (streamType === "channel") submitSingle();
    else if (streamType === "url") submitUrl();
    else if (streamType === "xtream") submitXtream();
    else if (streamType === "m3u") submitM3u();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Stream</DialogTitle>
        </DialogHeader>
        
        <DialogBody>
          {step === 1 ? (
            <div className="grid gap-3">
              <button 
                type="button" 
                onClick={() => { setStreamType("channel"); setStep(2); }}
                className="flex items-center justify-between rounded-xl border border-border p-4 text-left transition-colors hover:bg-background-muted"
              >
                <div className="flex items-center gap-3">
                  <MonitorPlay className="size-5 text-primary-strong" />
                  <div>
                    <div className="font-semibold text-foreground-intense">Single Channel</div>
                    <div className="text-sm text-foreground-muted">Add a single channel by URL</div>
                  </div>
                </div>
                <ChevronRight className="size-5 text-foreground-muted" />
              </button>
              <button 
                type="button" 
                onClick={() => { setStreamType("url"); setStep(2); }}
                className="flex items-center justify-between rounded-xl border border-border p-4 text-left transition-colors hover:bg-background-muted"
              >
                <div className="flex items-center gap-3">
                  <Link2 className="size-5 text-primary-strong" />
                  <div>
                    <div className="font-semibold text-foreground-intense">Playlist URL</div>
                    <div className="text-sm text-foreground-muted">Import from remote M3U/M3U8 URL</div>
                  </div>
                </div>
                <ChevronRight className="size-5 text-foreground-muted" />
              </button>
              <button 
                type="button" 
                onClick={() => { setStreamType("xtream"); setStep(2); }}
                className="flex items-center justify-between rounded-xl border border-border p-4 text-left transition-colors hover:bg-background-muted"
              >
                <div className="flex items-center gap-3">
                  <Globe className="size-5 text-primary-strong" />
                  <div>
                    <div className="font-semibold text-foreground-intense">Xtream Codes</div>
                    <div className="text-sm text-foreground-muted">Import from Xtream API credentials</div>
                  </div>
                </div>
                <ChevronRight className="size-5 text-foreground-muted" />
              </button>
              <button 
                type="button" 
                onClick={() => { setStreamType("m3u"); setStep(2); }}
                className="flex items-center justify-between rounded-xl border border-border p-4 text-left transition-colors hover:bg-background-muted"
              >
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-primary-strong" />
                  <div>
                    <div className="font-semibold text-foreground-intense">Paste M3U</div>
                    <div className="text-sm text-foreground-muted">Paste M3U text directly</div>
                  </div>
                </div>
                <ChevronRight className="size-5 text-foreground-muted" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {streamType === "channel" && (
                <>
                  <Input value={name} onValueChange={setName} placeholder="Channel name (e.g. Local news HD)" />
                  <Input value={url} onValueChange={setUrl} type="url" placeholder="Stream URL (https://...)" />
                  <Input value={groupTitle} onValueChange={setGroupTitle} placeholder="Group (optional)" />
                  <Input value={logo} onValueChange={setLogo} type="url" placeholder="Logo URL (optional)" />
                </>
              )}
              {streamType === "url" && (
                <>
                  <Input value={playlistProviderName} onValueChange={setPlaylistProviderName} placeholder="Provider name" />
                  <Input value={playlistUrl} onValueChange={setPlaylistUrl} type="url" placeholder="Playlist URL (http://...)" />
                </>
              )}
              {streamType === "xtream" && (
                <>
                  <Input value={xtreamProviderName} onValueChange={setXtreamProviderName} placeholder="Provider name" />
                  <Input value={xtreamHost} onValueChange={setXtreamHost} placeholder="Host (http://example.com)" />
                  <Input value={xtreamUser} onValueChange={setXtreamUser} placeholder="Username" />
                  <Input value={xtreamPass} onValueChange={setXtreamPass} placeholder="Password" type="password" />
                </>
              )}
              {streamType === "m3u" && (
                <Textarea 
                  value={m3uPaste} 
                  onChange={(e) => setM3uPaste(e.target.value)} 
                  placeholder="#EXTINF:-1,Example\nhttps://..."
                  rows={6}
                />
              )}
              {hint && <p className="text-sm text-warning-strong">{hint}</p>}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
              Back
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={handleClose}>Cancel</Button>
          {step === 2 && (
            <Button variant="primary" onClick={submit} disabled={busy}>
              {busy ? "Saving..." : "Add"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
