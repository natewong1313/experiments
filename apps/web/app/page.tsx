import { Button } from "@experiments/ui/button";
import { Card } from "@experiments/ui/card";

export default function Page() {
  return (
    <main>
      <h1>Web</h1>
      <p className="subtitle">Turborepo + pnpm monorepo example</p>

      <Card title="Shared component from @experiments/ui">
        <p>
          This card and the button below live in{" "}
          <code>packages/ui</code> and are consumed as source through the{" "}
          <code>@experiments/ui/*</code> exports - no build step required.
        </p>
        <Button appName="web">Click me</Button>
      </Card>

      <Card title="Where things live">
        <ul>
          <li><code>apps/web</code> - this Next.js app</li>
          <li><code>@experiments/ui</code> - shared React components</li>
          <li><code>@experiments/oxlint-config</code> - shared oxlint config</li>
          <li><code>@experiments/typescript-config</code> - shared tsconfigs</li>
        </ul>
      </Card>
    </main>
  );
}
