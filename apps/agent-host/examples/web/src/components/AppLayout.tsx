import type { JSX } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { SidebarProvider } from "./ui/sidebar";
import { AgentHostProvider } from "../lib/hooks/AgentHostProvider";
import AppSidebar from "./AppSidebar";
import ThemeToggle from "./ThemeToggle";

export default function AppLayout(): JSX.Element {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <AgentHostProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {!pathname.startsWith("/sessions/") && (
            <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center justify-end border-b border-border bg-background px-4 sm:px-6">
              <ThemeToggle />
            </header>
          )}
          <Outlet />
        </div>
      </SidebarProvider>
    </AgentHostProvider>
  );
}
