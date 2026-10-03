import type { JSX } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@cloudflare/kumo";
import { SessionList } from "../components/SessionList";

function Sessions(): JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid gap-2">
        <Text as="h1" variant="heading" size="lg">
          Sessions
        </Text>
        <Text variant="secondary">View and create sessions on your selected agent host.</Text>
      </div>
      <SessionList />
    </main>
  );
}

export const Route = createFileRoute("/sessions/")({
  component: Sessions,
});
