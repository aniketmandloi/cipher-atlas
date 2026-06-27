import Header from "@/components/header";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-svh bg-background font-sans text-foreground">
      <Header />
      <main>{children}</main>
    </div>
  );
}
