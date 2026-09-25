"use client";

import type { EveDynamicToolPart, EveMessage } from "eve/react";
import { useEveAgent } from "eve/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatPrice } from "@/lib/format";

interface ProductCardData {
  slug: string;
  name: string;
  priceCents: number;
  image: string;
}

export function Chat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const router = useRouter();
  const cartReady = useRef<Promise<unknown> | null>(null);

  const agent = useEveAgent({
    // Make sure the browser has a cart cookie before the first message, so the
    // agent's channel can bind the session to that cart.
    async prepareSend(turn) {
      cartReady.current ??= fetch("/api/agent/session", { method: "POST" });
      await cartReady.current;
      return turn;
    },
    // The agent may have changed the cart; refresh server components so the
    // header count and cart page reflect it.
    onFinish: () => router.refresh(),
  });

  const busy = agent.status === "submitted" || agent.status === "streaming";
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [agent.data.messages]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void agent.send(text);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-neutral-800"
      >
        Ask the store
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col rounded-t-2xl bg-white shadow-2xl ring-1 ring-neutral-200 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[600px] sm:w-[400px] sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Northstar assistant</p>
          <p className="text-xs text-neutral-500">Products, sizing, orders, and your cart</p>
        </div>
        <div className="flex gap-3 text-xs text-neutral-500">
          <button type="button" onClick={() => agent.reset()} className="hover:text-neutral-900">
            New chat
          </button>
          <button type="button" onClick={() => setOpen(false)} className="hover:text-neutral-900">
            Close
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {agent.data.messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Try “a jacket under $150”, “does the fleece run small?”, or “add the wool beanie to my cart”.
          </p>
        )}
        {agent.data.messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {agent.error && <p className="text-xs text-red-600">{agent.error.message}</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? "Thinking…" : "Ask about products, sizing, or your order"}
          disabled={busy}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function Message({ message }: { message: EveMessage }) {
  const isUser = message.role === "user";
  // Several tools in one reply can return the same product; show each card once.
  const shown = new Set<string>();
  return (
    <div className={isUser ? "flex justify-end" : "space-y-2"}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return part.text ? (
            <p
              key={index}
              className={
                isUser
                  ? "max-w-[85%] rounded-2xl bg-neutral-900 px-3 py-2 text-sm text-white"
                  : "text-sm leading-relaxed text-neutral-800"
              }
            >
              {part.text}
            </p>
          ) : null;
        }
        if (part.type === "dynamic-tool") return <ToolPart key={part.toolCallId} part={part} shown={shown} />;
        return null;
      })}
    </div>
  );
}

function ToolPart({ part, shown }: { part: EveDynamicToolPart; shown: Set<string> }) {
  const products = productsFrom(part).filter((p) => !shown.has(p.slug));
  products.forEach((p) => shown.add(p.slug));
  if (products.length > 0) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {products.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} className="rounded-lg ring-1 ring-neutral-200 hover:bg-neutral-50">
            <img src={p.image} alt="" className="aspect-square w-full rounded-t-lg" />
            <div className="p-2">
              <p className="truncate text-xs font-medium">{p.name}</p>
              <p className="text-xs text-neutral-500">{formatPrice(p.priceCents)}</p>
            </div>
          </Link>
        ))}
      </div>
    );
  }
  // A product tool whose results were all shown already needs no status line.
  if (productsFrom(part).length > 0) return null;
  const isSkill = part.toolName === "load_skill" || part.toolMetadata?.eve?.kind === "load-skill";
  const label = isSkill ? `Loaded skill: ${skillName(part.input)}` : part.toolName.replaceAll("_", " ");
  return (
    <p className="text-xs text-neutral-400">
      {label}
      {part.state === "output-error" && " failed"}
    </p>
  );
}

function productsFrom(part: EveDynamicToolPart): ProductCardData[] {
  if (part.state !== "output-available" || !part.output || typeof part.output !== "object") return [];
  const output = part.output as { products?: ProductCardData[]; product?: ProductCardData };
  return output.products ?? (output.product ? [output.product] : []);
}

function skillName(input: unknown): string {
  if (input && typeof input === "object") {
    const value = Object.values(input as Record<string, unknown>)[0];
    if (typeof value === "string") return value;
  }
  return "";
}
