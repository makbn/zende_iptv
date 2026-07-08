"use client";

import { useRouter } from "next/navigation";
import { useCallback, type MouseEvent } from "react";

import { useRemoteControl } from "@/features/remote/remote-control-context";

export function useRemoteNavigation() {
  const router = useRouter();
  const remote = useRemoteControl();

  const navigate = useCallback(
    (href: string) => {
      if (remote?.activeSession) {
        void remote.sendNavigate(href);
        return;
      }
      router.push(href);
    },
    [remote, router],
  );

  const onNavigateClick = useCallback(
    (href: string) => (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  return {
    navigate,
    onNavigateClick,
    isRemoteActive: Boolean(remote?.activeSession),
  };
}
