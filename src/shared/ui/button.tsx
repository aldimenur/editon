import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

const buttonVariants = cva("button", {
  variants: {
    variant: {
      solid: "",
      ghost: "button-ghost",
    },
    size: {
      sm: "button-sm",
      md: "",
    },
  },
  defaultVariants: {
    variant: "solid",
    size: "md",
  },
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { asChild = false, className, variant, size, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
