import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { TriangleAlert } from "lucide-react";
import { ApiError } from "../lib/api.ts";

export function NotFound() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="font-mono text-sm text-tertiary">404</p>
      <h1 className="text-xl font-semibold">Nothing here</h1>
      <Link to="/" className="text-sm text-accent hover:underline">
        Back to the inbox
      </Link>
    </div>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-5" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">{notFound ? "Not found" : "Something went wrong"}</h1>
        <p className="mt-1 max-w-md text-sm text-muted">{error.message}</p>
      </div>
      <Button variant="secondary" onPress={reset}>
        Try again
      </Button>
    </div>
  );
}
