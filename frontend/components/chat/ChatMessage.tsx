import { memo, type ReactNode } from "react";
import { Bot, RotateCw, User } from "lucide-react";
import SourceCard, { type Source } from "./SourceCard";

export type ChatRole = "user" | "assistant";

export interface ChatMessageData {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  sources?: Source[];
  // Set only on a synthetic assistant message created when a real send
  // failed (see app/chat/page.tsx's sendToBackend) - content is already a
  // friendly, non-technical explanation (see lib/errors.ts), never a raw
  // exception. onRetry re-attempts the exact same question without
  // re-adding a duplicate user bubble.
  isError?: boolean;
  onRetry?: () => void;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Renders bold (**text**) and inline code (`code`) within a line of text.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${index}`} className="font-semibold text-[var(--text-primary)]">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-c-${index}`}
          className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[13px] text-[#6D28D9]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }

    index += 1;
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Minimal, dependency-free markdown renderer supporting the subset of
// syntax Campus Expert answers use: paragraphs, bold, inline code, fenced
// code blocks, bullet/numbered lists and simple tables.
function renderContent(content: string): ReactNode {
  const blocks = content.trim().split(/\n\n+/);

  return blocks.map((rawBlock, blockIndex) => {
    const key = `block-${blockIndex}`;
    const block = rawBlock.trim();

    if (block.startsWith("```")) {
      const lines = block.split("\n");
      const hasClosingFence = lines.length > 1 && lines[lines.length - 1].trim() === "```";
      const code = lines.slice(1, hasClosingFence ? -1 : undefined).join("\n");
      return (
        <pre
          key={key}
          className="my-2 overflow-x-auto rounded-xl bg-[#111827] p-4 text-[13px] leading-relaxed text-white"
        >
          <code>{code}</code>
        </pre>
      );
    }

    const lines = block.split("\n").filter((line) => line.trim().length > 0);

    const isTableSeparator =
      lines[1] !== undefined && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[1]);

    if (lines.length >= 2 && lines[0].includes("|") && isTableSeparator) {
      const parseRow = (row: string) =>
        row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

      const header = parseRow(lines[0]);
      const bodyRows = lines.slice(2).map(parseRow);

      return (
        <div key={key} className="my-2 overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--surface-subtle)]">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} className="px-4 py-2 font-semibold text-[var(--text-primary)]">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-[var(--border)]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-2 text-[var(--text-tertiary)]">
                      {renderInline(cell, `${key}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (lines.length > 0 && lines.every((line) => /^[-•]\s+/.test(line))) {
      return (
        <ul key={key} className="my-2 list-disc space-y-1.5 pl-5 marker:text-[#A78BFA]">
          {lines.map((line, lineIndex) => (
            <li key={lineIndex} className="text-[15px] leading-relaxed text-[var(--text-primary)]">
              {renderInline(line.replace(/^[-•]\s+/, ""), `${key}-${lineIndex}`)}
            </li>
          ))}
        </ul>
      );
    }

    if (lines.length > 0 && lines.every((line) => /^\d+\.\s+/.test(line))) {
      return (
        <ol key={key} className="my-2 list-decimal space-y-1.5 pl-5 marker:text-[#6D28D9]">
          {lines.map((line, lineIndex) => (
            <li key={lineIndex} className="text-[15px] leading-relaxed text-[var(--text-primary)]">
              {renderInline(line.replace(/^\d+\.\s+/, ""), `${key}-${lineIndex}`)}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <p key={key} className="text-[15px] leading-relaxed text-[var(--text-primary)]">
        {renderInline(lines.join(" "), key)}
      </p>
    );
  });
}

function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex animate-[fadeIn_0.3s_ease-out] items-start gap-3 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-[#111827] text-white" : "bg-[#6D28D9] text-white"
        }`}
      >
        {isUser ? <User className="h-4 w-4" strokeWidth={2} /> : <Bot className="h-4 w-4" strokeWidth={2} />}
      </span>

      <div
        className={`flex max-w-[85%] flex-col gap-2 sm:max-w-[75%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-3 shadow-sm ${
            isUser
              ? "rounded-tr-sm bg-[#6D28D9] text-white"
              : message.isError
                ? "rounded-tl-sm border border-red-200 bg-red-50 text-red-700"
                : "rounded-tl-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"
          }`}
        >
          <div className={isUser ? "[&_*]:text-white" : ""}>{renderContent(message.content)}</div>
        </div>

        {!isUser && message.isError && message.onRetry && (
          <button
            type="button"
            onClick={message.onRetry}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-all duration-200 hover:scale-[1.03] hover:border-[#6D28D9] hover:text-[#6D28D9] active:scale-[0.98]"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Retry
          </button>
        )}

        <span className="px-1 text-xs text-[var(--text-secondary)]">{formatTimestamp(message.timestamp)}</span>

        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized: chat/page.tsx re-renders this list on every `isTyping` toggle
// (the "Campus Expert is thinking..." indicator) even though no message
// content changed. Each `message` object is only replaced when its own
// content actually changes, so memo lets every already-rendered bubble
// skip re-parsing its markdown and re-rendering its source cards on ticks
// that belong to a different message (or no message at all).
export default memo(ChatMessage);
