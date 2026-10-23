import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ToolCallStatus as AHPToolCallStatus } from "@microsoft/agent-host-protocol";

import { ToolCallView } from "./tool-call";

it("shows the latest pending snapshot instead of the earlier append-only input", () => {
  const view = createElement(ToolCallView, {
    toolCall: {
      toolCallId: "call",
      toolName: "exec",
      displayName: "exec",
      status: AHPToolCallStatus.Streaming,
      partialInput: '{"command":"old command"}',
      _meta: { "acp.partialInput": '{"command":"git status"}' },
    },
    onConfirm(): void {},
    onConfirmResult(): void {},
  });

  const html = renderToStaticMarkup(view);

  expect(html).toContain("git status");
  expect(html).not.toContain("old command");
});
