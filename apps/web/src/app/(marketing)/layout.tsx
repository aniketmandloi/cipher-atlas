export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Marketing is forced dark for now; a light theme comes later.
  return (
    <div className="min-h-svh bg-background text-foreground">{children}</div>
  );
}
