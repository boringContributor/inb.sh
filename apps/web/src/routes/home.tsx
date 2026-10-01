import { useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Spinner } from "@heroui/react";
import { ArrowRight, Clock, Plus, ShieldCheck, Zap } from "lucide-react";
import { type Endpoint, describeLimit } from "@inb/shared";
import { InbGlyph } from "../components/brand.tsx";
import { api } from "../lib/api.ts";
import { keys, useEndpoints } from "../lib/queries.ts";
import { usePlan } from "../lib/plan.ts";
import { NewEndpointModal } from "../components/new-endpoint-modal.tsx";

/** `/` → most recently active endpoint, or a first-run prompt. */
export function HomePage() {
  const { data: endpoints, isPending } = useEndpoints();
  const { isPublic } = usePlan();

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (endpoints?.length) {
    const target = [...endpoints].sort(
      (a, b) =>
        Date.parse(b.lastRequestAt ?? b.createdAt) - Date.parse(a.lastRequestAt ?? a.createdAt),
    )[0]!;
    return <Navigate to="/e/$endpointId" params={{ endpointId: target.id }} replace />;
  }
  return isPublic ? <GuestWelcome /> : <FirstEndpoint />;
}

/** Public instance: one click to a working URL, no form, no signup. */
function GuestWelcome() {
  const { plan } = usePlan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => api.createEndpoint({ name: "My endpoint", icon: "webhook" }),
    onSuccess: async (endpoint) => {
      qc.setQueryData<Endpoint[]>(keys.endpoints, [endpoint]);
      // the first endpoint created the guest workspace
      await qc.invalidateQueries({ queryKey: keys.config });
      await navigate({ to: "/e/$endpointId", params: { endpointId: endpoint.id } });
    },
  });

  const facts = [
    { icon: Zap, text: "No signup, works instantly" },
    {
      icon: Clock,
      text:
        plan.endpointTtlHours !== null
          ? `Lives ${plan.endpointTtlHours} hours`
          : `History kept ${plan.retentionDays} days`,
    },
    { icon: ShieldCheck, text: `${describeLimit(plan.dailyRequestsPerEndpoint, "request")} a day` },
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 text-center">
      <InbGlyph className="size-12 text-foreground" />
      <div className="max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">A webhook URL in one click</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Point Stripe, GitHub, cron jobs or your own code at it and watch every request land live.
          Inspect it, answer with a custom response, replay it to localhost.
        </p>
      </div>
      <Button size="lg" onPress={() => create.mutate()} isPending={create.isPending}>
        Get a URL
        <ArrowRight className="size-4" />
      </Button>
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-tertiary">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-1.5">
            <Icon className="size-3.5" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FirstEndpoint() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <InbGlyph mono className="size-6" />
      </span>
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Create your first endpoint</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Every endpoint gets its own URL. Point webhooks, cron jobs or your own services at it and
          watch requests land live.
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
