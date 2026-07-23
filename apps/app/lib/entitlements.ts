import type { User } from "@clerk/nextjs/server";

export type {
  BillingEntitlements,
  SkillsProOneTimeEntitlement,
  StudioPassEntitlement,
} from "@shipshitgames/shared";
export {
  hasActiveStudioPass,
  hasSkillsProContentAccess,
  hasStudioPassAccess,
} from "@shipshitgames/shared";

export function primaryEmail(user: User | null | undefined) {
  return (
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.at(0)?.emailAddress ??
    null
  );
}
