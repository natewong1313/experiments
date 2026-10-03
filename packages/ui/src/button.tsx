"use client";

import type { JSX, ReactNode } from "react";
import { useCallback } from "react";

type ButtonProps = {
  children: ReactNode;
  className?: string;
  appName: string;
};

export function Button({ children, className, appName }: ButtonProps): JSX.Element {
  const handleClick = useCallback((): void => {
    alert(`Hello from your ${appName} app!`);
  }, [appName]);

  return (
    <button className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
