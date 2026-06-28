import AppShell from "@/components/app-shell";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh bg-background font-sans text-foreground">
      <AppShell>{children}</AppShell>
    </div>
  );
}
