import { zodResolver } from "@hookform/resolvers/zod";
import { LockKeyhole, MonitorCog } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, login, type LoginResult } from "@/lib/api-client";

const formSchema = z.object({
  username: z.string().trim().min(1, "Enter your username."),
  password: z.string().min(1, "Enter your password.")
});

type LoginForm = z.infer<typeof formSchema>;

export function LoginScreen({ onSuccess }: { onSuccess: (result: LoginResult) => void }) {
  const form = useForm<LoginForm>({ resolver: zodResolver(formSchema), defaultValues: { username: "", password: "" } });

  async function submit(values: LoginForm) {
    try {
      onSuccess(await login(values.username, values.password));
    } catch (error) {
      form.setError("root", { message: error instanceof ApiError ? error.message : "The BCIS server is unavailable." });
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground"><MonitorCog aria-hidden="true" className="size-6" /></div>
          <div><h1 className="text-xl font-semibold">Sign in to BCIS</h1><p className="text-sm text-muted-foreground">Authorized office staff only</p></div>
        </div>
        <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input autoComplete="username" id="username" {...form.register("username")} />
            {form.formState.errors.username && <p className="text-xs text-danger">{form.formState.errors.username.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input autoComplete="current-password" id="password" type="password" {...form.register("password")} />
            {form.formState.errors.password && <p className="text-xs text-danger">{form.formState.errors.password.message}</p>}
          </div>
          {form.formState.errors.root && <p className="rounded-md bg-danger/10 p-3 text-sm text-danger" role="alert">{form.formState.errors.root.message}</p>}
          <Button className="w-full" disabled={form.formState.isSubmitting} size="lg" type="submit" variant="accent">
            <LockKeyhole aria-hidden="true" />{form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">Sessions are kept in memory and cleared when the app closes.</p>
      </section>
    </main>
  );
}

