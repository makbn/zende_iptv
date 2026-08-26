"use client";

import { Button } from "@appica/ui-react/button";
import { useTheme } from "@appica/ui-react/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { mounted, resolvedTheme, setTheme } = useTheme();
  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-md"
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
