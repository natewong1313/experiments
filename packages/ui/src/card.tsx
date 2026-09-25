import type { JSX, ReactNode } from "react";

type CardProps = {
  title: string;
  children: ReactNode;
};

export function Card({ title, children }: CardProps): JSX.Element {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
