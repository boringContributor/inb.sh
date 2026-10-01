import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { requestFilterSchema } from "@inb/shared";
import { z } from "zod";
import { api } from "./lib/api.ts";
import { keys, queryClient } from "./lib/queries.ts";
import { Sidebar } from "./components/sidebar.tsx";
import { InbGlyph } from "./components/brand.tsx";
import { LoginPage } from "./routes/login.tsx";
import { HomePage } from "./routes/home.tsx";
import { InboxPage } from "./routes/inbox/inbox-page.tsx";
import { ResponsePage } from "./routes/response/response-page.tsx";
import { RulesPage } from "./routes/rules/rules-page.tsx";
import { IntegrationsPage } from "./routes/integrations/integrations-page.tsx";
import { ArchivePage } from "./routes/archive/archive-page.tsx";
import { SettingsPage } from "./routes/settings/settings-page.tsx";
import { NotFound, RouteError } from "./routes/errors.tsx";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: z.object({ next: z.string().optional() }),
  component: LoginPage,
});

function AppLayout() {
  const navigate = useNavigate();
  useEffect(() => {
    const onUnauthorized = () =>
      void navigate({ to: "/login", search: { next: location.pathname } });
    window.addEventListener("inb:unauthorized", onUnauthorized);
    return () => window.removeEventListener("inb:unauthorized", onUnauthorized);
  }, [navigate]);
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function AppPending() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <InbGlyph className="size-8 animate-pulse text-foreground" />
    </div>
  );
}

/** Pathless layout: everything below needs a session. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
  errorComponent: RouteError,
  // shown while the session/config request is in flight instead of a blank page
  pendingComponent: AppPending,
  pendingMs: 300,
  beforeLoad: async ({ context, location }) => {
    const config = await context.queryClient.ensureQueryData({
      queryKey: keys.config,
      queryFn: api.config,
    });
    // public instances have no login: guests get a workspace with their first endpoint
    if (config.mode === "private" && !config.user)
      throw redirect({ to: "/login", search: { next: location.pathname } });
  },
});

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: HomePage });

export const inboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/e/$endpointId",
  validateSearch: z.object({
    r: z.string().optional(),
    filter: requestFilterSchema.optional(),
    q: z.string().optional(),
  }),
  component: InboxPage,
});

export const responseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/e/$endpointId/response",
  component: ResponsePage,
});

export const rulesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/rules",
  validateSearch: z.object({ rule: z.string().optional() }),
  component: RulesPage,
});

export const integrationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/integrations",
  validateSearch: z.object({ category: z.string().optional() }),
  component: IntegrationsPage,
});

export const archiveRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/archive",
  validateSearch: z.object({ r: z.string().optional() }),
  component: ArchivePage,
});

export const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    inboxRoute,
    responseRoute,
    rulesRoute,
    integrationsRoute,
    archiveRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
