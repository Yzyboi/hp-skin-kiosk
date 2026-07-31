#!/usr/bin/env node
// Generates a bcrypt hash for ADMIN_PASSWORD_HASH.
// Usage: npm run hash-password -- "your-new-password"
// (prompts interactively if no argument is given)

const bcrypt = require("bcryptjs");
const readline = require("readline");

async function main() {
  const argPassword = process.argv[2];
  const password = argPassword || (await promptHidden("Enter admin password: "));

  if (!password) {
    console.error("No password provided.");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);
  console.log("\nAdd this to your .env (or host env var dashboard):\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

main();
