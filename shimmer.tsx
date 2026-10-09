import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("animate-pulse text-muted-foreground", className)}>{children}</span>;
}
