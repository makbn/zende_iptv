"use client";

import { Textarea } from "@appica/ui-react/textarea";

import { Input } from "@appica/ui-react/input";

import { Button } from "@appica/ui-react/button";

import { useEffect, useId, useState } from "react";

import { Card } from "@appica/ui-react/card";
import type { IntegrationKind, StoredIntegration } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

const STEPS = 3;

export const INTEGRATION_KIND_LABEL: Record<IntegrationKind, string> = {
  plex: "Plex",
  jellyfin: "Jellyfin",
  emby: "Emby",
  generic_standards: "Generic — IPTV standards",
  other: "Other application",
};

const KIND_ORDER: IntegrationKind[] = [
  "plex",
  "jellyfin",
  "emby",
  "generic_standards",
  "other",
];

type WizardProps = {
  open: boolean;
  onClose: () => void;
  editing: StoredIntegration | null;
  onSave: (entry: StoredIntegration) => void;
};

export function TvIntegrationWizardModal({
  open,
  onClose,
  editing,
  onSave,
}: WizardProps) {
  const titleId = useId();
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<IntegrationKind>("jellyfin");
  const [name, setName] = useState("");
  const [serverBaseUrl, setServerBaseUrl] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [xmltvUrl, setXmltvUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      if (editing) {
        setStep(2);
        setKind(editing.kind);
        setName(editing.name);
        setServerBaseUrl(editing.serverBaseUrl ?? "");
        setPlaylistUrl(editing.playlistUrl ?? "");
        setXmltvUrl(editing.xmltvUrl ?? "");
        setNotes(editing.notes ?? "");
      } else {
        setStep(1);
        setKind("jellyfin");
        setName("");
        setServerBaseUrl("");
        setPlaylistUrl("");
        setXmltvUrl("");
        setNotes("");
      }
    });
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isEdit = Boolean(editing);
  const canNextFrom2 = name.trim().length >= 2;

  function buildEntry(): StoredIntegration {
    const now = Date.now();
    const base = {
      kind,
      name: name.trim(),
      ...(serverBaseUrl.trim() ? { serverBaseUrl: serverBaseUrl.trim() } : {}),
      ...(playlistUrl.trim() ? { playlistUrl: playlistUrl.trim() } : {}),
      ...(xmltvUrl.trim() ? { xmltvUrl: xmltvUrl.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    if (editing) {
      return {
        ...editing,
        ...base,
        updatedAt: now,
      };
    }
    return {
      id: crypto.randomUUID(),
      ...base,
      createdAt: now,
      updatedAt: now,
    };
  }

  function submit() {
    onSave(buildEntry());
    onClose();
  }

  const serverLabel =
    kind === "plex"
      ? "Plex server URL"
      : kind === "jellyfin"
        ? "Jellyfin server URL"
        : kind === "emby"
          ? "Emby server URL"
          : kind === "generic_standards"
            ? "Optional base URL (tooling / proxy)"
            : "Optional service URL";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[min(10vh,96px)] pb-10 sm:px-6"
      role="presentation"
    >
      <Button variant="ghost"
        type="button"
        aria-label="Dismiss"
        className={cn(
          "absolute inset-0 bg-background backdrop-blur-md",
          "motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]",
        )}
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(92vh,880px)] w-full max-w-[540px] flex-col outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="motion-safe:animate-[glass-modal-pop_0.42s_cubic-bezier(0.16,1,0.3,1)_both]">
          <Card
            frame="glass"
            className="flex max-h-[min(92vh,880px)] flex-col overflow-hidden shadow-lg"
          >
            <div className="shrink-0 border-b border-border px-5 pb-3 pt-5">
              <p
                id={titleId}
                className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground-intense"
              >
                {isEdit ? "Edit integration" : "New integration"}
              </p>
              <p className="mt-1 text-[15px] text-foreground-intense">
                Step {step} of {STEPS} — save a reference for how Zende fits next to your
                media stack.
              </p>
              <div
                className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-background-muted"
                role="progressbar"
                aria-valuenow={step}
                aria-valuemin={1}
                aria-valuemax={STEPS}
              >
                <div
                  className="h-full rounded-full bg-background-muted transition-[width] duration-300"
                  style={{ width: `${(step / STEPS) * 100}%` }}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {step === 1 ? (
                <div className="space-y-3">
                  <p className="text-[14px] leading-relaxed text-foreground-intense">
                    Choose what you are wiring alongside Zende. You can add several entries
                    (for example one Plex household and one Jellyfin test server).
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {KIND_ORDER.map((k) => (
                      <Button variant="ghost"
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left text-[14px] font-medium outline-none transition-colors",
                          kind === k
                            ? "border-border bg-background-muted text-foreground-intense"
                            : "border-border bg-background text-foreground-intense hover:border-border hover:text-foreground-intense",
                        )}
                      >
                        {INTEGRATION_KIND_LABEL[k]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-[13px] text-foreground-intense">Display name</span>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Living room Plex"
                      className={cn(
                        "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3",
                        "text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border",
                      )}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] text-foreground-intense">{serverLabel}</span>
                    <Input
                      value={serverBaseUrl}
                      onChange={(e) => setServerBaseUrl(e.target.value)}
                      placeholder="https://…"
                      autoComplete="off"
                      className={cn(
                        "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3",
                        "text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border",
                      )}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] text-foreground-intense">
                      Playlist URL (M3U / hosted list)
                    </span>
                    <Input
                      value={playlistUrl}
                      onChange={(e) => setPlaylistUrl(e.target.value)}
                      placeholder="Optional — paste if you already have a stable URL"
                      autoComplete="off"
                      className={cn(
                        "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3",
                        "text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border",
                      )}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] text-foreground-intense">EPG / XMLTV URL</span>
                    <Input
                      value={xmltvUrl}
                      onChange={(e) => setXmltvUrl(e.target.value)}
                      placeholder="Optional XMLTV address for guide data"
                      autoComplete="off"
                      className={cn(
                        "mt-1 h-11 w-full rounded-xl border border-border bg-background px-3",
                        "text-[15px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border",
                      )}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] text-foreground-intense">Notes</span>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="API keys stay on your server — jot reminders here only."
                      className={cn(
                        "mt-1 w-full resize-y rounded-xl border border-border bg-background px-3 py-2",
                        "text-[14px] text-foreground-intense outline-none placeholder:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border",
                      )}
                    />
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-3 text-[14px] leading-relaxed text-foreground-intense">
                  <p>
                    <span className="text-foreground-intense">Type · </span>
                    {INTEGRATION_KIND_LABEL[kind]}
                  </p>
                  <p>
                    <span className="text-foreground-intense">Name · </span>
                    {name.trim()}
                  </p>
                  {serverBaseUrl.trim() ? (
                    <p className="break-all">
                      <span className="text-foreground-intense">Server · </span>
                      {serverBaseUrl.trim()}
                    </p>
                  ) : null}
                  {playlistUrl.trim() ? (
                    <p className="break-all">
                      <span className="text-foreground-intense">Playlist · </span>
                      {playlistUrl.trim()}
                    </p>
                  ) : null}
                  {xmltvUrl.trim() ? (
                    <p className="break-all">
                      <span className="text-foreground-intense">XMLTV · </span>
                      {xmltvUrl.trim()}
                    </p>
                  ) : null}
                  {notes.trim() ? (
                    <p>
                      <span className="text-foreground-intense">Notes · </span>
                      {notes.trim()}
                    </p>
                  ) : null}
                  <p className="border-t border-border pt-3 text-[13px] text-foreground-intense">
                    Saved only in this browser (local storage). Zende does not call these
                    URLs automatically yet — this record keeps your plan in one place.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
              <Button variant="ghost"
                type="button"
                onClick={() => (step > 1 ? setStep((s) => s - 1) : onClose())}
                className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-foreground-intense outline-none hover:text-foreground-intense focus-visible:ring-2 focus-visible:ring-border"
              >
                {step === 1 ? "Cancel" : "Back"}
              </Button>
              <div className="flex gap-2">
                {step < STEPS ? (
                  <Button variant="ghost"
                    type="button"
                    disabled={step === 2 && !canNextFrom2}
                    onClick={() => setStep((s) => Math.min(STEPS, s + 1))}
                    className="outline-none disabled:opacity-40"
                  >
                    <Card frame="solid">
                      <span className="flex px-5 py-2.5 text-[14px] font-semibold text-foreground-inverse">
                        Continue
                      </span>
                    </Card>
                  </Button>
                ) : (
                  <Button variant="ghost" type="button" onClick={() => submit()} className="outline-none">
                    <Card frame="solid">
                      <span className="flex px-5 py-2.5 text-[14px] font-semibold text-foreground-inverse">
                        Save integration
                      </span>
                    </Card>
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
