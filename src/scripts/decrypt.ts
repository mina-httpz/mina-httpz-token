import * as crypto from "crypto";

const decryptCipherText = (cipherText: string, password: string): string => {
  try {
    // Decode encrypted data from base64
    const encryptedData = Buffer.from(cipherText, "base64");

    // Extract IV (first 16 bytes)
    const iv = encryptedData.slice(0, 16);

    // Extract encrypted content
    const encryptedContent = encryptedData.slice(16);

    // Generate key from password
    const key = crypto.scryptSync(password, "salt", 32);

    // Create decipher
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    // Decrypt data
    let decrypted = decipher.update(encryptedContent);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // Convert to UTF-8 string
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Decryption failed:", error);
    throw error;
  }
};

async function main() {
  const args = process.argv;
  if (args.length !== 4) {
    console.log(
      "Usage: node build/src/scripts/decrypt.js <ciphertext> <password>"
    );
    process.exit(1);
  }

  const cipherText = args[2];
  const password = args[3];

  try {
    const plaintext = decryptCipherText(cipherText, password);
    console.log("Plain text:", plaintext);
  } catch (error) {
    console.error("Error during decryption:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
