import { useState } from "react";
import type { JSX } from "react";
import { Button, Input, LayerCard, Text } from "@cloudflare/kumo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgentHost } from "../hooks/use-agent-host";

const HOST_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function App(): JSX.Element {
  const { host, setHost } = useAgentHost();
  const [hostInput, setHostInput] = useState(host);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 grid gap-2">
        <Text as="h1" variant="heading" size="lg">
          Home
        </Text>
        <Text variant="secondary">
          Choose an agent host to view and create sessions.
        </Text>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();

          if (HOST_ID.test(hostInput)) {
            setHost(hostInput);
          }
        }}
      >
        <div className="grid gap-1.5">
          <Input
            label="Host ID"
            id="host-id"
            name="host"
            value={hostInput}
            onChange={(event) => {
              setHostInput(event.target.value);
            }}
            required
            pattern={"[a-zA-Z0-9_\\-]{1,64}"}
            maxLength={64}
            aria-describedby="host-help"
          />
        </div>
        <Button type="submit" variant="secondary">
          Connect to host
        </Button>
      </form>
      <p id="host-help" className="mt-2 text-sm text-kumo-subtle">
        Use 1–64 letters, digits, underscores, or hyphens. Clients using the
        same host ID share sessions.
      </p>
      <LayerCard className="mt-8 grid gap-4 px-6 py-5">
        <div className="grid gap-1.5">
          <Text as="h2" variant="heading">
            Sessions
          </Text>
          <Text variant="secondary">
            View live sessions for {host}, or create a new session.
          </Text>
        </div>
        <Link
          to="/sessions"
          search={{ host }}

          className="w-fit font-medium text-kumo-link underline underline-offset-4"
        >
          View sessions
        </Link>
      </LayerCard>
    </main>
  );
}

export const Route = createFileRoute("/")({ component: App });
