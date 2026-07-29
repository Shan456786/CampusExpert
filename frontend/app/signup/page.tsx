"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  User,
  IdCard,
  Mail,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  Building2,
  BookOpen,
  PlayCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";
import {
  API_BASE_URL,
  parseApiErrorField,
  parseApiErrorMessage,
  storeSession,
  type AuthApiResponse,
} from "@/lib/auth";
import { describeNetworkError } from "@/lib/errors";

interface FormValues {
  fullName: string;
  registrationNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  fullName?: string;
  registrationNumber?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const featureHighlights = [
  {
    icon: GraduationCap,
    label: "Academic Guidance",
  },
  {
    icon: Building2,
    label: "Hostel & Campus Support",
  },
  {
    icon: BookOpen,
    label: "Verified Student Resources",
  },
];

// Google sign-up was removed from this page during the pre-demo audit -
// there's no OAuth flow wired up behind it, so the button looked
// functional but did nothing when clicked.

const initialValues: FormValues = {
  fullName: "",
  registrationNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
};

// Keys of FormErrors that the backend can name in its {field, message}
// error responses (see backend/app/api/auth.py's _error_detail()). Used to
// narrow parseApiErrorField()'s generic string return into a valid
// FormErrors key before assigning it.
const FIELD_ERROR_KEYS = [
  "fullName",
  "registrationNumber",
  "email",
  "password",
] as const;

function isFieldErrorKey(field: string | null): field is keyof FormErrors {
  return (FIELD_ERROR_KEYS as readonly string[]).includes(field ?? "");
}

export default function SignupPage() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (formError) setFormError(null);
  };

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const registrationPattern = /^[A-Za-z0-9]{6,}$/;

    if (!values.fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!values.registrationNumber.trim()) {
      nextErrors.registrationNumber = "Registration number is required.";
    } else if (!registrationPattern.test(values.registrationNumber.trim())) {
      nextErrors.registrationNumber = "Enter a valid registration number.";
    }

    if (!values.email.trim()) {
      nextErrors.email = "VIT email address is required.";
    } else if (!emailPattern.test(values.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!values.password) {
      nextErrors.password = "Password is required.";
    } else if (values.password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    if (!values.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.fullName.trim(),
          registration_number: values.registrationNumber.trim(),
          email: values.email.trim(),
          password: values.password,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const field = parseApiErrorField(data?.detail);
        const message = parseApiErrorMessage(data?.detail);
        if (isFieldErrorKey(field)) {
          setErrors((prev) => ({ ...prev, [field]: message }));
        } else {
          setFormError(message);
        }
        return;
      }

      storeSession(data as AuthApiResponse);
      router.push("/chat");
    } catch (error) {
      console.error("Signup request failed:", error);
      setFormError(describeNetworkError());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[var(--surface)]">
      {/* Left panel — hidden on mobile and tablet */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-[var(--surface-subtle)] px-12 py-12 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#A78BFA]/20 blur-[100px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#6D28D9]/15 blur-[100px]"
        />

        <div className="relative animate-[fadeIn_0.4s_ease-out]">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
              <Sparkles className="h-6 w-6 text-white" strokeWidth={2} />
            </span>
            <span className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Campus Expert
            </span>
          </a>

          <h1 className="mt-12 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
            Join Campus Expert
          </h1>
          <p className="mt-3 max-w-sm text-base leading-relaxed text-[var(--text-secondary)]">
            Create your account and unlock your AI-powered campus assistant.
          </p>

          <div className="mt-10 flex flex-col gap-3">
            {featureHighlights.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#6D28D9] hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-subtle)] text-[#6D28D9]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-sm font-medium text-[var(--text-secondary)]">
          Built for VIT AP Students
        </p>
      </div>

      {/* Right panel — signup card */}
      <div className="flex w-full flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:w-[55%]">
        <div className="w-full max-w-md animate-[fadeIn_0.4s_ease-out]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-lg shadow-[#111827]/5 sm:p-10">
            {/* Card header */}
            <div className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6D28D9] shadow-sm shadow-[#6D28D9]/20">
                <Sparkles className="h-6 w-6 text-white" strokeWidth={2} />
              </span>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                Create Account
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Start your Campus Expert journey
              </p>
            </div>

            {/* Form */}
            <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600"
                >
                  {formError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Full Name
                </label>
                <div
                  className={`flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-200 ${
                    errors.fullName
                      ? "border-red-400 focus-within:ring-4 focus-within:ring-red-100"
                      : "border-[var(--border)] focus-within:border-[#6D28D9] focus-within:ring-4 focus-within:ring-[#6D28D9]/10"
                  }`}
                >
                  <User className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={values.fullName}
                    onChange={(event) => updateField("fullName", event.target.value)}
                    aria-invalid={Boolean(errors.fullName)}
                    aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    placeholder="Your full name"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                  />
                </div>
                {errors.fullName && (
                  <p id="fullName-error" role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.fullName}
                  </p>
                )}
              </div>

              {/* Registration Number */}
              <div>
                <label
                  htmlFor="registrationNumber"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
                >
                  Registration Number
                </label>
                <div
                  className={`flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-200 ${
                    errors.registrationNumber
                      ? "border-red-400 focus-within:ring-4 focus-within:ring-red-100"
                      : "border-[var(--border)] focus-within:border-[#6D28D9] focus-within:ring-4 focus-within:ring-[#6D28D9]/10"
                  }`}
                >
                  <IdCard className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
                  <input
                    id="registrationNumber"
                    name="registrationNumber"
                    type="text"
                    autoComplete="off"
                    value={values.registrationNumber}
                    onChange={(event) => updateField("registrationNumber", event.target.value)}
                    aria-invalid={Boolean(errors.registrationNumber)}
                    aria-describedby={
                      errors.registrationNumber ? "registrationNumber-error" : undefined
                    }
                    placeholder="e.g. 21BCE1234"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                  />
                </div>
                {errors.registrationNumber && (
                  <p id="registrationNumber-error" role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.registrationNumber}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  VIT Email Address
                </label>
                <div
                  className={`flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-200 ${
                    errors.email
                      ? "border-red-400 focus-within:ring-4 focus-within:ring-red-100"
                      : "border-[var(--border)] focus-within:border-[#6D28D9] focus-within:ring-4 focus-within:ring-[#6D28D9]/10"
                  }`}
                >
                  <Mail className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={values.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    placeholder="yourname@vitstudent.ac.in"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                  />
                </div>
                {errors.email && (
                  <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
                  Password
                </label>
                <div
                  className={`flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-200 ${
                    errors.password
                      ? "border-red-400 focus-within:ring-4 focus-within:ring-red-100"
                      : "border-[var(--border)] focus-within:border-[#6D28D9] focus-within:ring-4 focus-within:ring-[#6D28D9]/10"
                  }`}
                >
                  <Lock className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={values.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    placeholder="Create a password"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors duration-200 hover:text-[#6D28D9]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
                >
                  Confirm Password
                </label>
                <div
                  className={`flex items-center gap-2.5 rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 transition-all duration-200 ${
                    errors.confirmPassword
                      ? "border-red-400 focus-within:ring-4 focus-within:ring-red-100"
                      : "border-[var(--border)] focus-within:border-[#6D28D9] focus-within:ring-4 focus-within:ring-[#6D28D9]/10"
                  }`}
                >
                  <Lock className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={2} aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={values.confirmPassword}
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={
                      errors.confirmPassword ? "confirmPassword-error" : undefined
                    }
                    placeholder="Re-enter your password"
                    className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    aria-pressed={showConfirmPassword}
                    className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors duration-200 hover:text-[#6D28D9]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p id="confirmPassword-error" role="alert" className="mt-1.5 text-xs text-red-600">
                    {errors.confirmPassword}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button type="submit" fullWidth loading={isSubmitting} className="mt-1">
                Create Account
              </Button>
            </form>

            {/* Divider */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">or</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            {/* Try Demo - no account needed. Points at app/demo/page.tsx,
                which creates a fresh, throwaway demo account and drops the
                visitor straight into /chat with sample data already
                loaded. */}
            <Link
              href="/demo"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9] active:scale-[0.98]"
            >
              <PlayCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Try Demo Instead
            </Link>

            {/* Sign in */}
            <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-[#6D28D9] transition-colors duration-200 hover:text-[#7C3AED]"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
