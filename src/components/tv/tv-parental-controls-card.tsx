"use client";

import { useCallback, useEffect, useState } from "react";

import {
  readParentalSettings,
  writeParentalEnabled,
  writeParentalPatterns,
  writeParentalPin,
} from "@/lib/parental/parental-controls";
import { cn } from "@/lib/utils";

export function TvParentalControlsCard() {
  const [enabled, setEnabled] = useState(false);
  const [patternsText, setPatternsText] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [mounted, setMounted] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const s = readParentalSettings();
    setEnabled(s.enabled);
    setPatternsText(s.hiddenPatterns.join(", "));
    setMounted(true);
  }, []);

  const save = useCallback(() => {
    const patterns = patternsText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (pin.trim() && pin.trim() !== confirmPin.trim()) {
      setHint("PIN confirmation does not match.");
      return;
    }

    writeParentalEnabled(enabled);
    writeParentalPatterns(patterns);
    if (pin.trim()) {
      writeParentalPin(pin.trim());
    } else if (!pin.trim() && !confirmPin.trim()) {
      writeParentalPin(null);
    }

    setHint("Parental settings saved on this device.");
    window.setTimeout(() => setHint(null), 2500);
  }, [confirmPin, enabled, patternsText, pin]);

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.1] bg-white/[0.04] p-6 ring-1 ring-white/[0.04]",
        !mounted && "opacity-0",
        mounted && "opacity-100 transition-opacity duration-200",
      )}
      aria-labelledby="parental-heading"
    >
      <h2 id="parental-heading" className="text-[18px] font-semibold text-white">
        Parental controls
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/50">
        Hide channels whose group title contains any of your patterns (for example{" "}
        <span className="font-mono text-[13px] text-white/55">adult</span> or{" "}
        <span className="font-mono text-[13px] text-white/55">xxx</span>). A PIN is
        stored locally in this browser only.
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3.5">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-white/30 bg-black/40"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-white/90">
            Enable hidden group patterns
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-white/45">
            Matching channels are blurred in browse views until the PIN is entered.
          </span>
        </span>
      </label>

      <label className="mt-4 block">
        <span className="text-[13px] font-medium text-white/55">
          Hidden group patterns (comma-separated)
        </span>
        <input
          type="text"
          value={patternsText}
          onChange={(e) => setPatternsText(e.target.value)}
          placeholder="adult, xxx, 18+"
          className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4 text-[15px] text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-white/30"
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-medium text-white/55">PIN (optional)</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4+ digits"
            className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4 text-[15px] text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-white/30"
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-white/55">Confirm PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/30 px-4 text-[15px] text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-white/30"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={save}
        className="mt-5 rounded-xl bg-white px-5 py-2.5 text-[15px] font-semibold text-zinc-950 outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-white"
      >
        Save parental settings
      </button>
      {hint ? (
        <p className="mt-3 text-[14px] text-emerald-300/90">{hint}</p>
      ) : null}
    </section>
  );
}
