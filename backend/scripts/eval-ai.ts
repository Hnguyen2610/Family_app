import { spawnSync } from 'child_process';

const evalCommands: Array<[string, string[]]> = [
  [process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/eval-response-sanitizer.ts']],
  [process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/eval-tool-validation.ts']],
];

for (const [command, args] of evalCommands) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args as string[], {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('AI eval suite passed.');
