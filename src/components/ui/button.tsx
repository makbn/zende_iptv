import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "zende-action-button group/button inline-flex shrink-0 items-center justify-center rounded-xl border bg-clip-padding text-sm font-semibold whitespace-nowrap shadow-[0_12px_34px_-24px_rgba(0,0,0,0.9)] transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none select-none focus-visible:ring-2 focus-visible:ring-[var(--zen-signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tv-page-bg)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        normal:
          "border-white/[0.14] bg-white/[0.075] text-white hover:border-white/[0.22] hover:bg-white/[0.12]",
        success:
          "border-emerald-300/30 bg-emerald-400/16 text-emerald-50 hover:border-emerald-200/45 hover:bg-emerald-400/24 focus-visible:ring-emerald-300",
        danger:
          "border-red-300/30 bg-red-500/14 text-red-50 hover:border-red-200/45 hover:bg-red-500/22 focus-visible:ring-red-300",
      },
      size: {
        default: "min-h-11 gap-2 px-4",
        xs: "min-h-8 gap-1 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "min-h-10 gap-1.5 px-3 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "min-h-12 gap-2 px-5 text-[15px]",
        icon: "size-10",
        "icon-xs":
          "size-7 rounded-full in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-9 rounded-full in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "normal",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "normal",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-ui-button="true"
      data-button-variant={variant}
      data-button-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
