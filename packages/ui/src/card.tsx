import { ReactNode } from "react";

interface CardProps {
  title: string;
  children: ReactNode;
}

export const Card = ({ title, children }: CardProps) => (
  <section className="card">
    <h2>{title}</h2>
    {children}
  </section>
);
