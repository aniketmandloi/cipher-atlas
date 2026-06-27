import { Button } from "@cipher-atlas/ui/components/button";
import { Input } from "@cipher-atlas/ui/components/input";
import { Label } from "@cipher-atlas/ui/components/label";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const router = useRouter();
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="w-full">
      <ScrollReveal delay={0}>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">Sign in</h1>
      </ScrollReveal>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-8 space-y-5"
      >
        <ScrollReveal delay={0.1}>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name} className="text-sm text-muted-foreground">
                  Email
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-10 rounded-lg border-border bg-transparent"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </ScrollReveal>

        <ScrollReveal delay={0.18}>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name} className="text-sm text-muted-foreground">
                  Password
                </Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-10 rounded-lg border-border bg-transparent"
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </ScrollReveal>

        <ScrollReveal delay={0.26}>
          <form.Subscribe
            selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Magnetic strength={0.2} className="w-full">
                <Button
                  type="submit"
                  className="h-10 w-full rounded-full text-sm"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? "Signing in…" : "Sign In"}
                </Button>
              </Magnetic>
            )}
          </form.Subscribe>
        </ScrollReveal>
      </form>

      <ScrollReveal delay={0.32}>
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Need an account? <span className="text-foreground">Sign up</span>
          </button>
        </div>
      </ScrollReveal>
    </div>
  );
}
