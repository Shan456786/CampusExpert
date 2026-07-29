import type { LucideIcon } from "lucide-react";
import {
  Library,
  Users,
  UtensilsCrossed,
  ClipboardCheck,
  CalendarClock,
  BedDouble,
  Stethoscope,
  Bus,
} from "lucide-react";

interface SuggestedPrompt {
  icon: LucideIcon;
  label: string;
}

const suggestedPrompts: SuggestedPrompt[] = [
  { icon: Library, label: "Where is the Library?" },
  { icon: Users, label: "Faculty Information" },
  { icon: UtensilsCrossed, label: "Today's Mess Menu" },
  { icon: ClipboardCheck, label: "Attendance Rules" },
  { icon: CalendarClock, label: "Exam Schedule" },
  { icon: BedDouble, label: "Hostel Timings" },
  { icon: Stethoscope, label: "Medical Centre" },
  { icon: Bus, label: "Bus Routes" },
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {suggestedPrompts.map(({ icon: Icon, label }) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => onSelect(label)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9] transition-colors duration-200 group-hover:bg-[#6D28D9] group-hover:text-white">
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
