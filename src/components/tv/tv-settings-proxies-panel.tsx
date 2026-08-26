"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@appica/ui-react/select";

import { Textarea } from "@appica/ui-react/textarea";

import { Input } from "@appica/ui-react/input";

import { Button } from "@appica/ui-react/button";

import {
  AlertCircle,
  Box,
  CheckCircle,
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
import { ZendeSpinner } from "@/components/loading/zende-spinner";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@appica/ui-react/card";
import { useAuth } from "@/features/auth/auth-context";
import { zendeFetch } from "@/lib/auth/zende-fetch";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type Protocol = "http" | "https" | "socks5";
type VpnType = "direct" | "gluetun" | "smartdns";
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
  vpnConfigJson?: string | null;
  gluetunStatus: GluetunStatus;
  gluetunHostPort: number | null;
  channelCount: number;
  createdByUserId: string | null;
};

type ChannelItem = {
  urlHash: string;
  url: string;
  label: string | null;
};

type TestResult = { ok: boolean; ip?: string; resolvedHost?: string; resolvedIp?: string; error?: string } | null;

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
    stopped: { label: "Stopped", className: "bg-background-muted text-foreground-intense", icon: <Square className="h-3 w-3" /> },
    starting: { label: "Starting…", className: "bg-warning-subtle text-warning-strong", icon: <ZendeSpinner size="tiny" label="Starting proxy" /> },
    running: { label: "Running", className: "bg-success-subtle text-success-strong", icon: <CheckCircle className="h-3 w-3" /> },
    error: { label: "Error", className: "bg-error-subtle text-error-strong", icon: <AlertCircle className="h-3 w-3" /> },
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

