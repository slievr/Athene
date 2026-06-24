"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function ViewTabBar() {
  const pathname = usePathname();
  const isFleet = pathname === "/fleet";

  return (
    <nav className="view-tab-bar" aria-label="View">
      <Link
        href="/"
        className={cn(
          "view-tab-bar__tab",
          !isFleet && "view-tab-bar__tab--active",
        )}
        aria-current={!isFleet ? "page" : undefined}
      >
        Agents
      </Link>
      <Link
        href="/fleet"
        className={cn(
          "view-tab-bar__tab",
          isFleet && "view-tab-bar__tab--active",
        )}
        aria-current={isFleet ? "page" : undefined}
      >
        Fleet
      </Link>
    </nav>
  );
}
