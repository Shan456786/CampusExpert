import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  MessageSquare,
  ShieldCheck,
  MapPin,
  Clock,
  Search,
  CheckCircle2,
  GraduationCap,
  Users,
  Building2,
  UtensilsCrossed,
  Bus,
  Map,
  BookOpen,
  FileText,
  Target,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

interface SolutionCard {
  icon: LucideIcon;
  title: string;
  description: string;
}

const solutionCards: SolutionCard[] = [
  {
    icon: MessageSquare,
    title: "Ask Naturally",
    description: "Students can ask questions conversationally.",
  },
  {
    icon: ShieldCheck,
    title: "Verified Information",
    description: "Answers can be grounded in official and curated university resources.",
  },
  {
    icon: MapPin,
    title: "Campus Focused",
    description: "Designed specifically around VIT AP student needs.",
  },
  {
    icon: Clock,
    title: "Available Anytime",
    description: "Students can access the assistant whenever they need information.",
  },
];

interface StepItem {
  icon: LucideIcon;
  step: string;
  title: string;
  description: string;
}

const steps: StepItem[] = [
  {
    icon: Search,
    step: "1",
    title: "Ask",
    description: "Ask Campus Expert a question.",
  },
  {
    icon: MapPin,
    step: "2",
    title: "Find",
    description: "The system searches relevant verified campus information.",
  },
  {
    icon: CheckCircle2,
    step: "3",
    title: "Answer",
    description: "Receive a clear and useful response.",
  },
];

interface CoverageItem {
  icon: LucideIcon;
  label: string;
}

const coverageItems: CoverageItem[] = [
  { icon: GraduationCap, label: "Academics" },
  { icon: Users, label: "Faculty" },
  { icon: Building2, label: "Hostels" },
  { icon: UtensilsCrossed, label: "Mess" },
  { icon: Bus, label: "Transport" },
  { icon: Map, label: "Campus Navigation" },
  { icon: BookOpen, label: "Student Resources" },
  { icon: FileText, label: "University Procedures" },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <div className="w-full bg-[var(--surface)]">
      {/* Hero */}
      <section className="px-6 py-20 sm:px-8 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl animate-[fadeIn_0.4s_ease-out] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-1.5 text-sm font-medium text-[#6D28D9]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Built for VIT AP
          </span>

          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            Built to Make Campus Life Simpler
          </h1>
          <p className="mt-5 text-balance text-lg leading-relaxed text-[var(--text-secondary)]">
            Campus Expert is an AI-powered student assistant designed to help
            VIT AP students quickly find the information they need.
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            University information shouldn&apos;t be difficult to find.
          </h2>
          <p className="mt-5 text-balance text-base leading-relaxed text-[var(--text-secondary)]">
            Students often need information about academics, hostels, faculty,
            transport, campus procedures, resources and university services.
            This kind of information can live across many different sources,
            making it harder to find the right answer at the right time.
          </p>
        </div>
      </section>

      {/* Our Solution */}
      <section className="px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              One Assistant. Everything VIT AP.
            </h2>
            <p className="mt-5 text-balance text-base leading-relaxed text-[var(--text-secondary)]">
              Campus Expert aims to provide a single conversational interface
              where students can ask natural-language questions and access
              verified campus information.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {solutionCards.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            How It Works
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-6">
            {steps.map(({ icon: Icon, step, title, description }, index) => (
              <div key={title} className="relative flex flex-col items-center text-center">
                {index !== steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-7 hidden h-px bg-[var(--border)] sm:left-[calc(50%+28px)] sm:block sm:w-[calc(100%-56px)]"
                  />
                )}
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[#6D28D9] text-white shadow-sm shadow-[#6D28D9]/25">
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <span className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#6D28D9]">
                  Step {step}
                </span>
                <h3 className="mt-1.5 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Campus Expert Covers */}
      <section className="px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            What Campus Expert Covers
          </h2>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {coverageItems.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Project Vision */}
      <section className="border-t border-[var(--border)] bg-[var(--surface-subtle)] px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
            <Target className="h-6 w-6 text-white" strokeWidth={2} />
          </span>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Our Vision
          </h2>
          <p className="mt-5 text-balance text-base leading-relaxed text-[var(--text-secondary)]">
            Make reliable campus information easier to access and reduce the
            time students spend searching across multiple sources.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 sm:px-8 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Have a question about VIT AP?
          </h2>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/chat"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#6D28D9] px-7 py-3 text-sm font-medium text-white shadow-sm shadow-[#6D28D9]/25 transition-all duration-200 hover:scale-[1.03] hover:bg-[#7C3AED] active:scale-[0.98]"
            >
              Ask Campus Expert
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Link>
            <Link
              href="/resources"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-7 py-3 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] active:scale-[0.98]"
            >
              Explore Resources
            </Link>
          </div>
        </div>
      </section>

      </div>
      <Footer />
    </>
  );
}
