import { Outlet, createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

export const Route = createFileRoute("/sessions")({
  component: SessionsLayout,
});

/**
 * Hosts the session list and the individual session pages.
 *
 * Both routes live under `/sessions`, so the parent renders only the active
 * child.
 */
function SessionsLayout(): ReactElement {
  return <Outlet />;
}
