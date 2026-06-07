import { assertNoDisallowedDesignDocs } from "../design-guard.ts";
import { flag } from "./args.ts";

export async function runCheckDesignCommand(argv: string[]): Promise<void> {
  const root = flag(argv, "root", process.cwd())!;

  try {
    await assertNoDisallowedDesignDocs(root);
    console.log("[design] ok - no stale frontmatter DESIGN.md copies found");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
