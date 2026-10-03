import type { JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SessionList } from "../features/sessions/SessionList";

function Sessions(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <SessionList />
    </main>
  );
}

export const Route = createFileRoute("/sessions/")({
  component: Sessions,
});
