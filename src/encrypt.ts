import * as crypto from "crypto";

const encryptText = (plaintext: string, password: string): string => {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    crypto.scryptSync(password, "salt", 32),
    crypto.randomBytes(16)
  );
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
};

async function main() {
  const args = process.argv;
  if (args.length !== 4) {
    console.log("Usage: ts-node encrypt.ts <plaintext> <password>");
    process.exit(1);
  }

  const plaintext = args[2];
  const password = args[3];

  try {
    const encryptedText = encryptText(plaintext, password);
    console.log("Encrypted text:", encryptedText);
  } catch (error) {
    console.error("Error during encryption:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
