import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border-border bg-panel-2 text-fg hover:border-border-strong hover:bg-panel-3",
        primary: "border-accent/30 bg-accent text-black hover:bg-white",
        buy: "border-buy/25 bg-buy text-black hover:brightness-110",
        sell: "border-sell/25 bg-sell text-white hover:brightness-110",
        outline: "border-border bg-transparent text-fg hover:bg-panel-2",
        ghost: "border-transparent bg-transparent text-muted hover:bg-panel-2 hover:text-fg",
        subtle: "border-transparent bg-panel-2 text-fg hover:bg-panel-3",
        danger: "border-sell/30 bg-sell/10 text-sell hover:bg-sell/20",
      },
      size: {
        xs: "h-6 px-2 text-2xs",
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-xs",
        lg: "h-10 px-4 text-sm",
        icon: "h-7 w-7",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
