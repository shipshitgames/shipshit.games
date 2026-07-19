import { createAccessToken } from "./access-token";
import { appUrl } from "./urls";

export function createSkillsProAccessUrl(userId: string, email: string) {
  const token = createAccessToken({
    sub: userId,
    email,
    resource: "skills-pro",
  });
  const url = new URL("/api/access/skills-pro", appUrl());
  url.searchParams.set("token", token);
  return url.toString();
}
