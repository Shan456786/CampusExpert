import type { LucideIcon } from "lucide-react";
import {
  GraduationCap,
  MapPinned,
  Users,
  FolderOpen,
  Bus,
  Sparkles,
} from "lucide-react";
import Card from "../ui/Card";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: GraduationCap,
    title: "Academic Assistant",
    description:
      "Instant answers about courses, attendance, exams, regulations and academic policies.",
  },
  {
    icon: MapPinned,
    title: "Campus Navigation",
    description:
      "Find buildings, classrooms, labs, departments and important locations.",
  },
  {
    icon: Users,
    title: "Faculty Information",
    description:
      "Access faculty details, office hours, departments and contact information.",
  },
  {
    icon: FolderOpen,
    title: "Student Resources",
    description:
      "Quick access to calendars, forms, documents, clubs and university services.",
  },
  {
    icon: Bus,
    title: "Transport & Hostel",
    description:
      "Find hostel rules, bus schedules, mess timings and student facilities.",
  },
  {
    icon: Sparkles,
    title: "AI Powered Search",
    description: "Ask questions naturally and receive instant answers using AI.",
  },
];

export default function Features() {
  return (
    <section className="w-full bg-[var(--surface)] px-6 py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Section heading */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Everything You Need in One Place
          </h2>
          <p className="mt-4 text-balance text-lg leading-relaxed text-[var(--text-secondary)]">
            Campus Expert helps students quickly find verified information
            about academics, campus facilities, faculty, transport, hostels,
            clubs and university procedures using AI.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} hover padding="large" className="h-full">
              <div className="flex h-full flex-col">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
