import type { KeyboardEvent, ReactNode } from "react";

type CardPadding = "small" | "medium" | "large";

interface CardProps {
  /** Content rendered inside the card. */
  children: ReactNode;
  /** Additional classes merged onto the default styles. */
  className?: string;
  /** Optional click handler. When provided, the card becomes interactive and keyboard focusable. */
  onClick?: () => void;
  /** Enables the lift + shadow + purple border hover treatment. */
  hover?: boolean;
  /** Inner spacing. */
  padding?: CardPadding;
  /** Renders the default border. */
  border?: boolean;
  /** Renders the default soft shadow. */
  shadow?: boolean;
}

// Padding scale mapped to Tailwind spacing utilities.
const paddingStyles: Record<CardPadding, string> = {
  small: "p-4",
  medium: "p-6",
  large: "p-8",
};

/**
 * Card
 * Generic, reusable surface used across Campus Expert for feature cards,
 * search results, professor profiles, suggested questions, announcements,
 * and resource listings. Interactive when `onClick` is supplied.
 */
export default function Card({
  children,
  className = "",
  onClick,
  hover = false,
  padding = "medium",
  border = true,
  shadow = true,
}: CardProps) {
  const isInteractive = Boolean(onClick);

  // Base styles applied to every card.
  const baseStyles = "rounded-2xl bg-[var(--surface)] transition-all duration-200";

  // Conditional style pieces, joined manually to avoid extra dependencies.
  const borderStyles = border ? "border border-[var(--border)]" : "";
  const shadowStyles = shadow ? "shadow-sm" : "";
  const hoverStyles = hover
    ? "hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
    : "";
  const interactiveStyles = isInteractive
    ? "cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D28D9] focus-visible:ring-offset-2"
    : "";

  const combinedClassName = [
    baseStyles,
    paddingStyles[padding],
    borderStyles,
    shadowStyles,
    hoverStyles,
    interactiveStyles,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Allow activating the card with Enter or Space when it is interactive.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={combinedClassName}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      {children}
    </div>
  );
}
