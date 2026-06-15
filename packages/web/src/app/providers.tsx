"use client";

import { ThemeProvider } from "next-themes";
import { MuxProvider } from "@/providers/MuxProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" themes={["light", "dark", "ocean"]} enableSystem={false}>
      <MuxProvider>{children}</MuxProvider>
    </ThemeProvider>
  );
}