function configJsonToGluetunForm(vpnProvider: VpnProvider, json: string | null | undefined): GluetunFormState {
  if (!json) return { ...EMPTY_GLUETUN, vpnProvider };
  try {
    const cfg = JSON.parse(json) as Record<string, unknown>;
    switch (vpnProvider) {
      case "nordvpn":
      case "protonvpn":
        return { ...EMPTY_GLUETUN, vpnProvider, username: String(cfg.username ?? ""), password: String(cfg.password ?? ""), countries: String(cfg.countries ?? "") };
      case "expressvpn":
        return { ...EMPTY_GLUETUN, vpnProvider, activationCode: String(cfg.activationCode ?? ""), countries: String(cfg.countries ?? "") };
      case "custom_openvpn":
        return { ...EMPTY_GLUETUN, vpnProvider, ovpnConfig: String(cfg.ovpnConfig ?? ""), username: String(cfg.username ?? ""), password: String(cfg.password ?? ""), ovpnExtraFiles: (cfg.extraFiles as Record<string, string>) ?? {} };
      case "custom_wireguard":
        return { ...EMPTY_GLUETUN, vpnProvider, wgPrivateKey: String(cfg.privateKey ?? ""), wgAddresses: String(cfg.addresses ?? ""), wgPeerPublicKey: String(cfg.peerPublicKey ?? ""), wgPeerEndpoint: String(cfg.peerEndpoint ?? ""), wgPeerPort: String(cfg.peerPort ?? 51820) };
    }
  } catch {}
  return { ...EMPTY_GLUETUN, vpnProvider };
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
      <Textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          className,
          dragging && "border-border bg-background-muted ring-2 ring-border",
        )}
      />
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl">
          <p className="rounded-lg bg-background px-3 py-1.5 text-[13px] font-medium text-foreground-intense backdrop-blur-sm">
            Drop to load file
          </p>
        </div>
      )}
      {!value && !dragging && (
        <p className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-foreground-intense select-none">
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
      <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Countries</span>
      <Input className={inputCls} placeholder="e.g. United Kingdom, France" value={form.countries} onChange={set("countries")} />
      <p className="mt-1 text-[12px] text-foreground-intense">Comma-separated. Gluetun picks the best server in each country.</p>
    </label>
  );

  switch (form.vpnProvider) {
    case "nordvpn":
    case "protonvpn":
      return (
        <>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Username</span>
            <Input className={inputCls} autoComplete="off" value={form.username} onChange={set("username")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Password</span>
            <Input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </label>
          {countriesField}
        </>
      );
    case "expressvpn":
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Activation code</span>
            <Input className={inputCls} autoComplete="off" value={form.activationCode} onChange={set("activationCode")} />
          </label>
          {countriesField}
        </>
      );
    case "custom_openvpn": {
      const externalFiles = parseOvpnExternalFiles(form.ovpnConfig);
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">OpenVPN config (.ovpn)</span>
            <FileDropTextarea
              value={form.ovpnConfig}
              placeholder="Paste your .ovpn file contents here…"
              className={cn(inputCls, "h-36 resize-y py-3 font-mono text-[13px] transition-colors")}
              onChange={(content) => onChange({ ovpnConfig: content })}
            />
          </label>

          {externalFiles.length > 0 && (
            <div className="sm:col-span-2 rounded-xl border border-warning bg-warning-subtle px-4 py-3">
              <p className="text-[13px] font-semibold text-warning-strong">External files detected</p>
              <p className="mt-0.5 text-[12px] text-warning-strong">
                Your config references these files by name. Paste their contents below so they can be mounted inside the container.
              </p>
            </div>
          )}

          {externalFiles.map((filename) => (
            <label key={filename} className="sm:col-span-2">
              <span className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-foreground-intense">
                <span className="font-mono text-foreground-intense">{filename}</span>
                {!form.ovpnExtraFiles[filename]?.trim() && (
                  <span className="text-error-strong text-[11px]">required</span>
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
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Username <span className="text-foreground-intense">(optional)</span></span>
            <Input className={inputCls} autoComplete="off" value={form.username} onChange={set("username")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Password <span className="text-foreground-intense">(optional)</span></span>
            <Input className={inputCls} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          </label>
        </>
      );
    }
    case "custom_wireguard":
      return (
        <>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Private key</span>
            <Input className={cn(inputCls, "font-mono text-[13px]")} autoComplete="off" value={form.wgPrivateKey} onChange={set("wgPrivateKey")} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Addresses (CIDR)</span>
            <Input className={inputCls} placeholder="10.0.0.2/32" value={form.wgAddresses} onChange={set("wgAddresses")} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Peer public key</span>
            <Input className={cn(inputCls, "font-mono text-[13px]")} autoComplete="off" value={form.wgPeerPublicKey} onChange={set("wgPeerPublicKey")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Peer endpoint</span>
            <Input className={inputCls} placeholder="vpn.example.com" value={form.wgPeerEndpoint} onChange={set("wgPeerEndpoint")} />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Peer port</span>
            <Input className={inputCls} type="number" min={1} max={65535} value={form.wgPeerPort} onChange={set("wgPeerPort")} />
          </label>
        </>
      );
  }
}

// ── Smart DNS form ────────────────────────────────────────────────────────────

type SmartDnsFormState = {
  dnsServer: string;
  dnsServer2: string;
};

const EMPTY_SMART_DNS: SmartDnsFormState = { dnsServer: "", dnsServer2: "" };

type SmartDnsProvider = {
  label: string;
  hint: string;
  url: string;
};

const SMART_DNS_PROVIDERS: SmartDnsProvider[] = [
  { label: "SmartDNSProxy", hint: "Log in → Dashboard → DNS Servers to get your assigned IPs.", url: "https://www.smartdnsproxy.com" },
  { label: "Unlocator", hint: "Log in → Setup → DNS Addresses.", url: "https://unlocator.com" },
  { label: "OverPlay", hint: "Log in → My Account → DNS Addresses.", url: "https://www.overplay.net" },
  { label: "ProxyDNS", hint: "Log in → Account → DNS IPs.", url: "https://www.proxydns.com" },
];

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
      ? configJsonToGluetunForm(initial.vpnProvider as VpnProvider, initial.vpnConfigJson)
      : EMPTY_GLUETUN,
  );
  const [smartDnsForm, setSmartDnsForm] = useState<SmartDnsFormState>(() => {
    if (initial?.vpnType === "smartdns" && initial.vpnConfigJson) {
      try {
        const cfg = JSON.parse(initial.vpnConfigJson) as { dnsServer?: string; dnsServer2?: string };
        return { dnsServer: cfg.dnsServer ?? "", dnsServer2: cfg.dnsServer2 ?? "" };
      } catch { /* fall through */ }
    }
    return EMPTY_SMART_DNS;
  });
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
  const smartDnsValid = vpnType === "smartdns"
    ? (name.trim() && /^\d{1,3}(\.\d{1,3}){3}$/.test(smartDnsForm.dnsServer.trim()))
    : false;
  const valid = directValid || gluetunValid || smartDnsValid;

  const inputCls = cn(
    "h-11 w-full rounded-xl border border-border bg-background px-4",
    "text-[15px] text-foreground-intense placeholder:text-foreground-intense",
    "outline-none focus-visible:ring-2 focus-visible:ring-border",
  );

  const handleTest = useCallback(async () => {
    if (vpnType !== "direct" && vpnType !== "smartdns") return;
    if (vpnType === "direct" && !directValid) return;
    if (vpnType === "smartdns" && !smartDnsValid) return;
    setTesting(true);
    setTestResult(null);
    let payload: Record<string, unknown>;
    if (vpnType === "smartdns") {
      payload = { vpnType: "smartdns", dnsServer: smartDnsForm.dnsServer.trim(), ...(smartDnsForm.dnsServer2.trim() ? { dnsServer2: smartDnsForm.dnsServer2.trim() } : {}) };
    } else {
      payload = { protocol: directForm.protocol, host: directForm.host.trim(), port: portNum, username: directForm.username.trim() || undefined, password: directForm.password || undefined };
    }
    const url = initial ? `/api/proxies/${initial.id}/test` : "/api/proxies/test-config";
    const { ok, body } = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setTestResult(ok ? body : { ok: false, error: body?.error ?? "Request failed" });
    setTesting(false);
  }, [directForm, smartDnsForm, portNum, directValid, smartDnsValid, vpnType, initial]);

  const handleSubmit = useCallback(async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);

    let payload: Record<string, unknown>;
    if (vpnType === "direct") {
      payload = { name: name.trim(), vpnType: "direct", protocol: directForm.protocol, host: directForm.host.trim(), port: portNum };
      if (directForm.username.trim()) payload.username = directForm.username.trim();
      if (directForm.password) payload.password = directForm.password;
    } else if (vpnType === "smartdns") {
      payload = { name: name.trim(), vpnType: "smartdns", dnsServer: smartDnsForm.dnsServer.trim() };
      if (smartDnsForm.dnsServer2.trim()) payload.dnsServer2 = smartDnsForm.dnsServer2.trim();
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
    <div className="rounded-2xl border border-border bg-background-muted p-6">
      <h3 className="text-[17px] font-semibold text-foreground-intense">
        {initial ? "Edit proxy" : vpnType === "smartdns" ? "Add Smart DNS" : vpnType === "gluetun" ? "Add VPN (Gluetun)" : "Add proxy"}
      </h3>

      {/* Name */}
      <div className="mt-5">
        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Name <span className="text-error-strong">*</span></span>
          <Input className={inputCls} placeholder="e.g. NordVPN UK" value={name} onValueChange={(value) => setName(value)} />
        </label>
      </div>

      {/* VPN type selector (only for new proxies) */}
      {!initial && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-medium text-foreground-intense">Type</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button variant="ghost"
              type="button"
              onClick={() => setVpnType("direct")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                vpnType === "direct"
                  ? "border-border bg-background-muted text-foreground-intense"
                  : "border-border bg-background-muted text-foreground-intense hover:text-foreground-intense",
              )}
            >
              <p className="text-[14px] font-semibold">Direct proxy</p>
              <p className="mt-0.5 text-[12px] text-foreground-intense">SOCKS5 / HTTP — point at NordVPN, ExpressVPN, Ghost VPN, or any proxy server</p>
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => setVpnType("smartdns")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                vpnType === "smartdns"
                  ? "border-border bg-background-muted text-foreground-intense"
                  : "border-border bg-background-muted text-foreground-intense hover:text-foreground-intense",
              )}
            >
              <p className="text-[14px] font-semibold">Smart DNS</p>
              <p className="mt-0.5 text-[12px] text-foreground-intense">Override DNS only — fastest option, no tunnelling. Works with SmartDNSProxy, Unlocator, OverPlay, ProxyDNS.</p>
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => setVpnType("gluetun")}
              className={cn(
                "rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                vpnType === "gluetun"
                  ? "border-border bg-background-muted text-foreground-intense"
                  : "border-border bg-background-muted text-foreground-intense hover:text-foreground-intense",
              )}
            >
              <p className="text-[14px] font-semibold flex items-center gap-2">
                <Box className="h-3.5 w-3.5" />
                Gluetun container
              </p>
              <p className="mt-0.5 text-[12px] text-foreground-intense">Isolated Docker VPN container — supports OpenVPN, WireGuard, and all major providers</p>
            </Button>
          </div>
        </div>
      )}

      {/* Direct proxy form */}
      {vpnType === "direct" && (
        <>
          {/* Provider picker (only for new proxies) */}
          {!initial && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-medium text-foreground-intense">Provider</p>
              <div className="flex flex-wrap gap-2">
                {(["nordvpn", "expressvpn", "protonvpn", "ghostvpn", "custom"] as DirectProvider[]).map((id) => (
                  <Button variant="ghost"
                    key={id}
                    type="button"
                    onClick={() => applyDirectPreset(id)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-[14px] font-medium outline-none transition-colors",
                      directProvider === id
                        ? "border-border bg-background-muted text-foreground-intense"
                        : "border-border bg-background-muted text-foreground-intense hover:text-foreground-intense",
                    )}
                  >
                    {id === "custom" ? "Other / custom" : (DIRECT_PRESETS[id as Exclude<DirectProvider, "custom">]?.label ?? id)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {directPreset?.setupWarning && (
            <div className="mt-4 rounded-xl border border-primary bg-primary-subtle px-4 py-3">
              <p className="text-[13px] font-semibold text-primary-strong">Setup required first</p>
              <p className="mt-1 text-[13px] leading-relaxed text-primary-strong">{directPreset.setupWarning}</p>
            </div>
          )}

          {directPreset && (
            <div className="mt-3 rounded-xl border border-warning bg-warning-subtle px-4 py-3">
              <p className="text-[13px] leading-relaxed text-warning-strong">{directPreset.credentialHint}</p>
              {directPreset.credentialUrl && (
                <a href={directPreset.credentialUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[13px] font-medium text-warning-strong underline-offset-2 hover:underline">
                  Open {directPreset.label} configuration page →
                </a>
              )}
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Protocol</span>
              <Select value={directForm.protocol} onValueChange={(value) => setDirectForm((form) => ({ ...form, protocol: value as Protocol }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="socks5">SOCKS5 (recommended)</SelectItem>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectContent></Select>
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Port</span>
              <Input className={inputCls} placeholder={directPreset ? String(directPreset.port) : "1080"} type="number" min={1} max={65535} value={directForm.port} onChange={setDirect("port")} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Host</span>
              <Input className={inputCls} placeholder={directPreset?.hostPlaceholder ?? "proxy.myvpn.com"} value={directForm.host} onChange={setDirect("host")} />
              {directPreset?.hostHint && <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-intense">{directPreset.hostHint}</p>}
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Username <span className="text-foreground-intense">(optional)</span></span>
              <Input className={inputCls} autoComplete="off" value={directForm.username} onChange={setDirect("username")} />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">Password <span className="text-foreground-intense">(optional)</span></span>
              <Input className={inputCls} type="password" autoComplete="new-password" value={directForm.password} onChange={setDirect("password")} />
            </label>
          </div>
        </>
      )}

      {/* Smart DNS form */}
      {vpnType === "smartdns" && (
        <>
          <div className="mt-4 rounded-xl border border-primary bg-primary-subtle px-4 py-3">
            <p className="text-[13px] font-semibold text-primary-strong">How Smart DNS works</p>
            <p className="mt-1 text-[13px] leading-relaxed text-primary-strong">
              Only DNS lookups go through the provider — TCP connections stay direct. This gives full stream speed with no
              VPN overhead. The provider's DNS server returns proxy IPs for geo-blocked domains so their servers see an
              allowed country. Your real IP is unchanged.
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-warning bg-warning-subtle px-4 py-3">
            <p className="text-[13px] font-semibold text-warning-strong">Get your DNS server IPs</p>
            <p className="mt-1 text-[12px] leading-relaxed text-warning-strong mb-2">
              Log in to your Smart DNS service and copy the DNS IPs assigned to your account. They are typically found in Dashboard → Setup or DNS Addresses.
            </p>
            <div className="flex flex-wrap gap-2">
              {SMART_DNS_PROVIDERS.map((p) => (
                <a
                  key={p.label}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p.label}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">
                Primary DNS server <span className="text-error-strong">*</span>
              </span>
              <Input
                className={inputCls}
                placeholder="e.g. 45.55.184.161"
                value={smartDnsForm.dnsServer}
                onValueChange={(value) => setSmartDnsForm((f) => ({ ...f, dnsServer: value }))}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-foreground-intense">
                Secondary DNS server <span className="text-foreground-intense">(optional)</span>
              </span>
              <Input
                className={inputCls}
                placeholder="e.g. 104.197.28.121"
                value={smartDnsForm.dnsServer2}
                onValueChange={(value) => setSmartDnsForm((f) => ({ ...f, dnsServer2: value }))}
              />
            </label>
          </div>
        </>
      )}

      {/* Gluetun form */}
      {vpnType === "gluetun" && (
        <>
          <div className="mt-4 rounded-xl border border-primary bg-primary-subtle px-4 py-3">
            <p className="text-[13px] font-semibold text-primary-strong">Docker required</p>
            <p className="mt-1 text-[13px] leading-relaxed text-primary-strong">
              Docker must be installed and running on this server. Gluetun will launch an isolated container per VPN and expose an HTTP proxy locally — no OS-level VPN, no traffic leaks.
            </p>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-[13px] font-medium text-foreground-intense">VPN provider</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(GLUETUN_PROVIDERS) as [VpnProvider, GluetunProviderMeta][]).map(([id, meta]) => (
                <Button variant="ghost"
                  key={id}
                  type="button"
                  onClick={() => setGluetunForm((f) => ({ ...EMPTY_GLUETUN, vpnProvider: id, countries: f.countries }))}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-[14px] font-medium outline-none transition-colors",
                    gluetunForm.vpnProvider === id
                      ? "border-border bg-background-muted text-foreground-intense"
                      : "border-border bg-background-muted text-foreground-intense hover:text-foreground-intense",
                  )}
                >
                  {meta.label}
                </Button>
              ))}
            </div>
          </div>

          {gluetunProviderMeta && (
            <div className="mt-3 rounded-xl border border-warning bg-warning-subtle px-4 py-3">
              <p className="text-[13px] leading-relaxed text-warning-strong">{gluetunProviderMeta.hint}</p>
              {gluetunProviderMeta.credentialUrl && (
                <a href={gluetunProviderMeta.credentialUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block text-[13px] font-medium text-warning-strong underline-offset-2 hover:underline">
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

      {/* Test result (direct / smart DNS) */}
      {testResult && (vpnType === "direct" || vpnType === "smartdns") && (
        <div className={cn("mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px]", testResult.ok ? "bg-success-subtle text-success-strong" : "bg-error-subtle text-error-strong")}>
          {testResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {testResult.ok
            ? testResult.resolvedIp
              ? `DNS responding — resolved ${testResult.resolvedHost} → ${testResult.resolvedIp}`
              : `Connected — exit IP: ${testResult.ip}`
            : `Failed: ${testResult.error}`}
        </div>
      )}

      {error && <p className="mt-3 text-[14px] text-error-strong">{error}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" size="lg" type="button" onClick={handleSubmit} disabled={!valid || busy}>
          {busy ? <ZendeSpinner size="tiny" label="Saving proxy" /> : null}
          {initial ? "Save changes" : vpnType === "gluetun" ? "Add VPN" : "Add proxy"}
        </Button>
        {(vpnType === "direct" || vpnType === "smartdns") && (
          <Button variant="ghost"
            type="button"
            onClick={handleTest}
            disabled={vpnType === "direct" ? (!directValid || testing) : (!smartDnsValid || testing)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background-muted px-4 py-2.5 text-[14px] font-medium text-foreground-intense outline-none hover:bg-background-muted disabled:opacity-40"
          >
            {testing ? <ZendeSpinner size="tiny" label="Testing proxy" /> : <Shield className="h-3.5 w-3.5" />}
            {vpnType === "smartdns" ? "Test DNS" : "Test connection"}
          </Button>
        )}
        <Button variant="ghost" type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background-muted px-4 py-2.5 text-[14px] font-medium text-foreground-intense outline-none hover:text-foreground-intense">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Proxy Form Dialog ─────────────────────────────────────────────────────────

function ProxyFormDialog({
  open,
  editing,
  onSave,
  onClose,
}: {
  open: boolean;
  editing?: ProxyItem;
  onSave: (item: ProxyItem) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto px-4 py-8 sm:px-6"
      role="presentation"
    >
      <Button variant="ghost"
        type="button"
        aria-label="Dismiss"
        className="fixed inset-0 bg-background backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl my-auto motion-safe:animate-[glass-modal-pop_0.38s_cubic-bezier(0.16,1,0.3,1)_both]"
      >
        <ProxyForm initial={editing} onSave={onSave} onCancel={onClose} />
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
        <Button variant="ghost"
          type="button"
          onClick={() => void handleStart()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-success bg-success-subtle px-3 py-1.5 text-[13px] font-medium text-success-strong outline-none hover:bg-success-subtle disabled:opacity-50"
        >
          {busy ? <ZendeSpinner size="tiny" label="Starting proxy" /> : <Play className="h-3.5 w-3.5" />}
          Launch
        </Button>
      )}
      {(proxy.gluetunStatus === "running" || proxy.gluetunStatus === "starting") && (
        <Button variant="ghost"
          type="button"
          onClick={() => void handleStop()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-error bg-error-subtle px-3 py-1.5 text-[13px] font-medium text-error-strong outline-none hover:bg-error-subtle disabled:opacity-50"
        >
          {busy ? <ZendeSpinner size="tiny" label="Stopping proxy" /> : <Power className="h-3.5 w-3.5" />}
          Stop
        </Button>
      )}
      <Button variant="ghost"
        type="button"
        onClick={() => void handleRefresh()}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background-muted px-2.5 py-1.5 text-[12px] text-foreground-intense outline-none hover:text-foreground-intense"
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </Button>
      {proxy.gluetunStatus === "running" && proxy.gluetunHostPort && (
        <span className="font-mono text-[12px] text-foreground-intense">→ :{ proxy.gluetunHostPort}</span>
      )}
      {error && <span className="text-[12px] text-error-strong">{error}</span>}
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
    "h-11 w-full rounded-xl border border-border bg-background px-4",
    "text-[15px] text-foreground-intense placeholder:text-foreground-intense",
    "outline-none focus-visible:ring-2 focus-visible:ring-border",
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 sm:px-6"
      role="presentation"
    >
      {/* Backdrop */}
      <Button variant="ghost"
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-background backdrop-blur-md motion-safe:animate-[glass-backdrop-in_0.28s_ease-out_both]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogId}
        className="relative z-10 flex w-full max-w-2xl flex-col max-h-[92vh] motion-safe:animate-[glass-modal-pop_0.38s_cubic-bezier(0.16,1,0.3,1)_both]"
      >
        <Card frame="glass" className="flex flex-col overflow-hidden shadow-lg">

          {/* Header */}
          <div className="shrink-0 flex items-start justify-between gap-4 border-b border-border px-6 py-5">
            <div className="min-w-0">
              <p id={dialogId} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground-intense">
                VPN channel routing
              </p>
              <p className="mt-1 text-[18px] font-semibold text-foreground-intense truncate">{proxy.name}</p>
              <p className="mt-0.5 text-[13px] text-foreground-intense font-mono truncate">{routeDescription}</p>
              {proxy.vpnType === "gluetun" && proxy.gluetunStatus !== "running" && (
                <p className="mt-1.5 text-[12px] text-warning-strong">
                  Container is {proxy.gluetunStatus} — launch it before watching these channels.
                </p>
              )}
            </div>
            <Button variant="ghost" type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-foreground-intense hover:text-foreground-intense outline-none transition-colors">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Body — two columns on wide, stacked on narrow */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-border">

              {/* Left — add channels via search */}
              <div className="px-6 py-5">
                <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground-intense">Add channels</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-intense" />
                  <Input
                    ref={searchInputRef}
                    value={searchQ}
                    onChange={handleSearchInput}
                    placeholder="Search channels to add…"
                    className={cn(inputCls, "pl-10")}
                  />
                </div>

                <div className="mt-3 min-h-[120px]">
                  {!searchQ.trim() && (
                    <p className="text-center text-[13px] text-foreground-intense pt-8">Type to search all channels</p>
                  )}
                  {searchBusy && (
                    <div className="flex items-center justify-center gap-2 pt-8 text-[13px] text-foreground-intense">
                      <ZendeSpinner size="tiny" label="Searching channels" />
                      Searching…
                    </div>
                  )}
                  {!searchBusy && searchQ.trim() && searchResults.length === 0 && (
                    <p className="text-center text-[13px] text-foreground-intense pt-8">No unassigned channels matching "{searchQ}"</p>
                  )}
                  {searchResults.length > 0 && (
                    <ul className="space-y-1 max-h-[320px] overflow-y-auto">
                      {searchResults.map((ch) => (
                        <li key={ch.urlHash} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-muted px-3 py-2.5 hover:bg-background-muted transition-colors">
                          <span className="min-w-0 flex-1 truncate text-[14px] text-foreground-intense">{ch.label ?? ch.url}</span>
                          <Button variant="ghost"
                            type="button"
                            onClick={() => void handleAdd(ch)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-success bg-success-subtle px-3 py-1 text-[12px] font-medium text-success-strong outline-none hover:bg-success-subtle transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Right — assigned channels with filter */}
              <div className="px-6 py-5 border-t border-border sm:border-t-0">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground-intense">
                    Assigned
                    {assignedTotal > 0 && (
                      <span className="ml-2 rounded-full bg-background-muted px-2 py-0.5 text-[11px] font-bold text-foreground-intense normal-case tracking-normal">
                        {assignedTotal}
                      </span>
                    )}
                  </p>
                </div>

                {/* Filter assigned */}
                {assigned.length > 4 && (
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-intense" />
                    <Input
                      value={filterQ}
                      onValueChange={(value) => setFilterQ(value)}
                      placeholder="Filter assigned…"
                      className={cn(inputCls, "h-9 pl-9 text-[14px]")}
                    />
                  </div>
                )}

                <div className="min-h-[120px]">
                  {assignedBusy ? (
                    <div className="flex items-center justify-center gap-2 pt-8 text-[13px] text-foreground-intense">
                      <ZendeSpinner size="tiny" label="Loading assigned channels" />
                      Loading…
                    </div>
                  ) : assigned.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                      <Shield className="mx-auto mb-2 h-6 w-6 text-foreground-intense" />
                      <p className="text-[13px] text-foreground-intense">No channels assigned yet</p>
                      <p className="mt-1 text-[12px] text-foreground-intense">Search on the left to route channels through this VPN</p>
                    </div>
                  ) : filteredAssigned.length === 0 ? (
                    <p className="text-center text-[13px] text-foreground-intense pt-8">No channels match "{filterQ}"</p>
                  ) : (
                    <ul className="space-y-1 max-h-[320px] overflow-y-auto">
                      {filteredAssigned.map((ch) => (
                        <li key={ch.urlHash} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-muted px-3 py-2.5">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-success-strong" />
                            <span className="truncate text-[14px] text-foreground-intense">{ch.label ?? ch.url}</span>
                          </div>
                          <Button variant="ghost"
                            type="button"
                            onClick={() => void handleRemove(ch)}
                            className="shrink-0 rounded-lg border border-error bg-error-subtle px-2.5 py-1 text-[12px] font-medium text-error-strong outline-none hover:bg-error-subtle transition-colors"
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between gap-4">
            <p className="text-[13px] text-foreground-intense">
              Changes apply immediately — no save needed.
            </p>
            <Button variant="ghost"
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-background-muted px-5 py-2 text-[14px] font-medium text-foreground-intense outline-none hover:bg-background-muted transition-colors"
            >
              Done
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function TvSettingsProxiesPanel() {
  const { authEnabled, user } = useAuth();
  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProxyItem | null>(null);
  const [editLoading, setEditLoading] = useState<string | null>(null);
  const [managingProxy, setManagingProxy] = useState<ProxyItem | null>(null);

  const loadProxies = useCallback(async () => {
    setLoading(true);
    const { ok, body } = await apiFetch("/api/proxies");
    if (ok) setProxies(body as ProxyItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadProxies(); }, [loadProxies]);

  const openCreate = useCallback(() => { setEditing(null); setFormOpen(true); }, []);
  const openEdit = useCallback(async (p: ProxyItem) => {
    setEditLoading(p.id);
    const { ok, body } = await apiFetch(`/api/proxies/${p.id}`);
    setEditLoading(null);
    setEditing(ok ? (body as ProxyItem) : p);
    setFormOpen(true);
  }, []);
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

  const canEditProxy = useCallback((proxy: ProxyItem): boolean => {
    if (!authEnabled) return true;
    if (!user) return false;
    return user.role === "ADMIN" || user.id === proxy.createdByUserId;
  }, [authEnabled, user]);

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
      <section className="rounded-2xl border border-border bg-background-muted p-6 ring-1 ring-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-foreground-intense">VPN Proxies</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-foreground-intense">
              Route specific channels through dedicated VPNs — UK channels via a UK proxy, US channels via a US proxy,
              simultaneously. Two modes: connect to a provider's SOCKS5 endpoint directly, or let Gluetun
              manage an isolated Docker VPN container per proxy.
            </p>
          </div>
          <Button variant="primary" size="lg" type="button" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add proxy
          </Button>
        </div>

        {loading ? (
          <div className="mt-8 flex items-center gap-2 text-[14px] text-foreground-intense"><ZendeSpinner size="small" label="Loading proxies" /> Loading proxies…</div>
        ) : proxies.length === 0 && !formOpen ? (
          <p className="mt-8 rounded-xl border border-dashed border-border bg-background px-5 py-8 text-center text-[14px] text-foreground-intense">
            No proxies yet — add one above to start routing channels.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {proxies.map((proxy) => (
              <li
                key={proxy.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {proxy.vpnType === "gluetun" && <Box className="h-4 w-4 shrink-0 text-foreground-intense" />}
                    <p className="font-medium text-foreground-intense">{proxy.name}</p>
                    {proxy.vpnType === "gluetun" ? (
                      <span className="rounded-md bg-background-muted px-2 py-0.5 text-[12px] text-foreground-intense">
                        {GLUETUN_PROVIDERS[proxy.vpnProvider as VpnProvider]?.label ?? proxy.vpnProvider}
                      </span>
                    ) : proxy.vpnType === "smartdns" ? (
                      <span className="rounded-md bg-primary-subtle px-2 py-0.5 text-[12px] text-primary-strong">
                        Smart DNS
                      </span>
                    ) : (
                      <span className="rounded-md bg-background-muted px-2 py-0.5 font-mono text-[12px] text-foreground-intense">
                        {proxy.protocol}://{proxy.host}:{proxy.port}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13px] text-foreground-intense">
                    {proxy.vpnType === "direct" && proxy.username && (
                      <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{proxy.username}</span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium", proxy.channelCount > 0 ? "bg-success-subtle text-success-strong" : "bg-background-muted text-foreground-intense")}>
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
                  <Button variant="ghost"
                    type="button"
                    onClick={() => setManagingProxy(proxy)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background-muted px-3 py-2 text-[13px] font-medium text-foreground-intense outline-none hover:bg-background-muted"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Channels
                    {proxy.channelCount > 0 && (
                      <span className="rounded-full bg-background-muted px-1.5 py-0.5 text-[11px] font-bold text-foreground-intense">
                        {proxy.channelCount}
                      </span>
                    )}
                  </Button>
                  {canEditProxy(proxy) && (
                    <Button variant="ghost"
                      type="button"
                      onClick={() => void openEdit(proxy)}
                      disabled={editLoading === proxy.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background-muted px-3 py-2 text-[13px] font-medium text-foreground-intense outline-none hover:bg-background-muted disabled:opacity-50"
                    >
                      {editLoading === proxy.id ? <ZendeSpinner size="tiny" label="Loading proxy editor" /> : <Pencil className="h-3.5 w-3.5" />}
                      Edit
                    </Button>
                  )}
                  {canEditProxy(proxy) && (
                    <Button variant="ghost"
                      type="button"
                      onClick={() => void handleDelete(proxy.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-error bg-error-subtle px-3 py-2 text-[13px] font-medium text-error-strong outline-none hover:bg-error-subtle"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProxyFormDialog
        open={formOpen}
        editing={editing ?? undefined}
        onSave={onSaved}
        onClose={closeForm}
      />

      <ChannelAssignmentDialog
        proxy={managingProxy}
        onClose={() => setManagingProxy(null)}
        onCountChange={handleCountChange}
      />

      {/* Info footer */}
      <section className="rounded-2xl border border-border bg-background-muted px-6 py-5 space-y-5">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground-intense">Direct proxy vs Gluetun container</h3>
          <ul className="mt-3 space-y-2.5 text-[14px] leading-relaxed text-foreground-intense">
            <li>
              <span className="font-medium text-foreground-intense">Direct proxy</span> — connect to a remote SOCKS5 or HTTP proxy endpoint provided by your VPN service.
              NordVPN, ExpressVPN, and Ghost VPN expose SOCKS5 on their servers; just enter the hostname and service credentials.
            </li>
            <li>
              <span className="font-medium text-foreground-intense">Gluetun container</span> — Docker launches an isolated{" "}
              <a href="https://github.com/qdm12/gluetun" target="_blank" rel="noopener noreferrer" className="text-foreground-intense hover:text-foreground-intense underline">Gluetun</a>{" "}
              container per proxy. It connects to the VPN internally and exposes a local HTTP proxy that Zende routes through.
              Supports NordVPN, ExpressVPN, ProtonVPN, custom OpenVPN, and WireGuard.
              Run multiple containers for different countries simultaneously.
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-foreground-intense">Zero-leak guarantee</h3>
          <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-foreground-intense">
            <li>• Every request in a proxied session — master playlist, variant playlists, <span className="font-mono text-foreground-intense">.ts</span> segments, AES keys — goes through the proxy.</li>
            <li>• No fallback to direct. If the proxy or container is unreachable, the stream fails rather than leaking your real IP.</li>
            <li>• Gluetun containers are completely isolated — each runs its own VPN tunnel with no effect on other channels or system traffic.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
