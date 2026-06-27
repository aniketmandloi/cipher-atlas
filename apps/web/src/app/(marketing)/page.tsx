"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@cipher-atlas/ui/components/button";
import {
  Magnetic,
  NumberTicker,
  ScrollProgress,
  ScrollReveal,
  TextReveal,
  TextShimmer,
  TiltCard,
} from "@cipher-atlas/ui/components/motion";
import { cn } from "@cipher-atlas/ui/lib/utils";

import { authClient } from "@/lib/auth-client";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import {
  brand,
  categories,
  finalCta,
  findings,
  footer,
  hero,
  nav,
  pricing,
  problem,
  proof,
  type Risk,
  riskLabel,
  steps,
  trust,
} from "@/components/marketing/content";

const riskText: Record<Risk, string> = {
  critical: "text-foreground",
  high: "text-foreground/70",
  medium: "text-foreground/55",
  low: "text-foreground/45",
};

const cta = "h-10 rounded-full px-5 text-sm";
const ctaGhost = "h-10 rounded-full px-5 text-sm";

export default function Home() {
  const { data: session } = authClient.useSession();

  return (
    <div className="min-h-svh bg-background font-sans text-foreground selection:bg-foreground/15">
      <ScrollProgress />

      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <span className="grid size-6 place-items-center rounded-full bg-foreground text-[11px] font-bold text-background">
              {brand.mark}
            </span>
            {brand.name}
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            {nav.links.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </a>
            ))}
            {session && (
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <ModeToggle />
            {session ? (
              <UserMenu />
            ) : (
              <>
                <Link
                  href={nav.signIn.href}
                  className="hidden text-sm text-muted-foreground hover:text-foreground sm:block"
                >
                  {nav.signIn.label}
                </Link>
                <Magnetic strength={0.2}>
                  <a href={nav.cta.href} className={cn(buttonVariants(), cta)}>
                    {nav.cta.label}
                  </a>
                </Magnetic>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* Hero */}
        <section className="py-24 sm:py-36">
          <p className="text-sm">
            <TextShimmer duration={4}>{hero.eyebrow}</TextShimmer>
          </p>
          <TextReveal
            as="h1"
            text={hero.headline}
            className="mt-6 max-w-3xl text-balance font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-6xl"
            split="word"
            whileInView
            once
          />
          <ScrollReveal delay={0.2}>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {hero.sub}
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.35}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Magnetic strength={0.3}>
                <a
                  href={hero.primaryCta.href}
                  className={cn(buttonVariants(), cta, "gap-2")}
                >
                  {hero.primaryCta.label}
                  <ArrowRight className="size-4" />
                </a>
              </Magnetic>
              <a
                href={hero.secondaryCta.href}
                className={cn(buttonVariants({ variant: "outline" }), ctaGhost)}
              >
                {hero.secondaryCta.label}
              </a>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.45} className="mt-20">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground/70">
              <span>{trust.line}</span>
              {trust.verticals.map((v) => (
                <span key={v} className="text-muted-foreground">
                  {v}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </section>

        {/* Problem + findings */}
        <section id="product" className="scroll-mt-16 border-t border-border py-20">
          <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
            <ScrollReveal>
              <div>
                <span className="text-sm text-muted-foreground">
                  {problem.kicker}
                </span>
                <h2 className="mt-3 font-display text-3xl font-medium tracking-tight">
                  {problem.title}
                </h2>
                <p className="mt-4 text-muted-foreground">{problem.body}</p>
              </div>
            </ScrollReveal>
            <div className="divide-y divide-border border-y border-border">
              {findings.map((f, i) => (
                <ScrollReveal key={f.id} delay={i * 0.06}>
                  <div className="flex items-center gap-4 py-3.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground/60">
                      {f.id}
                    </span>
                    <span className="text-foreground/85">{f.asset}</span>
                    <span className="hidden truncate text-muted-foreground/70 sm:block">
                      {f.detail}
                    </span>
                    <span className={cn("ml-auto text-xs", riskText[f.risk])}>
                      {riskLabel[f.risk]}
                    </span>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* How */}
        <section id="how" className="scroll-mt-16 border-t border-border py-20">
          <ScrollReveal>
            <h2 className="font-display text-3xl font-medium tracking-tight">
              One scan. Full inventory.
            </h2>
          </ScrollReveal>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.n}>
                <ScrollReveal delay={i * 0.1}>
                  <span className="font-mono text-sm text-muted-foreground/60">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-medium">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </ScrollReveal>
              </li>
            ))}
          </ol>
        </section>

        {/* Coverage */}
        <section id="coverage" className="scroll-mt-16 border-t border-border py-20">
          <ScrollReveal>
            <h2 className="font-display text-3xl font-medium tracking-tight">
              Everything quantum can break.
            </h2>
          </ScrollReveal>
          <div className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {categories.map((c, i) => (
              <ScrollReveal key={c.id} delay={i * 0.08}>
                <div className="border-t border-border pt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-medium">{c.name}</h3>
                    <span className={cn("text-xs", riskText[c.risk])}>
                      {riskLabel[c.risk]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{c.blurb}</p>
                  <p className="mt-3 font-mono text-xs text-muted-foreground/60">
                    {c.sample}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Proof + Pricing */}
        <section
          id="pricing"
          className="grid scroll-mt-16 gap-12 border-t border-border py-20 md:grid-cols-2"
        >
          <ScrollReveal>
            <div>
              <div className="font-display text-6xl font-medium tracking-tight">
                <NumberTicker value={95} suffix="%" startOnView blur />
              </div>
              <p className="mt-2 text-muted-foreground">{proof.statLabel}</p>
              <p className="mt-6 max-w-sm text-sm text-muted-foreground">
                {proof.body}
              </p>
            </div>
          </ScrollReveal>
          <TiltCard max={6} className="rounded-2xl border border-border p-7">
            <span className="text-sm text-muted-foreground">{pricing.tier}</span>
            <div className="mt-2 flex items-end gap-1">
              <NumberTicker
                value={299}
                prefix="$"
                startOnView
                className="font-display text-5xl font-medium tracking-tight"
              />
              <span className="pb-1.5 text-muted-foreground">
                {pricing.period}
              </span>
            </div>
            <ul className="mt-6 space-y-2.5">
              {pricing.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-3 text-sm text-foreground/80"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
            <Magnetic strength={0.2} className="mt-7 w-full">
              <a
                href={pricing.cta.href}
                className={cn(buttonVariants(), cta, "w-full gap-2")}
              >
                {pricing.cta.label}
                <ArrowRight className="size-4" />
              </a>
            </Magnetic>
            <p className="mt-3 text-center text-xs text-muted-foreground/70">
              {pricing.secondary}
            </p>
          </TiltCard>
        </section>

        {/* CTA */}
        <section
          id="pilot"
          className="scroll-mt-16 border-t border-border py-28 text-center"
        >
          <TextReveal
            as="h2"
            text={finalCta.title}
            className="mx-auto max-w-2xl font-display text-3xl font-medium tracking-tight sm:text-5xl"
            split="word"
            whileInView
            once
          />
          <ScrollReveal delay={0.15}>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              {finalCta.body}
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.25}>
            <Magnetic strength={0.3} className="mt-8 inline-flex">
              <a
                href={finalCta.cta.href}
                className={cn(buttonVariants(), cta, "gap-2")}
              >
                {finalCta.cta.label}
                <ArrowRight className="size-4" />
              </a>
            </Magnetic>
          </ScrollReveal>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="font-medium text-foreground/80">{brand.name}</span>
          <span className="text-xs">{footer.tagline}</span>
          <span className="text-xs">
            © {new Date().getFullYear()} {brand.name}
          </span>
        </div>
      </footer>
    </div>
  );
}
