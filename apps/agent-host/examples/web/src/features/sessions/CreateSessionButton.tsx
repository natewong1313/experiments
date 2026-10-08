import { useState } from "react";
import type { JSX } from "react";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { PlusIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { CreateSession } from "../../lib/hooks/use-sessions";

type CreationState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "error"; message: string };

type CreateSessionButtonParams = { createSession: CreateSession };

export function CreateSessionButton({ createSession }: CreateSessionButtonParams): JSX.Element {
  const [creation, setCreation] = useState<CreationState>({ status: "idle" });

  async function create(): Promise<void> {
    setCreation({ status: "creating" });

    try {
      await createSession();
      setCreation({ status: "idle" });
    } catch (error) {
      setCreation({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="grid gap-1.5">
      <Button
        type="button"
        disabled={creation.status === "creating"}
        onClick={() => {
          void create();
        }}
      >
        {creation.status === "creating" ? (
          <SpinnerGapIcon className="animate-spin" />
        ) : (
          <PlusIcon />
        )}
        {creation.status === "creating" ? "Creating…" : "Create session"}
      </Button>
      {creation.status === "error" && (
        <div role="alert" className="max-w-sm">
          <Alert variant="destructive">
            <AlertTitle>Could not create session</AlertTitle>
            <AlertDescription>{creation.message}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
