import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: SettingsComponent,
});

function SettingsComponent() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-neutral-600">Workspace settings will live here.</p>
    </div>
  );
}
