import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MessageProps = { from: "user" | "assistant"; author: string; children: ReactNode };

export function Message({ from, author, children }: MessageProps) {
  const isUser = from === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <span className="text-xs text-muted-foreground">{author}</span>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
