import type { JSX } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Collapsible } from "radix-ui";
import { IconChevronRight } from "@tabler/icons-react";
import { HouseIcon, StackIcon } from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useAgentHost } from "../lib/hooks/use-agent-host";

const NO_SESSIONS = 0;

export default function AppSidebar(): JSX.Element {
  const { host, view } = useAgentHost();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  const sessionsActive = pathname === "/sessions";

  function closeMobile(): void {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar aria-label="Main navigation">
      <SidebarHeader>
        <img
          src="https://imagedelivery.net/HqFoVJao5LE850LIcBfxAQ/3f767dfc-8267-475e-fc66-642783920400/public"
          alt="Agent host"
          className="w-52 px-3 py-1"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link to="/" search={{ host }} onClick={closeMobile}>
                    <HouseIcon />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <Collapsible.Root asChild defaultOpen>
                <SidebarMenuItem>
                  <div className="flex w-full items-center">
                    <SidebarMenuButton
                      asChild
                      isActive={sessionsActive}
                      className="min-w-0 flex-1 hover:bg-transparent"
                    >
                      <Link to="/sessions" search={{ host }} onClick={closeMobile}>
                        <StackIcon />
                        <span>Sessions</span>
                      </Link>
                    </SidebarMenuButton>
                    <Collapsible.Trigger asChild>
                      <button
                        type="button"
                        aria-label="Toggle session names"
                        className="flex h-8 w-8 shrink-0 items-center justify-center hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring group-data-[collapsible=icon]:hidden"
                      >
                        <IconChevronRight className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </button>
                    </Collapsible.Trigger>
                  </div>
                  <Collapsible.Content>
                    <SidebarMenuSub>
                      {view.status === "connected" &&
                        view.sessions.map((session) => (
                          <SidebarMenuSubItem key={session.resource}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={
                                pathname ===
                                `/sessions/${session.resource.slice("ahp-session:/".length)}`
                              }
                              title={session.title || "Untitled session"}
                            >
                              <Link
                                to="/sessions/$sessionId"
                                params={{
                                  sessionId: session.resource.slice("ahp-session:/".length),
                                }}
                                search={{ host }}
                                onClick={closeMobile}
                              >
                                <span className="truncate">
                                  {session.title || "Untitled session"}
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      {(view.status !== "connected" || view.sessions.length === NO_SESSIONS) && (
                        <SidebarMenuSubItem
                          className="px-2 py-1.5 text-sm text-muted-foreground"
                          role="status"
                        >
                          {view.status === "connecting" && "Loading sessions…"}
                          {view.status === "error" && "Reconnecting…"}
                          {view.status === "connected" && "No sessions yet"}
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </Collapsible.Content>
                </SidebarMenuItem>
              </Collapsible.Root>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}
