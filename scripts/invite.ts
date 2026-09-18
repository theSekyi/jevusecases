import { createInvitedUser, removeUser, resetToTemporaryPassword } from "../src/lib/adminUsers.ts";
import { emailSchema } from "../src/lib/authSchema.ts";

// Run it yourself, in your own terminal — a temporary password is printed once and never stored in plain text:
//   npm run admin:invite -- someone@example.com            create an account
//   npm run admin:invite -- someone@example.com --reset    new temporary password, signs the account out everywhere
//   npm run admin:invite -- someone@example.com --remove   delete the account and all its sessions

const USAGE = "Usage: npm run admin:invite -- <email> [--reset | --remove]";

const [rawEmail, flag] = process.argv.slice(2);

async function main() {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success || (flag && flag !== "--reset" && flag !== "--remove")) {
    console.error(parsed.success ? USAGE : `${USAGE}\n"${rawEmail ?? ""}" isn't a valid email.`);
    process.exit(1);
  }
  const email = parsed.data;

  if (flag === "--remove") {
    if (!(await removeUser(email))) {
      console.error(`No account exists for ${email}.`);
      process.exit(1);
    }
    console.log(`Removed ${email} and every session it had.`);
    return;
  }

  const reset = flag === "--reset";
  const result = reset ? await resetToTemporaryPassword(email) : await createInvitedUser(email);
  if (!result) {
    console.error(
      reset
        ? `No account exists for ${email}. Run again without --reset to create one.`
        : `An account already exists for ${email}. Use --reset to give it a new temporary password.`,
    );
    process.exit(1);
  }

  console.log(`${reset ? "Password reset for" : "Account created for"} ${result.email}`);
  console.log(`Temporary password (shown once — copy it now): ${result.temporaryPassword}`);
  console.log("Sign in at /admin/login. Changing the password afterwards is optional.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
