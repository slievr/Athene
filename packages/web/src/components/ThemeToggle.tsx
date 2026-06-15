"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
  className?: string;
  label?: string;
}

const THEME_CYCLE = ["dark", "ocean", "light"] as const;
type Theme = (typeof THEME_CYCLE)[number];

function nextTheme(current: string | undefined): Theme {
  const idx = THEME_CYCLE.indexOf(current as Theme);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
}

const THEME_LABELS: Record<Theme, string> = {
  dark: "dark",
  ocean: "ocean",
  light: "light",
};

export function ThemeToggle({ className, label }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className={className ?? "h-9 w-9"} />;

  const current = resolvedTheme ?? "dark";
  const next = nextTheme(current);

  return (
    <button
      onClick={() => setTheme(next)}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated-hover)]"
      }
      aria-label={`Switch to ${THEME_LABELS[next]} mode`}
      title={`Switch to ${THEME_LABELS[next]} mode`}
    >
      {current === "light" ? (
        // Sun icon — currently light, switch to dark
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : current === "ocean" ? (
        // Moon icon — currently ocean, switch to light
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      ) : (
        // Waves icon — currently dark, switch to ocean
        <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0" />
          <path d="M2 17c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0" />
          <path d="M2 7c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0" />
        </svg>
      )}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
