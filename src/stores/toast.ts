"use client";

import { create } from "zustand";
import { uid } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  createdAt: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (input: { title: string; description?: string; variant?: ToastVariant }) => string;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 4;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: ({ title, description, variant = "info" }) => {
    const id = uid("toast");
    set((state) => ({
      toasts: [...state.toasts, { id, title, description, variant, createdAt: Date.now() }].slice(-MAX_TOASTS),
    }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function toast(input: { title: string; description?: string; variant?: ToastVariant }) {
  if (typeof window === "undefined") return;
  const id = useToastStore.getState().push(input);
  setTimeout(() => {
    useToastStore.getState().dismiss(id);
  }, 5_500);
}
