import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost";
  children: ReactNode;
};

export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonProps) {
  const variantClass = variant === "ghost" ? "button button-ghost" : "button";
  const mergedClassName = className
    ? `${variantClass} ${className}`
    : variantClass;

  return <button {...props} className={mergedClassName} />;
}
