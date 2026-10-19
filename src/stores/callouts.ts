"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isNetworkId } from "@/lib/constants";
import { createSafeStorage } from "@/lib/trading/sanitize";
import type { TokenRef } from "@/lib/trading/types";
import { uid } from "@/lib/utils";

export interface Callout {
  id: string;
  token: TokenRef;
  message: string;
  /** Optional holding threshold in the account quote currency. Display only. */
  holdingThreshold: number | null;
  createdAt: number;
}

interface CalloutState {
  callouts: Callout[];
  add: (input: { token: TokenRef; message: string; holdingThreshold: number | null }) => Callout | null;
  remove: (id: string) => void;
}

const MAX_CALLOUTS = 100;

export const useCalloutStore = create<CalloutState>()(
  persist(
    (set) => ({
      callouts: [],
      add: ({ token, message, holdingThreshold }) => {
        const trimmed = message.trim().slice(0, 280);
        if (!trimmed || !isNetworkId(token?.network)) return null;
        const callout: Callout = {
          id: uid("callout"),
          token,
          message: trimmed,
          holdingThreshold:
            typeof holdingThreshold === "number" && Number.isFinite(holdingThreshold) && holdingThreshold > 0
              ? holdingThreshold
              : null,
          createdAt: Date.now(),
        };
        set((state) => ({ callouts: [callout, ...state.callouts].slice(0, MAX_CALLOUTS) }));
        return callout;
      },
      remove: (id) => set((state) => ({ callouts: state.callouts.filter((c) => c.id !== id) })),
    }),
    {
      name: "memescope.callouts.v1",
      version: 1,
      storage: createJSONStorage(() => createSafeStorage()),
      skipHydration: true,
      partialize: (state) => ({ callouts: state.callouts }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<CalloutState> | undefined;
        if (!saved || !Array.isArray(saved.callouts)) return current;
        const callouts = saved.callouts.filter(
          (callout): callout is Callout =>
            !!callout &&
            typeof callout === "object" &&
            typeof callout.id === "string" &&
            typeof callout.message === "string" &&
            !!callout.token &&
            typeof callout.token.address === "string" &&
            isNetworkId(callout.token.network),
        );
        return { ...current, callouts: callouts.slice(0, MAX_CALLOUTS) };
      },
    },
  ),
);
