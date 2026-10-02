import type { JSX } from "react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@cloudflare/kumo";
import { AgentHostProvider } from "../hooks/use-agent-host";
import AppSidebar from "./AppSidebar";
import ThemeToggle from "./ThemeToggle";

export default function AppLayout(): JSX.Element {
  return (
    <AgentHostProvider>
      <Sidebar.Provider defaultOpen>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-[58px] shrink-0 items-center justify-end border-b border-kumo-line bg-kumo-base px-4 sm:px-6">
            <ThemeToggle />
          </header>
          <Outlet />
        </div>
      </Sidebar.Provider>
    </AgentHostProvider>
  );
}
