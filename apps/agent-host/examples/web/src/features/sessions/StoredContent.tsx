import { useCallback, useState, type JSX } from "react";
import type { ContentRef, ResourceReadResult } from "@experiments/protocol-schemas/ahp";
import { ResourceReadResultSchema } from "@experiments/protocol-schemas/ahp";
import { Button } from "../../components/ui/button";
import { useAgentHost } from "../../lib/hooks/use-agent-host";

type ContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; content: ResourceReadResult }
  | { status: "error"; message: string };

type StoredContentParams = { reference: ContentRef };

function StoredContent({ reference }: StoredContentParams): JSX.Element {
  const { view } = useAgentHost();
  const [state, setState] = useState<ContentState>({ status: "idle" });

  const load = useCallback(async (): Promise<void> => {
    if (view.status !== "connected") {
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await view.client.resourceRead({ uri: reference.uri });
      setState({ status: "ready", content: ResourceReadResultSchema.parse(response) });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [view, reference.uri]);

  const handleLoad = useCallback(() => {
    void load();
  }, [load]);

  if (state.status === "ready") {
    const { content } = state;

    if (content.encoding === "utf-8") {
      return (
        <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap text-sm">{content.data}</pre>
      );
    }

    const dataUri = `data:${content.contentType ?? "application/octet-stream"};base64,${content.data}`;

    if (content.contentType?.startsWith("image/") === true) {
      return (
        <img src={dataUri} alt="Agent output" className="max-h-96 max-w-full object-contain" />
      );
    }

    return (
      <a href={dataUri} download>
        Download content
      </a>
    );
  }

  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={view.status !== "connected" || state.status === "loading"}
        onClick={handleLoad}
      >
        {state.status === "loading" ? "Loading content…" : "Load content"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}

export { StoredContent };
