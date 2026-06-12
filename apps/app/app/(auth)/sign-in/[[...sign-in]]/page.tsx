import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Ship Shit Games account.",
};

export default function SignInPage() {
  return <SignIn />;
}
