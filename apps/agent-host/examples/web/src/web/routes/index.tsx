import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

type AppInfo = Readonly<{ appName: string; runtime: string }>;

export const Route = createFileRoute("/")({
  loader: () => getAppInfo(),
  component: HomeComponent,
});

const getAppInfo = createServerFn().handler((): AppInfo => ({
  appName: env.APP_NAME,
  runtime: "Cloudflare Workers",
}));

function HomeComponent() {
  return <div className="p-6"></div>;
}
