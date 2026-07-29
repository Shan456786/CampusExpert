"use client";

import { useEffect, type RefObject } from "react";

// Shared "close this dropdown when the student clicks outside it or
// presses Escape" behavior - previously implemented twice, identically,
// in Navbar.tsx (the "Menu" dropdown) and ChatHeader.tsx (the account
// menu). Both listeners are only attached while `isOpen` is true, and are
// removed the moment it becomes false or the component unmounts, so this
// never leaves a dangling document-level listener behind.
export function useDismissOnOutsideClick(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void
): void {
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onDismiss();
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, containerRef, onDismiss]);
}
