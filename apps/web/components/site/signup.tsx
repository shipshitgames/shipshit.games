"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const SUBSTACK_URL = process.env.NEXT_PUBLIC_SUBSTACK_URL?.replace(/\/+$/, "") ?? "";
const FORMSPREE_ID = process.env.NEXT_PUBLIC_FORMSPREE_ID ?? "";

type Status = "idle" | "submitting" | "success" | "error";

export function Signup({
  cta = "Subscribe",
  publicationName = "Ship Shit Games newsletter",
  topic,
  successText = "You're in. Check your inbox.",
}: {
  cta?: string;
  publicationName?: string;
  topic?: string;
  successText?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");

  /** Newsletter capture funnel event (#32), tagged with the section topic. */
  function reportSignup(outcome: "intent" | "success" | "error") {
    trackEvent("newsletter_signup", {
      status: outcome,
      ...(topic ? { topic } : {}),
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!FORMSPREE_ID) {
      setStatus("error");
      reportSignup("error");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("failed");
      form.reset();
      setStatus("success");
      reportSignup("success");
    } catch {
      setStatus("error");
      reportSignup("error");
    }
  }

  if (SUBSTACK_URL) {
    return (
      <div className="w-full max-w-xl">
        <div className="overflow-hidden rounded-md border border-hellfire/40 bg-bone shadow-ember">
          <iframe
            title={`${publicationName} signup`}
            src={`${SUBSTACK_URL}/embed`}
            className="h-80 w-full border-0 bg-bone"
            loading="lazy"
            sandbox="allow-forms allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
          >
            <a href={SUBSTACK_URL} target="_blank" rel="noreferrer">
              Read archive
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            className="font-display uppercase tracking-widest shadow-ember"
          >
            <a
              href={`${SUBSTACK_URL}/subscribe`}
              target="_blank"
              rel="noreferrer"
              onClick={() => reportSignup("intent")}
            >
              {cta}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <p className="font-display text-lg uppercase tracking-widest text-hellfire">
        {successText}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      {topic ? <input type="hidden" name="topic" value={topic} /> : null}
      <label htmlFor={`email-${topic ?? "default"}`} className="sr-only">
        Email address
      </label>
      <input
        id={`email-${topic ?? "default"}`}
        type="email"
        name="email"
        required
        autoComplete="email"
        aria-label="Email address"
        placeholder="you@example.com"
        className="flex-1 rounded-md border border-gunmetal bg-coal px-4 py-3 text-bone placeholder:text-ash/60 focus:border-hellfire focus:outline-none"
      />
      <Button
        type="submit"
        size="xl"
        disabled={status === "submitting"}
        className="font-display uppercase tracking-widest shadow-ember"
      >
        {status === "submitting" ? "Sending…" : cta}
      </Button>
      {status === "error" ? (
        <p className="w-full text-sm text-blood">Something went wrong — try again.</p>
      ) : null}
    </form>
  );
}
