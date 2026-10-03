import { useState } from "react";
import type { JSX } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAgentHost } from "../lib/hooks/use-agent-host";

const HOST_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function App(): JSX.Element {
  const { host, setHost } = useAgentHost();
  const [hostInput, setHostInput] = useState(host);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 grid gap-2">
        <h1 className="m-0 font-heading text-xl font-semibold tracking-wider uppercase">Home</h1>
        <p className="m-0 text-sm text-muted-foreground">
          Choose an agent host to view and create sessions.
        </p>
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
          <Label htmlFor="host-id">Host ID</Label>
          <Input
            id="host-id"
            name="host"
            value={hostInput}
            onChange={(event) => {
              setHostInput(event.target.value);
            }}
            required
            pattern="[a-zA-Z0-9_\\-]{1,64}"
            maxLength={64}
            aria-describedby="host-help"
          />
        </div>
        <Button type="submit" variant="secondary">
          Connect to host
        </Button>
      </form>
      <p id="host-help" className="mt-2 text-sm text-muted-foreground">
        Use 1–64 letters, digits, underscores, or hyphens. Clients using the same host ID share
        sessions.
      </p>
      <Card className="mt-8 py-5!">
        <CardContent className="grid gap-4 px-6">
          <div className="grid gap-1.5">
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              View live sessions for {host}, or create a new session.
            </CardDescription>
          </div>
          <Link
            to="/sessions"
            search={{ host }}
            className="w-fit font-medium text-primary underline underline-offset-4"
          >
            View sessions
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute("/")({ component: App });
