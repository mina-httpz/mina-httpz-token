import { PrivateKey } from "o1js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEY_MAPPING = {
  token: "tokenContract",
  admin: "adminContract",
  feepayer: "feepayer",
  vault: "vaultContract",
  manager: "manager",
};

const encryptPrivateKey = (privateKey: string, password: string): string => {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    crypto.scryptSync(password, "salt", 32),
    crypto.randomBytes(16)
  );
  let encrypted = cipher.update(privateKey, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
};

// Define a type for valid key names (replacing 定义一个类型来表示有效的密钥名称)
type KeyName = keyof typeof KEY_MAPPING;

// Generate new keypair
function generateNewKeypair() {
  const privateKey = PrivateKey.random();
  return {
    privateKey: privateKey.toBase58(),
    publicKey: privateKey.toPublicKey().toBase58(),
  };
}

// Update key
function updateKey(keyName: KeyName, keys: any, pwd?: string) {
  const mappedKeyName = KEY_MAPPING[keyName];
  let newKeypair = generateNewKeypair();
  console.log("heere");
  if (
    mappedKeyName === "tokenContract" &&
    newKeypair.publicKey.slice(-5) !== "httpz"
  ) {
    // Generate keypair until public key ends with httpz
    let found = false;
    console.time("findkey");
    while (!found) {
      console.log("find key...");
      newKeypair = generateNewKeypair();
      if (newKeypair.publicKey.slice(-5) === "httpz") {
        found = true;
        console.log("find key success");
        console.timeEnd("findkey");
      }
    }
  }

  if (pwd) {
    const encryptedPrivateKey = encryptPrivateKey(newKeypair.privateKey, pwd);
    newKeypair.privateKey = encryptedPrivateKey;
  }
  keys[mappedKeyName] = newKeypair;
  return keys;
}

async function main() {
  const args = process.argv;
  if (args.length < 3) {
    console.log(
      "Please provide key type to update: token | admin | feepayer | vault | manager | all | nofeepayer"
    );
    process.exit(1);
  }

  const deployAlias = args[2];

  const KEYS_PATH = path.join(__dirname, "../../keys/" + deployAlias + ".json");

  const keyType = args[3].toLowerCase();
  console.log("keyType: ", keyType);

  let pwd = undefined;
  if (args.length == 5) {
    pwd = args[4];
  }

  // Read existing devnet.json file
  let keys: Record<string, any>;
  try {
    const keysData = fs.readFileSync(KEYS_PATH, "utf8");
    keys = JSON.parse(keysData);
  } catch (error) {
    console.error("Unable to read " + deployAlias + ".json file");
    process.exit(1);
  }

  if (keyType === "all") {
    (Object.keys(KEY_MAPPING) as KeyName[]).forEach((type) => {
      keys = updateKey(type, keys, pwd);
    });
    console.log("All keys have been updated");
  } else if (keyType === "nofeepayer") {
    (Object.keys(KEY_MAPPING) as KeyName[]).forEach((type) => {
      if (type !== KEY_MAPPING.feepayer) {
        keys = updateKey(type, keys, pwd);
      }
    });
    console.log("All keys except feepayer have been updated");
  } else if (Object.keys(KEY_MAPPING).includes(keyType)) {
    keys = updateKey(keyType as KeyName, keys, pwd);
    console.log(`${KEY_MAPPING[keyType as KeyName]} key has been updated`);
  } else {
    console.log("Invalid key type");
    process.exit(1);
  }

  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
