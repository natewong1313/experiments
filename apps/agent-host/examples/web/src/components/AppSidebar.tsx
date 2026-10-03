import type { JSX } from "react";
import { createLink, useLocation } from "@tanstack/react-router";
import { Sidebar, useSidebar } from "@cloudflare/kumo";
import { HouseIcon, StackIcon } from "@phosphor-icons/react";
import { useAgentHost } from "../hooks/use-agent-host";

const MenuLink = createLink(Sidebar.MenuButton);

const SessionLink = createLink(Sidebar.MenuSubButton);

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
    <Sidebar aria-label="Main navigation" className="md:sticky md:top-0 md:h-svh">
      <Sidebar.Header>
        <img
          src="https://imagedelivery.net/HqFoVJao5LE850LIcBfxAQ/3f767dfc-8267-475e-fc66-642783920400/public"
          alt="Agent host"
          className="w-52 px-3 py-1"
        />
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
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
                <div
                  className={`flex items-center rounded-lg ${
                    sessionsActive
                      ? "bg-(--sidebar-active-bg)"
                      : "hover:bg-(--sidebar-active-bg) focus-within:bg-(--sidebar-active-bg)"
                  }`}
                >
                  <MenuLink
                    to="/sessions"
                    search={{ host }}
                    icon={StackIcon}
                    active={sessionsActive}
                    onClick={closeMobile}
                    className="min-w-0 flex-1 hover:bg-transparent"
                  >
                    Sessions
                  </MenuLink>
                  <Sidebar.CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Toggle session names"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-transparent focus-visible:outline-2 focus-visible:outline-kumo-focus group-data-[state=collapsed]/sidebar:hidden"
                      >
                        <Sidebar.MenuChevron className="ml-0" />
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
                            sessionId: session.resource.slice("ahp-session:/".length),
                          }}
                          search={{ host }}
                          active={
                            pathname ===
                            `/sessions/${session.resource.slice("ahp-session:/".length)}`
                          }
                          title={session.title || "Untitled session"}
                          onClick={closeMobile}
                        >
                          <span className="truncate">{session.title || "Untitled session"}</span>
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
