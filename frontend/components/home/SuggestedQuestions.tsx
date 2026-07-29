"use client";

import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  BedDouble,
  Users,
  UtensilsCrossed,
  CalendarDays,
  Stethoscope,
  Bus,
  FileText,
} from "lucide-react";

interface SuggestedQuestion {
  icon: LucideIcon;
  label: string;
}

const suggestedQuestions: SuggestedQuestion[] = [
  { icon: MapPin, label: "Where is AB2?" },
  { icon: BedDouble, label: "Hostel Timings" },
  { icon: Users, label: "Faculty Information" },
  { icon: UtensilsCrossed, label: "Mess Menu Today" },
  { icon: CalendarDays, label: "Academic Calendar" },
  { icon: Stethoscope, label: "Medical Centre" },
  { icon: Bus, label: "Bus Routes" },
  { icon: FileText, label: "Leave Application" },
];

export default function SuggestedQuestions() {
  const router = useRouter();

  // Same landing-page-to-chat handoff SearchBar.tsx uses: navigate to
  // /chat?q=<question>, which app/chat/page.tsx auto-sends on mount as the
  // first real message - a suggested question isn't a static label here,
  // it actually asks Campus Expert.
  const handleSelect = (label: string) => {
    router.push(`/chat?q=${encodeURIComponent(label)}`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ul
        role="list"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {suggestedQuestions.map(({ icon: Icon, label }) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => handleSelect(label)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[#6D28D9] hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9] transition-colors duration-200 group-hover:bg-[#6D28D9] group-hover:text-white">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
