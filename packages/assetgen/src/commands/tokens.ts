import { runTokens } from "../tokens.ts";
import { flag, has } from "./args.ts";

export async function runTokensCommand(argv: string[]): Promise<void> {
  const res = await runTokens({
    check: has(argv, "check"),
    design: flag(argv, "design"),
    assetsDir: flag(argv, "assets-dir"),
    log: (m) => console.log(m),
  });
  if (res.drift) {
    console.error("[tokens] drift detected — commit the regenerated artifacts.");
    process.exit(1);
  }
}
