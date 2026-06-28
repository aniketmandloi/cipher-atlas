"use client";

import { useState } from "react";

import { Badge } from "@cipher-atlas/ui/components/badge";
import { Button } from "@cipher-atlas/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cipher-atlas/ui/components/card";
import { Input } from "@cipher-atlas/ui/components/input";
import { Label } from "@cipher-atlas/ui/components/label";
import { Magnetic, ScrollReveal } from "@cipher-atlas/ui/components/motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

type SourceType = "github" | "aws";

type ConnectorStatus = "pending_validation" | "usable" | "invalid" | "unsupported";
type ValidationStatus = "not_validated" | "valid" | "invalid" | "unsupported";

function statusVariant(
  status: ConnectorStatus,
): "default" | "outline" | "destructive" | "secondary" {
  switch (status) {
    case "usable":
      return "default";
    case "pending_validation":
      return "secondary";
    case "invalid":
    case "unsupported":
      return "destructive";
  }
}

function statusLabel(status: ConnectorStatus): string {
  switch (status) {
    case "pending_validation":
      return "Pending Validation";
    case "usable":
      return "Usable";
    case "invalid":
      return "Invalid";
    case "unsupported":
      return "Unsupported";
  }
}

function validationLabel(status: ValidationStatus): string {
  switch (status) {
    case "not_validated":
      return "Not Validated";
    case "valid":
      return "Valid";
    case "invalid":
      return "Invalid";
    case "unsupported":
      return "Unsupported";
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

const EMPTY_GITHUB_FORM = { displayName: "", token: "" };
const EMPTY_AWS_FORM = {
  displayName: "",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  region: "us-east-1",
};

export default function ConnectorsView() {
  const [showForm, setShowForm] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("github");
  const [githubForm, setGithubForm] = useState(EMPTY_GITHUB_FORM);
  const [awsForm, setAwsForm] = useState(EMPTY_AWS_FORM);

  const connectorsQuery = useQuery(trpc.connectors.list.queryOptions());

  const createMutation = useMutation(
    trpc.connectors.create.mutationOptions({
      onSuccess: () => {
        void connectorsQuery.refetch();
        setGithubForm(EMPTY_GITHUB_FORM);
        setAwsForm(EMPTY_AWS_FORM);
        setShowForm(false);
        toast.success("Connector created. Run validation before using it for scans.");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const validateMutation = useMutation(
    trpc.connectors.validate.mutationOptions({
      onSuccess: (data) => {
        void connectorsQuery.refetch();
        if (data.status === "usable") {
          toast.success("Connector validated successfully.");
        } else {
          toast.error(data.lastValidationMessage ?? "Validation failed.");
        }
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (sourceType === "github") {
      createMutation.mutate({
        sourceType: "github",
        displayName: githubForm.displayName,
        credentials: { token: githubForm.token },
      });
    } else {
      createMutation.mutate({
        sourceType: "aws",
        displayName: awsForm.displayName,
        credentials: {
          accessKeyId: awsForm.accessKeyId,
          secretAccessKey: awsForm.secretAccessKey,
          sessionToken: awsForm.sessionToken || undefined,
          region: awsForm.region,
        },
      });
    }
  }

  const connectors = connectorsQuery.data ?? [];

  return (
    <div className="mt-10 space-y-10">
      {/* Connector list */}
      <ScrollReveal delay={0}>
        <div className="space-y-4">
          {connectorsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading connectors…</p>
          )}

          {!connectorsQuery.isLoading && connectors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No connectors yet. Add one below to get started.
            </p>
          )}

          {connectors.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="font-display text-base font-medium">
                      {c.displayName}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {c.sourceType}
                    </p>
                  </div>
                  <Badge variant={statusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Credential</p>
                    <p className="mt-0.5 font-mono">{c.credentialPreview ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Validation</p>
                    <p className="mt-0.5">{validationLabel(c.lastValidationStatus)}</p>
                  </div>
                  {c.lastValidationMessage && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Message</p>
                      <p className="mt-0.5">{c.lastValidationMessage}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Last Validated</p>
                    <p className="mt-0.5">{formatDate(c.lastValidatedAt)}</p>
                  </div>
                </div>
                <div className="pt-1">
                  <Magnetic strength={0.2}>
                    <Button
                      variant="outline"
                      className="h-8 rounded-full px-4 text-xs"
                      disabled={validateMutation.isPending}
                      onClick={() => validateMutation.mutate({ id: c.id })}
                    >
                      {validateMutation.isPending &&
                      validateMutation.variables?.id === c.id
                        ? "Validating…"
                        : "Validate"}
                    </Button>
                  </Magnetic>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollReveal>

      {/* Add connector */}
      <ScrollReveal delay={0.08}>
        <div>
          {!showForm ? (
            <Magnetic strength={0.25}>
              <Button
                variant="outline"
                className="h-10 rounded-full px-5 text-sm"
                onClick={() => setShowForm(true)}
              >
                Add Connector
              </Button>
            </Magnetic>
          ) : (
            <div className="max-w-md space-y-6">
              <p className="text-sm font-medium">New Connector</p>

              {/* Source type toggle */}
              <div className="flex gap-2">
                {(["github", "aws"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSourceType(t)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      sourceType === t
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "github" ? "GitHub" : "AWS"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-sm text-muted-foreground">Display Name</Label>
                  <Input
                    id="displayName"
                    placeholder="e.g. My Org GitHub"
                    className="h-10 rounded-lg border-border bg-transparent"
                    value={sourceType === "github" ? githubForm.displayName : awsForm.displayName}
                    onChange={(e) => {
                      if (sourceType === "github") {
                        setGithubForm((f) => ({ ...f, displayName: e.target.value }));
                      } else {
                        setAwsForm((f) => ({ ...f, displayName: e.target.value }));
                      }
                    }}
                    required
                  />
                </div>

                {sourceType === "github" && (
                  <div className="space-y-2">
                    <Label htmlFor="token" className="text-sm text-muted-foreground">Personal Access Token</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="ghp_…"
                      autoComplete="off"
                      className="h-10 rounded-lg border-border bg-transparent"
                      value={githubForm.token}
                      onChange={(e) =>
                        setGithubForm((f) => ({ ...f, token: e.target.value }))
                      }
                      required
                    />
                  </div>
                )}

                {sourceType === "aws" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="accessKeyId" className="text-sm text-muted-foreground">Access Key ID</Label>
                      <Input
                        id="accessKeyId"
                        placeholder="AKIA…"
                        autoComplete="off"
                        className="h-10 rounded-lg border-border bg-transparent"
                        value={awsForm.accessKeyId}
                        onChange={(e) =>
                          setAwsForm((f) => ({ ...f, accessKeyId: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secretAccessKey" className="text-sm text-muted-foreground">Secret Access Key</Label>
                      <Input
                        id="secretAccessKey"
                        type="password"
                        autoComplete="off"
                        className="h-10 rounded-lg border-border bg-transparent"
                        value={awsForm.secretAccessKey}
                        onChange={(e) =>
                          setAwsForm((f) => ({ ...f, secretAccessKey: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sessionToken" className="text-sm text-muted-foreground">Session Token (optional)</Label>
                      <Input
                        id="sessionToken"
                        type="password"
                        autoComplete="off"
                        className="h-10 rounded-lg border-border bg-transparent"
                        value={awsForm.sessionToken}
                        onChange={(e) =>
                          setAwsForm((f) => ({ ...f, sessionToken: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="region" className="text-sm text-muted-foreground">Region</Label>
                      <Input
                        id="region"
                        placeholder="us-east-1"
                        className="h-10 rounded-lg border-border bg-transparent"
                        value={awsForm.region}
                        onChange={(e) =>
                          setAwsForm((f) => ({ ...f, region: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-2 pt-1">
                  <Magnetic strength={0.25}>
                    <Button
                      type="submit"
                      className="h-10 rounded-full px-5 text-sm"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? "Creating…" : "Create Connector"}
                    </Button>
                  </Magnetic>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-full px-5 text-sm"
                    onClick={() => {
                      setShowForm(false);
                      setGithubForm(EMPTY_GITHUB_FORM);
                      setAwsForm(EMPTY_AWS_FORM);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}
