import { useState, type ReactElement } from "react";

type ReasoningPartProps = {
  text: string;
  streaming: boolean;
};

/**
 * Renders an AI SDK reasoning part as collapsed model thinking.
 *
 * The part starts collapsed so a long reasoning stream does not push the answer
 * out of view.
 */
export function ReasoningPart({ text, streaming }: ReasoningPartProps): ReactElement {
  const [open, setOpen] = useState(false);
  const label = streaming ? "Thinking" : "Thought";

  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          setOpen((previous) => !previous);
        }}
        className="text-sm text-neutral-500"
      >
        {label} {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-2 border-l-2 border-neutral-300 pl-3 text-sm text-neutral-600 whitespace-pre-wrap wrap-anywhere">
          {text}
        </div>
      ) : null}
    </div>
  );
}
