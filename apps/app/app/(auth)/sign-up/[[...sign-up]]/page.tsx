import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your Ship Shit Games account.",
};

export default function SignUpPage() {
  return <SignUp />;
}
