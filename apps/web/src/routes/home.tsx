import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { Plus } from "lucide-react";
import { InbGlyph } from "../components/brand.tsx";
import { useEndpoints } from "../lib/queries.ts";
import { NewEndpointModal } from "../components/new-endpoint-modal.tsx";

/** `/` → most recently active endpoint, or a first-run prompt. */
export function HomePage() {
  const { data: endpoints, isPending } = useEndpoints();
  const [creating, setCreating] = useState(false);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (endpoints?.length) {
    const target = [...endpoints].sort(
      (a, b) => Date.parse(b.lastRequestAt ?? b.createdAt) - Date.parse(a.lastRequestAt ?? a.createdAt),
    )[0]!;
    return <Navigate to="/e/$endpointId" params={{ endpointId: target.id }} replace />;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <InbGlyph mono className="size-6" />
      </span>
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Create your first endpoint</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Every endpoint gets its own URL. Point webhooks, cron jobs or your own services at it and watch requests land live.
        </p>
      </div>
      <Button onPress={() => setCreating(true)}>
        <Plus className="size-4" />
        New endpoint
      </Button>
      <NewEndpointModal isOpen={creating} onOpenChange={setCreating} />
    </div>
  );
}
