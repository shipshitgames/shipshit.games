export function runNotImplemented(command: string): (argv: string[]) => Promise<void> {
  return async () => {
    console.error(`[${command}] command is not implemented yet.`);
    process.exit(1);
  };
}
