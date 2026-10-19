"use client";

import { create } from "zustand";

interface HydrationState {
  hydrated: boolean;
  markHydrated: () => void;
}

export const useHydrationStore = create<HydrationState>()((set) => ({
  hydrated: false,
  markHydrated: () => set({ hydrated: true }),
}));

export function useHydrated(): boolean {
  return useHydrationStore((state) => state.hydrated);
}
