"use client";

import {
  AlertCircle,
  Box,
  CheckCircle,
  Loader2,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  Square,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ZenedeGlass } from "@/components/glass/zenede-glass";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Protocol = "http" | "https" | "socks5";
type VpnType = "direct" | "gluetun";
type GluetunStatus = "stopped" | "starting" | "running" | "error";
type VpnProvider = "nordvpn" | "expressvpn" | "protonvpn" | "custom_openvpn" | "custom_wireguard";

type ProxyItem = {
  id: string;
  name: string;
  vpnType: VpnType;
  protocol: Protocol;
  host: string;
  port: number;
  username: string | null;
  vpnProvider: string | null;
  gluetunStatus: GluetunStatus;
  gluetunHostPort: number | null;
  channelCount: number;
};

type ChannelItem = {
  urlHash: string;
  url: string;
  label: string | null;
};

type TestResult = { ok: boolean; ip?: string; error?: string } | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit) {
  const res = await zendeFetch(path, init);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ── Provider presets for direct proxies ──────────────────────────────────────

type DirectProvider = "nordvpn" | "expressvpn" | "protonvpn" | "ghostvpn" | "custom";

type DirectProviderPreset = {
  label: string;
  protocol: Protocol;
  port: number;
  hostPlaceholder: string;
  hostHint: string;
  credentialHint: string;
  credentialUrl?: string;
  setupWarning?: string;
};

const DIRECT_PRESETS: Record<Exclude<DirectProvider, "custom">, DirectProviderPreset> = {
  nordvpn: {
    label: "NordVPN",
    protocol: "socks5",
    port: 1080,
    hostPlaceholder: "us1234.nordvpn.com",
    hostHint: "Pick any server at nordvpn.com → Servers → Advanced. One entry per country.",
    credentialHint: "Use NordVPN Service credentials — NOT your account password. Dashboard → Account → Manual setup → Credentials.",
    credentialUrl: "https://my.nordaccount.com/dashboard/nordvpn/manual-configuration/",
  },
  expressvpn: {
    label: "ExpressVPN",
    protocol: "socks5",
    port: 1080,
    hostPlaceholder: "uk-london-1.expresskeys.com",
    hostHint: "Server addresses: expressvpn.com → Account → Set Up Other Devices → Manual Config.",
    credentialHint: "Use the username and password from your ExpressVPN manual configuration page.",
    credentialUrl: "https://www.expressvpn.com/setup#manual",
  },
  protonvpn: {
    label: "ProtonVPN",
    protocol: "socks5",
    port: 1080,
    hostPlaceholder: "127.0.0.1",
    hostHint: "ProtonVPN has no remote SOCKS5 endpoint — see the setup note below.",
    credentialHint: "After running protonvpn-cli + microsocks on your server, enter 127.0.0.1 and your microsocks port.",
    setupWarning:
      "ProtonVPN uses OpenVPN/WireGuard with no native SOCKS5. " +
      "To use it directly: install protonvpn-cli, connect to a country, then run microsocks -p 1080 on that interface. " +
      "Or use the Gluetun container option — it handles OpenVPN automatically.",
  },
  ghostvpn: {
    label: "Ghost VPN",
    protocol: "socks5",
    port: 1080,
    hostPlaceholder: "proxy.ghostvpn.com",
    hostHint: "Check your GhostVPN / CactusVPN dashboard for the proxy server hostname.",
    credentialHint: "Use the proxy username and password from your GhostVPN dashboard.",
  },
};

// ── Gluetun provider config ───────────────────────────────────────────────────

type GluetunProviderMeta = {
  label: string;
  hint: string;
  credentialUrl?: string;
};

const GLUETUN_PROVIDERS: Record<VpnProvider, GluetunProviderMeta> = {
  nordvpn: {
    label: "NordVPN",
    hint: "Provide your NordVPN service credentials (not your account login). Dashboard → Account → Manual setup.",
    credentialUrl: "https://my.nordaccount.com/dashboard/nordvpn/manual-configuration/",
  },
  expressvpn: {
    label: "ExpressVPN",
    hint: "Find your activation code at expressvpn.com → Set Up Other Devices.",
    credentialUrl: "https://www.expressvpn.com/setup",
  },
  protonvpn: {
    label: "ProtonVPN",
    hint: "Use your OpenVPN/IKEv2 credentials from Account → Downloads → OpenVPN configuration. Add +b suffix to username for P2P/streaming.",
    credentialUrl: "https://account.proton.me/vpn/OpenVpnIKEv2",
  },
  custom_openvpn: {
    label: "Custom OpenVPN",
    hint: "Paste your .ovpn file contents below.",
  },
  custom_wireguard: {
    label: "Custom WireGuard",
    hint: "Enter your WireGuard peer configuration.",
  },
};

// ── Gluetun status badge ──────────────────────────────────────────────────────

function GluetunStatusBadge({ status }: { status: GluetunStatus }) {
  const map: Record<GluetunStatus, { label: string; className: string; icon: React.ReactNode }> = {
    stopped: { label: "Stopped", className: "bg-white/[0.06] text-white/40", icon: <Square className="h-3 w-3" /> },
    starting: { label: "Starting…", className: "bg-amber-500/15 text-amber-300/90", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    running: { label: "Running", className: "bg-emerald-500/15 text-emerald-300/90", icon: <CheckCircle className="h-3 w-3" /> },
    error: { label: "Error", className: "bg-red-500/15 text-red-300/90", icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { label, className, icon } = map[status] ?? map.stopped;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium", className)}>
      {icon}{label}
    </span>
  );
}

// ── Gluetun form fields ───────────────────────────────────────────────────────

// Directives that may reference external files in an .ovpn config
const OVPN_FILE_DIRECTIVES = ["ca", "cert", "key", "tls-auth", "tls-crypt", "tls-crypt-v2", "dh", "pkcs12", "secret"];

function parseOvpnExternalFiles(ovpn: string): string[] {
  const refs = new Set<string>();
  for (const line of ovpn.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const [directive, ...rest] = trimmed.split(/\s+/);
    if (!OVPN_FILE_DIRECTIVES.includes(directive ?? "")) continue;
    const value = rest[0];
    // Skip inline blocks and already-resolved absolute paths — only flag bare filenames
    if (!value || value === "[inline]" || value.startsWith("/")) continue;
    // Strip leading "./" so we store just the filename
    refs.add(value.replace(/^\.\//, ""));
  }
  return [...refs].sort();
}

type GluetunFormState = {
  vpnProvider: VpnProvider;
  countries: string;
  username: string;
  password: string;
  activationCode: string;
  ovpnConfig: string;
  ovpnExtraFiles: Record<string, string>;
  wgPrivateKey: string;
  wgAddresses: string;
  wgPeerPublicKey: string;
  wgPeerEndpoint: string;
  wgPeerPort: string;
};

const EMPTY_GLUETUN: GluetunFormState = {
  vpnProvider: "nordvpn",
  countries: "",
  username: "",
  password: "",
  activationCode: "",
  ovpnConfig: "",
  ovpnExtraFiles: {},
  wgPrivateKey: "",
  wgAddresses: "",
  wgPeerPublicKey: "",
  wgPeerEndpoint: "",
  wgPeerPort: "51820",
};

function gluetunFormToConfigJson(f: GluetunFormState): string {
  switch (f.vpnProvider) {
    case "nordvpn":
      return JSON.stringify({ provider: "nordvpn", username: f.username, password: f.password, countries: f.countries });
    case "expressvpn":
      return JSON.stringify({ provider: "expressvpn", activationCode: f.activationCode, countries: f.countries });
    case "protonvpn":
      return JSON.stringify({ provider: "protonvpn", username: f.username, password: f.password, countries: f.countries });
    case "custom_openvpn": {
      const extraFiles = Object.keys(f.ovpnExtraFiles).length > 0 ? f.ovpnExtraFiles : undefined;
      return JSON.stringify({ provider: "custom_openvpn", ovpnConfig: f.ovpnConfig, username: f.username || undefined, password: f.password || undefined, extraFiles });
    }
    case "custom_wireguard":
      return JSON.stringify({ provider: "custom_wireguard", privateKey: f.wgPrivateKey, addresses: f.wgAddresses, peerPublicKey: f.wgPeerPublicKey, peerEndpoint: f.wgPeerEndpoint, peerPort: parseInt(f.wgPeerPort, 10) });
  }
}

function isGluetunFormValid(f: GluetunFormState): boolean {
  switch (f.vpnProvider) {
    case "nordvpn":
    case "protonvpn":
      return !!f.username.trim() && !!f.password && !!f.countries.trim();
    case "expressvpn":
      return !!f.activationCode.trim() && !!f.countries.trim();
    case "custom_openvpn": {
      if (!f.ovpnConfig.trim()) return false;
      // All externally-referenced files must have content provided
      const needed = parseOvpnExternalFiles(f.ovpnConfig);
      return needed.every((name) => !!f.ovpnExtraFiles[name]?.trim());
    }
    case "custom_wireguard":
      return !!f.wgPrivateKey.trim() && !!f.wgAddresses.trim() && !!f.wgPeerPublicKey.trim() && !!f.wgPeerEndpoint.trim() && parseInt(f.wgPeerPort, 10) > 0;
  }
}

function FileDropTextarea({
  value,
  placeholder,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onChange: (content: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => onChange((e.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          className,
          dragging && "border-white/40 bg-white/[0.08] ring-2 ring-white/20",
        )}
      />
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl">
          <p className="rounded-lg bg-black/60 px-3 py-1.5 text-[13px] font-medium text-white/80 backdrop-blur-sm">
            Drop to load file
          </p>
        </div>
      )}
      {!value && !dragging && (
        <p className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-white/25 select-none">
          drag &amp; drop or paste
        </p>
      )}
    </div>
  );
}

function GluetunProviderFields({
  form,
  onChange,
  inputCls,
}: {
  form: GluetunFormState;
  onChange: (patch: Partial<GluetunFormState>) => void;
  inputCls: string;
}) {
  const set = (field: keyof GluetunFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ [field]: e.target.value });

  const countriesField = (
    <label className="sm:col-span-2">
      <span className="mb-1.5 block text-[13px] font-medium text-white/60">Countries</span>
      <input className={inputCls} placeholder="e.g. United Kingdom, France" value={form.countries} onChange={set("countries")} />
      <p className="mt-1 text-[12px] text-white/35">Comma-separated. Gluetun picks the best server in each country.</p>
    </label>
  );

  switch (form.vpnProvider) {
    case "nordvpn":
    case "protonvpn":
      return (
        <>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Username</span>
            <input className={inputCls} autoComplete="off" value={form.username} onChange={set("username")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Password</span>
            <input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </label>
          {countriesField}
        </>
      );
    case "expressvpn":
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Activation code</span>
            <input className={inputCls} autoComplete="off" value={form.activationCode} onChange={set("activationCode")} />
          </label>
          {countriesField}
        </>
      );
    case "custom_openvpn": {
      const externalFiles = parseOvpnExternalFiles(form.ovpnConfig);
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">OpenVPN config (.ovpn)</span>
            <FileDropTextarea
              value={form.ovpnConfig}
              placeholder="Paste your .ovpn file contents here…"
              className={cn(inputCls, "h-36 resize-y py-3 font-mono text-[13px] transition-colors")}
              onChange={(content) => onChange({ ovpnConfig: content })}
            />
          </label>

          {externalFiles.length > 0 && (
            <div className="sm:col-span-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3">
              <p className="text-[13px] font-semibold text-amber-200/80">External files detected</p>
              <p className="mt-0.5 text-[12px] text-amber-200/60">
                Your config references these files by name. Paste their contents below so they can be mounted inside the container.
              </p>
            </div>
          )}

          {externalFiles.map((filename) => (
            <label key={filename} className="sm:col-span-2">
              <span className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-white/60">
                <span className="font-mono text-white/80">{filename}</span>
                {!form.ovpnExtraFiles[filename]?.trim() && (
                  <span className="text-red-400/70 text-[11px]">required</span>
                )}
              </span>
              <FileDropTextarea
                value={form.ovpnExtraFiles[filename] ?? ""}
                placeholder={`Paste contents of ${filename} here…`}
                className={cn(inputCls, "h-28 resize-y py-3 font-mono text-[12px] transition-colors")}
                onChange={(content) =>
                  onChange({ ovpnExtraFiles: { ...form.ovpnExtraFiles, [filename]: content } })
                }
              />
            </label>
          ))}

          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Username <span className="text-white/35">(optional)</span></span>
            <input className={inputCls} autoComplete="off" value={form.username} onChange={set("username")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Password <span className="text-white/35">(optional)</span></span>
            <input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </label>
        </>
      );
    }
    case "custom_wireguard":
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Private key</span>
            <input className={cn(inputCls, "font-mono text-[13px]")} autoComplete="off" value={form.wgPrivateKey} onChange={set("wgPrivateKey")} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Addresses (CIDR)</span>
            <input className={inputCls} placeholder="10.0.0.2/32" value={form.wgAddresses} onChange={set("wgAddresses")} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Peer public key</span>
            <input className={cn(inputCls, "font-mono text-[13px]")} autoComplete="off" value={form.wgPeerPublicKey} onChange={set("wgPeerPublicKey")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Peer endpoint</span>
            <input className={inputCls} placeholder="vpn.example.com" value={form.wgPeerEndpoint} onChange={set("wgPeerEndpoint")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-white/60">Peer port</span>
            <input className={inputCls} type="number" min={1} max={65535} value={form.wgPeerPort} onChange={set("wgPeerPort")} />
          </label>
        </>
      );
  }
}

// ── Proxy Form (Add / Edit) ───────────────────────────────────────────────────

type DirectFormState = {
  name: string;
  protocol: Protocol;
  host: string;
  port: string;
  username: string;
  password: string;
};

const EMPTY_DIRECT: DirectFormState = { name: "", protocol: "socks5", host: "", port: "", username: "", password: "" };

function ProxyForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProxyItem;
  onSave: (item: ProxyItem) => void;
  onCancel: () => void;
}) {
  const [vpnType, setVpnType] = useState<VpnType>(initial?.vpnType ?? "direct");
  const [directProvider, setDirectProvider] = useState<DirectProvider>("custom");
  const [directForm, setDirectForm] = useState<DirectFormState>(
    initial && initial.vpnType === "direct"
      ? { name: initial.name, protocol: initial.protocol, host: initial.host, port: String(initial.port), username: initial.username ?? "", password: "" }
      : EMPTY_DIRECT,
  );
  const [gluetunForm, setGluetunForm] = useState<GluetunFormState>(
    initial?.vpnProvider
      ? { ...EMPTY_GLUETUN, vpnProvider: initial.vpnProvider as VpnProvider }
      : EMPTY_GLUETUN,
  );
  const [name, setName] = useState(initial?.name ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);

  const directPreset = directProvider !== "custom" ? DIRECT_PRESETS[directProvider] : null;

  const applyDirectPreset = useCallback((p: DirectProvider) => {
    setDirectProvider(p);
    if (p === "custom") return;
    const ps = DIRECT_PRESETS[p];
    setDirectForm((f) => ({ ...f, protocol: ps.protocol, port: String(ps.port), host: "" }));
    setTestResult(null);
  }, []);

  const setDirect = (field: keyof DirectFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDirectForm((f) => ({ ...f, [field]: e.target.value }));

  const portNum = parseInt(directForm.port, 10);
  const directValid = vpnType === "direct"
    ? (name.trim() && directForm.host.trim() && !isNaN(portNum) && portNum > 0 && portNum <= 65535)
    : false;
  const gluetunValid = vpnType === "gluetun"
    ? (name.trim() && isGluetunFormValid(gluetunForm))
    : false;
  const valid = directValid || gluetunValid;

  const inputCls = cn(
    "h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
    "text-[15px] text-white placeholder:text-white/30",
    "outline-none focus-visible:ring-2 focus-visible:ring-white/50",
  );

  const handleTest = useCallback(async () => {
    if (vpnType !== "direct" || !directValid) return;
    setTesting(true);
    setTestResult(null);
    const payload = { protocol: directForm.protocol, host: directForm.host.trim(), port: portNum, username: directForm.username.trim() || undefined, password: directForm.password || undefined };
    const url = initial ? `/api/proxies/${initial.id}/test` : "/api/proxies/test-config";
    const { ok, body } = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setTestResult(ok ? body : { ok: false, error: body?.error ?? "Request failed" });
    setTesting(false);
  }, [directForm, portNum, directValid, vpnType, initial]);

  const handleSubmit = useCallback(async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);

    let payload: Record<string, unknown>;
    if (vpnType === "direct") {
      payload = { name: name.trim(), vpnType: "direct", protocol: directForm.protocol, host: directForm.host.trim(), port: portNum };
      if (directForm.username.trim()) payload.username = directForm.username.trim();
      if (directForm.password) payload.password = directForm.password;
    } else {
      payload = {
        name: name.trim(),
        vpnType: "gluetun",
        vpnProvider: gluetunForm.vpnProvider,
        vpnConfigJson: gluetunFormToConfigJson(gluetunForm),
      };
    }

    const { ok, body } = initial
      ? await apiFetch(`/api/proxies/${initial.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await apiFetch("/api/proxies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    if (!ok) {
      setError(typeof body?.error === "string" ? body.error : "Save failed.");
      setBusy(false);
      return;
    }
    onSave({ ...body, channelCount: initial?.channelCount ?? 0 });
  }, [name, vpnType, directForm, gluetunForm, portNum, valid, initial, onSave]);

  const gluetunProviderMeta = GLUETUN_PROVIDERS[gluetunForm.vpnProvider];

  return (
    <div className="rounded-2xl border border-white/[0.12] bg-white/[0.05] p-6">
      <h3 className="text-[17px] font-semibold text-white">
        {initial ? "Edit proxy" : "Add VPN proxy"}
      </h3>

      {/* Name */}
      <div className="mt-5">
        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-white/60">Name <span className="text-red-400/70">*</span></span>
          <input className={inputCls} placeholder="e.g. NordVPN UK" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      {/* VPN type selector (only for new proxies) */}
      {!initial && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-medium text-white/60">Type</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setVpnType("direct")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                vpnType === "direct"
                  ? "border-white/25 bg-white/[0.1] text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/75",
              )}
            >
              <p className="text-[14px] font-semibold">Direct proxy</p>
              <p className="mt-0.5 text-[12px] text-white/50">SOCKS5 / HTTP — point at NordVPN, ExpressVPN, Ghost VPN, or any proxy server</p>
            </button>
            <button
              type="button"
              onClick={() => setVpnType("gluetun")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                vpnType === "gluetun"
                  ? "border-white/25 bg-white/[0.1] text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/75",
              )}
            >
              <p className="text-[14px] font-semibold flex items-center gap-2">
                <Box className="h-3.5 w-3.5" />
                Gluetun container
              </p>
              <p className="mt-0.5 text-[12px] text-white/50">Isolated Docker VPN container — supports OpenVPN, WireGuard, and all major providers</p>
            </button>
          </div>
        </div>
      )}

      {/* Direct proxy form */}
      {vpnType === "direct" && (
        <>
          {/* Provider picker (only for new proxies) */}
          {!initial && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-medium text-white/60">Provider</p>
              <div className="flex flex-wrap gap-2">
                {(["nordvpn", "expressvpn", "protonvpn", "ghostvpn", "custom"] as DirectProvider[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyDirectPreset(id)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-[14px] font-medium outline-none transition-colors",
                      directProvider === id
                        ? "border-white/30 bg-white/[0.12] text-white"
                        : "border-white/[0.1] bg-white/[0.04] text-white/50 hover:text-white/80",
                    )}
                  >
                    {id === "custom" ? "Other / custom" : (DIRECT_PRESETS[id as Exclude<DirectProvider, "custom">]?.label ?? id)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {directPreset?.setupWarning && (
            <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/[0.07] px-4 py-3">
              <p className="text-[13px] font-semibold text-blue-200/80">Setup required first</p>
              <p className="mt-1 text-[13px] leading-relaxed text-blue-200/65">{directPreset.setupWarning}</p>
            </div>
          )}

          {directPreset && (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3">
              <p className="text-[13px] leading-relaxed text-amber-200/80">{directPreset.credentialHint}</p>
              {directPreset.credentialUrl && (
                <a href={directPreset.credentialUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[13px] font-medium text-amber-300/90 underline-offset-2 hover:underline">
                  Open {directPreset.label} configuration page →
                </a>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-white/60">Protocol</span>
              <select value={directForm.protocol} onChange={setDirect("protocol")} className={cn(inputCls, "cursor-pointer")}>
                <option value="socks5">SOCKS5 (recommended)</option>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-white/60">Port</span>
              <input className={inputCls} placeholder={directPreset ? String(directPreset.port) : "1080"} type="number" min={1} max={65535} value={directForm.port} onChange={setDirect("port")} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-medium text-white/60">Host</span>
              <input className={inputCls} placeholder={directPreset?.hostPlaceholder ?? "proxy.myvpn.com"} value={directForm.host} onChange={setDirect("host")} />
              {directPreset?.hostHint && <p className="mt-1.5 text-[12px] leading-relaxed text-white/38">{directPreset.hostHint}</p>}
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-white/60">Username <span className="text-white/35">(optional)</span></span>
              <input className={inputCls} autoComplete="off" value={directForm.username} onChange={setDirect("username")} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-white/60">Password <span className="text-white/35">(optional)</span></span>
              <input className={inputCls} type="password" autoComplete="new-password" value={directForm.password} onChange={setDirect("password")} />
            </label>
          </div>
        </>
      )}

      {/* Gluetun form */}
      {vpnType === "gluetun" && (
        <>
          <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-500/[0.07] px-4 py-3">
            <p className="text-[13px] font-semibold text-blue-200/80">Docker required</p>
            <p className="mt-1 text-[13px] leading-relaxed text-blue-200/65">
              Docker must be installed and running on this server. Gluetun will launch an isolated container per VPN and expose an HTTP proxy locally — no OS-level VPN, no traffic leaks.
            </p>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[13px] font-medium text-white/60">VPN provider</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(GLUETUN_PROVIDERS) as [VpnProvider, GluetunProviderMeta][]).map(([id, meta]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGluetunForm((f) => ({ ...EMPTY_GLUETUN, vpnProvider: id, countries: f.countries }))}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-[14px] font-medium outline-none transition-colors",
                    gluetunForm.vpnProvider === id
                      ? "border-white/30 bg-white/[0.12] text-white"
                      : "border-white/[0.1] bg-white/[0.04] text-white/50 hover:text-white/80",
                  )}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          {gluetunProviderMeta && (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3">
              <p className="text-[13px] leading-relaxed text-amber-200/80">{gluetunProviderMeta.hint}</p>
              {gluetunProviderMeta.credentialUrl && (
                <a href={gluetunProviderMeta.credentialUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[13px] font-medium text-amber-300/90 underline-offset-2 hover:underline">
                  Open credential page →
                </a>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <GluetunProviderFields
              form={gluetunForm}
              onChange={(patch) => setGluetunForm((f) => ({ ...f, ...patch }))}
              inputCls={inputCls}
            />
          </div>
        </>
      )}

      {/* Test result (direct only) */}
      {testResult && vpnType === "direct" && (
        <div className={cn("mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px]", testResult.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300")}>
          {testResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {testResult.ok ? `Connected — exit IP: ${testResult.ip}` : `Connection failed: ${testResult.error}`}
        </div>
      )}

      {error && <p className="mt-3 text-[14px] text-red-300">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleSubmit} disabled={!valid || busy} className="outline-none disabled:opacity-40">
          <ZenedeGlass variant="ctaPill">
            <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {initial ? "Save changes" : vpnType === "gluetun" ? "Add VPN" : "Add proxy"}
            </span>
          </ZenedeGlass>
        </button>
        {vpnType === "direct" && (
          <button
            type="button"
            onClick={handleTest}
            disabled={!directValid || testing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-[14px] font-medium text-white/75 outline-none hover:bg-white/[0.08] disabled:opacity-40"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            Test connection
          </button>
        )}
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-2.5 text-[14px] font-medium text-white/55 outline-none hover:text-white/80">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Gluetun container control panel ──────────────────────────────────────────

function GluetunControlPanel({ proxy, onStatusChange }: { proxy: ProxyItem; onStatusChange: (id: string, status: GluetunStatus, hostPort: number | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollStatus = useCallback(async () => {
    const { ok, body } = await apiFetch(`/api/proxies/${proxy.id}/gluetun`);
    if (ok) {
      onStatusChange(proxy.id, body.status as GluetunStatus, body.hostPort ?? null);
      if (body.status === "running" || body.status === "error" || body.status === "stopped") {
        stopPolling();
      }
    }
  }, [proxy.id, onStatusChange, stopPolling]);

  // Poll every 3s while starting
  useEffect(() => {
    if (proxy.gluetunStatus === "starting") {
      stopPolling();
      pollRef.current = setInterval(() => void pollStatus(), 3000);
    }
    return stopPolling;
  }, [proxy.gluetunStatus, pollStatus, stopPolling]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proxies/${proxy.id}/gluetun`, { method: "POST" });
    if (!ok) {
      setError(body?.error ?? "Failed to start container.");
    } else {
      onStatusChange(proxy.id, "starting", null);
    }
    setBusy(false);
  }, [proxy.id, onStatusChange]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proxies/${proxy.id}/gluetun`, { method: "DELETE" });
    if (!ok) {
      setError(body?.error ?? "Failed to stop container.");
    } else {
      onStatusChange(proxy.id, "stopped", null);
    }
    setBusy(false);
  }, [proxy.id, onStatusChange]);

  const handleRefresh = useCallback(async () => {
    await pollStatus();
  }, [pollStatus]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {(proxy.gluetunStatus === "stopped" || proxy.gluetunStatus === "error") && (
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-[13px] font-medium text-emerald-300/90 outline-none hover:bg-emerald-500/15 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Launch
        </button>
      )}
      {(proxy.gluetunStatus === "running" || proxy.gluetunStatus === "starting") && (
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[13px] font-medium text-red-300/80 outline-none hover:bg-red-500/15 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
          Stop
        </button>
      )}
      <button
        type="button"
        onClick={() => void handleRefresh()}
        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/45 outline-none hover:text-white/70"
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </button>
      {proxy.gluetunStatus === "running" && proxy.gluetunHostPort && (
        <span className="font-mono text-[12px] text-white/35">→ :{ proxy.gluetunHostPort}</span>
      )}
      {error && <span className="text-[12px] text-red-300">{error}</span>}
    </div>
  );
}

// ── Channel Assignment Dialog ─────────────────────────────────────────────────

function ChannelAssignmentDialog({
  proxy,
  onClose,
  onCountChange,
}: {
  proxy: ProxyItem | null;
  onClose: () => void;
  onCountChange: (id: string, delta: number) => void;
}) {
  const dialogId = `channel-dialog-${proxy?.id ?? "none"}`;
  const [assigned, setAssigned] = useState<ChannelItem[]>([]);
  const [assignedTotal, setAssignedTotal] = useState(0);
  const [assignedBusy, setAssignedBusy] = useState(false);
  const [filterQ, setFilterQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<ChannelItem[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadAssigned = useCallback(async (id: string) => {
    setAssignedBusy(true);
    const { ok, body } = await apiFetch(`/api/proxies/${id}/channels?take=500`);
    if (ok) { setAssigned(body.rows ?? []); setAssignedTotal(body.total ?? 0); }
    setAssignedBusy(false);
  }, []);

  useEffect(() => {
    if (!proxy) return;
    setAssigned([]);
    setAssignedTotal(0);
    setFilterQ("");
    setSearchQ("");
    setSearchResults([]);
    void loadAssigned(proxy.id);
    queueMicrotask(() => searchInputRef.current?.focus());
  }, [proxy, loadAssigned]);

  useEffect(() => {
    if (!proxy) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proxy, onClose]);

  const doSearch = useCallback((q: string, proxyId: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchBusy(true);
    apiFetch(`/api/channels/search?q=${encodeURIComponent(q)}&excludeProxy=${proxyId}&take=50`)
      .then(({ ok, body }) => { if (ok) setSearchResults(body as ChannelItem[]); })
      .finally(() => setSearchBusy(false));
  }, []);

  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQ(q);
    if (!proxy) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q, proxy.id), 300);
  }, [doSearch, proxy]);

  const handleAdd = useCallback(async (ch: ChannelItem) => {
    if (!proxy) return;
    const { ok } = await apiFetch(`/api/proxies/${proxy.id}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urlHashes: [ch.urlHash] }),
    });
    if (ok) {
      setSearchResults((r) => r.filter((x) => x.urlHash !== ch.urlHash));
      setAssigned((a) => [ch, ...a]);
      setAssignedTotal((n) => n + 1);
      onCountChange(proxy.id, 1);
    }
  }, [proxy, onCountChange]);

  const handleRemove = useCallback(async (ch: ChannelItem) => {
    if (!proxy) return;
    const { ok } = await apiFetch(`/api/proxies/${proxy.id}/channels/${ch.urlHash}`, { method: "DELETE" });
    if (ok) {
      setAssigned((a) => a.filter((x) => x.urlHash !== ch.urlHash));
      setAssignedTotal((n) => Math.max(0, n - 1));
      onCountChange(proxy.id, -1);
    }
  }, [proxy, onCountChange]);

  if (!proxy) return null;

  const routeDescription = proxy.vpnType === "gluetun"
    ? `${GLUETUN_PROVIDERS[proxy.vpnProvider as VpnProvider]?.label ?? proxy.vpnProvider} (Gluetun)`
    : `${proxy.protocol}://${proxy.host}:${proxy.port}`;

  const filteredAssigned = filterQ.trim()
    ? assigned.filter((ch) => (ch.label ?? ch.url).toLowerCase().includes(filterQ.toLowerCase()))
    : assigned;

  const inputCls = cn(
    "h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4",
    "text-[15px] text-white placeholder:text-white/30",
    "outline-none focus-visible:ring-2 focus-visible:ring-white/50",
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 sm:px-6"
      role="presentation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/65 backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogId}
        className="relative z-10 flex w-full max-w-2xl flex-col max-h-[92vh] motion-safe:animate-[glass-modal-pop_0.38s_cubic-bezier(0.16,1,0.3,1)_both]"
      >
        <ZenedeGlass variant="panel" className="flex flex-col overflow-hidden shadow-[0_40px_120px_-48px_rgba(0,0,0,0.95)]">

          {/* Header */}
          <div className="shrink-0 flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
            <div className="min-w-0">
              <p id={dialogId} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/40">
                VPN channel routing
              </p>
              <p className="mt-1 text-[18px] font-semibold text-white truncate">{proxy.name}</p>
              <p className="mt-0.5 text-[13px] text-white/45 font-mono truncate">{routeDescription}</p>
              {proxy.vpnType === "gluetun" && proxy.gluetunStatus !== "running" && (
                <p className="mt-1.5 text-[12px] text-amber-300/70">
                  Container is {proxy.gluetunStatus} — launch it before watching these channels.
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-white/40 hover:text-white/80 outline-none transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body — two columns on wide, stacked on narrow */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-white/[0.06]">

              {/* Left — add channels via search */}
              <div className="px-6 py-5">
                <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/40">Add channels</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <input
                    ref={searchInputRef}
                    value={searchQ}
                    onChange={handleSearchInput}
                    placeholder="Search channels to add…"
                    className={cn(inputCls, "pl-10")}
                  />
                </div>

                <div className="mt-3 min-h-[120px]">
                  {!searchQ.trim() && (
                    <p className="text-center text-[13px] text-white/30 pt-8">Type to search all channels</p>
                  )}
                  {searchBusy && (
                    <div className="flex items-center justify-center gap-2 pt-8 text-[13px] text-white/40">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching…
                    </div>
                  )}
                  {!searchBusy && searchQ.trim() && searchResults.length === 0 && (
                    <p className="text-center text-[13px] text-white/35 pt-8">No unassigned channels matching "{searchQ}"</p>
                  )}
                  {searchResults.length > 0 && (
                    <ul className="space-y-1 max-h-[320px] overflow-y-auto">
                      {searchResults.map((ch) => (
                        <li key={ch.urlHash} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors">
                          <span className="min-w-0 flex-1 truncate text-[14px] text-white/80">{ch.label ?? ch.url}</span>
                          <button
                            type="button"
                            onClick={() => void handleAdd(ch)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-300/90 outline-none hover:bg-emerald-500/15 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right — assigned channels with filter */}
              <div className="px-6 py-5 border-t border-white/[0.06] sm:border-t-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/40">
                    Assigned
                    {assignedTotal > 0 && (
                      <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-bold text-white/55 normal-case tracking-normal">
                        {assignedTotal}
                      </span>
                    )}
                  </p>
                </div>

                {/* Filter assigned */}
                {assigned.length > 4 && (
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                    <input
                      value={filterQ}
                      onChange={(e) => setFilterQ(e.target.value)}
                      placeholder="Filter assigned…"
                      className={cn(inputCls, "h-9 pl-9 text-[14px]")}
                    />
                  </div>
                )}

                <div className="min-h-[120px]">
                  {assignedBusy ? (
                    <div className="flex items-center justify-center gap-2 pt-8 text-[13px] text-white/40">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </div>
                  ) : assigned.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-8 text-center">
                      <Shield className="mx-auto mb-2 h-6 w-6 text-white/20" />
                      <p className="text-[13px] text-white/35">No channels assigned yet</p>
                      <p className="mt-1 text-[12px] text-white/25">Search on the left to route channels through this VPN</p>
                    </div>
                  ) : filteredAssigned.length === 0 ? (
                    <p className="text-center text-[13px] text-white/35 pt-8">No channels match "{filterQ}"</p>
                  ) : (
                    <ul className="space-y-1 max-h-[320px] overflow-y-auto">
                      {filteredAssigned.map((ch) => (
                        <li key={ch.urlHash} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/60" />
                            <span className="truncate text-[14px] text-white/80">{ch.label ?? ch.url}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRemove(ch)}
                            className="shrink-0 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[12px] font-medium text-red-300/75 outline-none hover:bg-red-500/15 transition-colors"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-white/[0.07] px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-[13px] text-white/35">
              Changes apply immediately — no save needed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/[0.12] bg-white/[0.06] px-5 py-2 text-[14px] font-medium text-white/70 outline-none hover:bg-white/[0.1] transition-colors"
            >
              Done
            </button>
          </div>
        </ZenedeGlass>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TvSettingsProxiesPanel() {
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProxyItem | null>(null);
  const [managingProxy, setManagingProxy] = useState<ProxyItem | null>(null);

  const loadProxies = useCallback(async () => {
    setLoading(true);
    const { ok, body } = await apiFetch("/api/proxies");
    if (ok) setProxies(body as ProxyItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadProxies(); }, [loadProxies]);

  const openCreate = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  const openEdit = useCallback((p: ProxyItem) => { setEditing(p); setFormOpen(true); }, []);
  const closeForm = useCallback(() => { setFormOpen(false); setEditing(null); }, []);

  const onSaved = useCallback((item: ProxyItem) => {
    setProxies((prev) => {
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = item; return next; }
      return [...prev, item];
    });
    setFormOpen(false);
    setEditing(null);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this proxy? All channel assignments will be removed.")) return;
    const { ok } = await apiFetch(`/api/proxies/${id}`, { method: "DELETE" });
    if (ok) {
      setProxies((prev) => prev.filter((p) => p.id !== id));
      if (managingProxy?.id === id) setManagingProxy(null);
    }
  }, [managingProxy]);

  const handleCountChange = useCallback((proxyId: string, delta: number) => {
    setProxies((prev) => prev.map((p) => p.id === proxyId ? { ...p, channelCount: Math.max(0, p.channelCount + delta) } : p));
  }, []);

  const handleGluetunStatusChange = useCallback((proxyId: string, status: GluetunStatus, hostPort: number | null) => {
    setProxies((prev) => prev.map((p) => p.id === proxyId ? { ...p, gluetunStatus: status, gluetunHostPort: hostPort } : p));
    setManagingProxy((m) => m?.id === proxyId ? { ...m, gluetunStatus: status, gluetunHostPort: hostPort } : m);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header section */}
      <section className="rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-white">VPN Proxies</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/50">
              Route specific channels through dedicated VPNs — UK channels via a UK proxy, US channels via a US proxy,
              simultaneously. Two modes: connect to a provider's SOCKS5 endpoint directly, or let Gluetun
              manage an isolated Docker VPN container per proxy.
            </p>
          </div>
          <button type="button" onClick={openCreate} className="shrink-0 outline-none">
            <ZenedeGlass variant="ctaPill">
              <span className="flex items-center gap-2 px-5 py-2.5 text-[15px] font-semibold text-zinc-950">
                <Plus className="h-4 w-4" />
                Add proxy
              </span>
            </ZenedeGlass>
          </button>
        </div>

        {formOpen && (
          <div className="mt-6">
            <ProxyForm initial={editing ?? undefined} onSave={onSaved} onCancel={closeForm} />
          </div>
        )}

        {loading ? (
          <p className="mt-8 text-[14px] text-white/40">Loading…</p>
        ) : proxies.length === 0 && !formOpen ? (
          <p className="mt-8 rounded-xl border border-dashed border-white/[0.12] bg-black/20 px-5 py-8 text-center text-[14px] text-white/40">
            No proxies yet — add one above to start routing channels.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {proxies.map((proxy) => (
              <li
                key={proxy.id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.1] bg-black/30 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {proxy.vpnType === "gluetun" && <Box className="h-4 w-4 shrink-0 text-white/50" />}
                    <p className="font-medium text-white">{proxy.name}</p>
                    {proxy.vpnType === "gluetun" ? (
                      <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[12px] text-white/55">
                        {GLUETUN_PROVIDERS[proxy.vpnProvider as VpnProvider]?.label ?? proxy.vpnProvider}
                      </span>
                    ) : (
                      <span className="rounded-md bg-white/[0.07] px-2 py-0.5 font-mono text-[12px] text-white/55">
                        {proxy.protocol}://{proxy.host}:{proxy.port}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13px] text-white/40">
                    {proxy.vpnType === "direct" && proxy.username && (
                      <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{proxy.username}</span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", proxy.channelCount > 0 ? "bg-emerald-500/15 text-emerald-300/90" : "bg-white/[0.06] text-white/35")}>
                      {proxy.channelCount} {proxy.channelCount === 1 ? "channel" : "channels"}
                    </span>
                    {proxy.vpnType === "gluetun" && (
                      <GluetunStatusBadge status={proxy.gluetunStatus} />
                    )}
                  </div>
                  {proxy.vpnType === "gluetun" && (
                    <GluetunControlPanel proxy={proxy} onStatusChange={handleGluetunStatusChange} />
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setManagingProxy(proxy)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/75 outline-none hover:bg-white/[0.1]"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Channels
                    {proxy.channelCount > 0 && (
                      <span className="rounded-full bg-white/[0.1] px-1.5 py-0.5 text-[11px] font-bold text-white/60">
                        {proxy.channelCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(proxy)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/75 outline-none hover:bg-white/[0.1]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(proxy.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-200/90 outline-none hover:bg-red-500/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ChannelAssignmentDialog
        proxy={managingProxy}
        onClose={() => setManagingProxy(null)}
        onCountChange={handleCountChange}
      />

      {/* Info footer */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-5 space-y-5">
        <div>
          <h3 className="text-[15px] font-semibold text-white/70">Direct proxy vs Gluetun container</h3>
          <ul className="mt-3 space-y-2.5 text-[14px] leading-relaxed text-white/45">
            <li>
              <span className="font-medium text-white/65">Direct proxy</span> — connect to a remote SOCKS5 or HTTP proxy endpoint provided by your VPN service.
              NordVPN, ExpressVPN, and Ghost VPN expose SOCKS5 on their servers; just enter the hostname and service credentials.
            </li>
            <li>
              <span className="font-medium text-white/65">Gluetun container</span> — Docker launches an isolated{" "}
              <a href="https://github.com/qdm12/gluetun" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white/80 underline">Gluetun</a>{" "}
              container per proxy. It connects to the VPN internally and exposes a local HTTP proxy that Zenede routes through.
              Supports NordVPN, ExpressVPN, ProtonVPN, custom OpenVPN, and WireGuard.
              Run multiple containers for different countries simultaneously.
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white/70">Zero-leak guarantee</h3>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-white/45">
            <li>• Every request in a proxied session — master playlist, variant playlists, <span className="font-mono text-white/60">.ts</span> segments, AES keys — goes through the proxy.</li>
            <li>• No fallback to direct. If the proxy or container is unreachable, the stream fails rather than leaking your real IP.</li>
            <li>• Gluetun containers are completely isolated — each runs its own VPN tunnel with no effect on other channels or system traffic.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
