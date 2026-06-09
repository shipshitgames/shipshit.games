"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

/**
 * Submit button for the Stripe checkout form. Fires the `checkout_start`
 * analytics event on click, then lets the form POST proceed as usual.
 */
export function CheckoutButton({
  onClick,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        trackEvent("checkout_start");
        onClick?.(event);
      }}
    />
  );
}
