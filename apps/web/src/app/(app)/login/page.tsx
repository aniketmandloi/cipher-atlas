"use client";

import { useState } from "react";

import { ScrollReveal } from "@cipher-atlas/ui/components/motion";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-6 py-16">
      <ScrollReveal y={12} delay={0.1} className="w-full max-w-md">
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </ScrollReveal>
    </div>
  );
}
