import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type ButtonType = ButtonHTMLAttributes<HTMLButtonElement>["type"];

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: ButtonType;
  className?: string;
}

// Visual treatment per variant. Kept as a lookup object instead of
// branching logic so new variants are a one-line addition.
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#6D28D9] text-white hover:bg-[#7C3AED] focus-visible:ring-[#6D28D9]",
  secondary:
    "bg-[#DDD6FE] text-[#6D28D9] hover:bg-[#C4B5FD] focus-visible:ring-[#6D28D9]",
  outline:
    "bg-[var(--surface)] text-[#6D28D9] border border-[#6D28D9] hover:bg-[var(--surface-subtle)] focus-visible:ring-[#6D28D9]",
  ghost:
    "bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] focus-visible:ring-[#6D28D9]",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
};

// Sizing scale: padding, text size, and gap between icon/label.
const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3.5 text-sm",
  md: "h-11 gap-2 px-5 text-sm",
  lg: "h-12 gap-2.5 px-7 text-base",
};

// Spinner size mirrors the button size for visual balance.
const spinnerSizeStyles: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

/**
 * Button
 * The single, canonical button used across Campus Expert — navbar,
 * hero CTAs, search submit, auth flows, dashboard, and admin panel.
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  onClick,
  type = "button",
  className = "",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  // Base styles shared by every variant and size.
  const baseStyles =
    "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

  // Interaction styles: lift on hover, press on active, disabled state.
  const interactionStyles = isDisabled
    ? "cursor-not-allowed opacity-60"
    : "hover:scale-[1.03] hover:shadow-sm active:scale-[0.98]";

  const widthStyles = fullWidth ? "w-full" : "";

  const combinedClassName = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    interactionStyles,
    widthStyles,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      className={combinedClassName}
    >
      {loading ? (
        <>
          <Loader2
            className={`${spinnerSizeStyles[size]} animate-spin`}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {leftIcon && (
            <span className="inline-flex shrink-0 items-center" aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <span>{children}</span>
          {rightIcon && (
            <span className="inline-flex shrink-0 items-center" aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
