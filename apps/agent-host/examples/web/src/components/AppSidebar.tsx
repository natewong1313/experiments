import type { JSX } from "react";
import { createLink, useLocation } from "@tanstack/react-router";
import { Sidebar, useSidebar } from "@cloudflare/kumo";
import { HouseIcon, StackIcon, RobotIcon } from "@phosphor-icons/react";
import { useAgentHost } from "../hooks/use-agent-host";

const MenuLink = createLink(Sidebar.MenuButton);

const SessionLink = createLink(Sidebar.MenuSubButton);

export default function AppSidebar(): JSX.Element {
  const { host, view } = useAgentHost();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();

  function closeMobile(): void {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <Sidebar
      aria-label="Main navigation"
      className="md:sticky md:top-0 md:h-svh"
    >
      <Sidebar.Header>
        <Sidebar.Menu>
          <MenuLink
            icon={RobotIcon}
            to="/"
            search={{ host }}
            tooltip="Agent host"
            onClick={closeMobile}
          >
            Agent host
          </MenuLink>
        </Sidebar.Menu>
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.GroupLabel>{host}</Sidebar.GroupLabel>
          <Sidebar.Menu>
            <MenuLink
              to="/"
              search={{ host }}
              icon={HouseIcon}
              active={pathname === "/"}
              onClick={closeMobile}
            >
              Home
            </MenuLink>
            <Sidebar.MenuItem>
              <Sidebar.Collapsible defaultOpen>
                <div className="flex items-center">
                  <MenuLink
                    to="/sessions"
                    search={{ host }}
                    icon={StackIcon}
                    active={
                      pathname === "/sessions" ||
                      pathname.startsWith("/sessions/")
                    }
                    onClick={closeMobile}
                    className="min-w-0 flex-1"
                  >
                    Sessions
                  </MenuLink>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Toggle session names"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus group-data-[state=collapsed]/sidebar:hidden"
                      >
                        <Sidebar.MenuChevron />
                      </button>
                    }
                  />
                </div>
                <Sidebar.CollapsibleContent>
                  <Sidebar.MenuSub>
                    {view.status === "connected" &&
                      view.sessions.map((session) => (
                        <SessionLink
                          key={session.resource}
                          to="/sessions/$sessionId"
                          params={{
                            sessionId: session.resource.slice(
                              "ahp-session:/".length,
                            ),
                          }}
                          search={{ host }}
                          active={
                            pathname ===
                            `/sessions/${session.resource.slice("ahp-session:/".length)}`
                          }
                          title={session.title || "Untitled session"}
                          onClick={closeMobile}
                        >
                          <span className="truncate">
                            {session.title || "Untitled session"}
                          </span>
                        </SessionLink>
                      ))}
                    {(view.status !== "connected" || !view.sessions.length) && (
                      <Sidebar.MenuSubItem
                        className="px-2 py-1.5 text-sm text-kumo-subtle"
                        role="status"
                      >
                        {view.status === "connecting" && "Loading sessions…"}
                        {view.status === "error" && "Reconnecting…"}
                        {view.status === "connected" && "No sessions yet"}
                      </Sidebar.MenuSubItem>
                    )}
                  </Sidebar.MenuSub>
                </Sidebar.CollapsibleContent>
              </Sidebar.Collapsible>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer>
        <Sidebar.Trigger />
      </Sidebar.Footer>
    </Sidebar>
  );
}
