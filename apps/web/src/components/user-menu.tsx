"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cipher-atlas/ui/components/dropdown-menu";
import { Skeleton } from "@cipher-atlas/ui/components/skeleton";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full bg-foreground/10 text-[11px] font-semibold text-foreground transition-colors hover:bg-foreground/20"
            aria-label="User menu"
          />
        }
      >
        {getInitials(session.user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 !bg-background">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{session.user.name}</DropdownMenuLabel>
          <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground/60">
            {session.user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/dashboard")}>
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              authClient.signOut({
                fetchOptions: { onSuccess: () => router.push("/") },
              })
            }
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
