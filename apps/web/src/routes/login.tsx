import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { Inbox } from "lucide-react";
import { ApiError, api } from "../lib/api.ts";
import { keys } from "../lib/queries.ts";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const search = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.login(password);
      await qc.invalidateQueries({ queryKey: keys.config });
      const next = search.next && search.next.startsWith("/") && !search.next.startsWith("//") ? search.next : "/";
      await navigate({ to: next });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That password didn't work" : "Couldn't sign in — try again");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Inbox className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Sign in to Inbound</h1>
            <p className="mt-1 text-sm text-muted">This instance is self-hosted. Use the admin password you set with SST.</p>
          </div>
        </div>
        <TextField value={password} onChange={setPassword} type="password" isInvalid={!!error} autoFocus isRequired>
          <Label>Admin password</Label>
          <Input placeholder="••••••••" />
          <FieldError>{error}</FieldError>
        </TextField>
        <Button type="submit" fullWidth isPending={pending} isDisabled={!password}>
          Sign in
        </Button>
        <p className="text-center text-xs text-tertiary">
          Set it with <code className="font-mono text-muted">sst secret set AdminPassword …</code>
        </p>
      </form>
    </div>
  );
}
