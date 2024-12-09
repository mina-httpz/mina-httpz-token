import * as crypto from "crypto";

const encryptText = (plaintext: string, password: string): string => {
  // Generate random IV
  const iv = crypto.randomBytes(16);

  // Generate key from password
  const key = crypto.scryptSync(password, "salt", 32);

  // Create cipher
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  // Encrypt data
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Combine IV and encrypted content
  const encryptedData = Buffer.concat([iv, encrypted]);

  // Convert to base64 format
  return encryptedData.toString("base64");
};

async function main() {
  const args = process.argv;
  if (args.length !== 4) {
    console.log(
      "Usage: node build/src/scripts/encrypt.js <plaintext> <password>"
    );
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
