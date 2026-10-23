import type { ReactNode } from "react";
import {
  Link,
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { cn } from "cn";

import { AhpProvider } from "~/lib/ahp/hooks/ahp-context";
import { SessionCatalogProvider } from "~/lib/ahp/hooks/session-catalog";
import appCss from "~/styles/app.css?url";

type RootDocumentProps = Readonly<{ children: ReactNode }>;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Agent Host Web",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: RootDocumentProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden bg-stone-100 text-neutral-900">
        <AhpProvider>
          <SessionCatalogProvider>
            <header className="flex shrink-0 items-center gap-4 border-b border-neutral-200 px-4 py-3">
              <span className="font-semibold">Agent Host</span>
              <nav className="flex gap-3 text-sm">
                <NavLink href="/" current={pathname === "/"}>
                  Home
                </NavLink>
                <NavLink href="/sessions" current={pathname.startsWith("/sessions")}>
                  Sessions
                </NavLink>
                <NavLink href="/settings" current={pathname === "/settings"}>
                  Settings
                </NavLink>
              </nav>
            </header>
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
          </SessionCatalogProvider>
        </AhpProvider>
        <Scripts />
      </body>
    </html>
  );
}

type NavLinkProps = Readonly<{ href: string; current: boolean; children: ReactNode }>;

/** Renders a header link, underlined when it matches the current route. */
function NavLink({ href, current, children }: NavLinkProps) {
  return (
    <Link
      to={href}
      className={cn("px-2", current ? "bg-amber-400" : "text-neutral-600 hover:underline")}
    >
      {children}
    </Link>
  );
}
