"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

/**
 * Submit button for the Stripe checkout form. Fires the `checkout_start`
 * analytics event on click — tagged with the `plan` so the buy step is
 * attributable, and carrying any UTM super-properties registered at init
 * (#32) — then lets the form POST proceed as usual.
 */
export function CheckoutButton({
  plan,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { plan?: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        trackEvent("checkout_start", plan ? { plan } : undefined);
        onClick?.(event);
      }}
    />
  );
}
