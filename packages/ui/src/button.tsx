"use client";

import type { JSX, ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  className?: string;
  appName: string;
};

export function Button({ children, className, appName }: ButtonProps): JSX.Element {
  return (
    <button
      className={className}
      onClick={() => {
        alert(`Hello from your ${appName} app!`);
      }}
    >
      {children}
    </button>
  );
}
