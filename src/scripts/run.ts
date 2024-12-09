/**
 * This script can be used to interact with the Add contract, after deploying it.
 *
 * We call the update() method on the contract, create a proof and send it to the chain.
 * The endpoint that we interact with is read from your config.json.
 *
 * This simulates a user interacting with the zkApp from a browser, except that here, sending the transaction happens
 * from the script and we're using your pre-funded zkApp account to pay the transaction fee. In a real web app, the user's wallet
 * would send the transaction and pay the fee.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/run.js <deployAlias> <func>`.
 */
import fs from "fs/promises";
import {
  AccountUpdate,
  Bool,
  Mina,
  NetworkId,
  PrivateKey,
  PublicKey,
  UInt64,
  UInt8,
  Permissions,
  fetchAccount,
} from "o1js";
import { FungibleToken } from "../FungibleToken.js";
import { VaultContract } from "../VaultContract.js";
import { HttpzTokenAdmin } from "../HttpzTokenAdmin.js";
import { CIRCULATION_MAX, TOKEN_DECIMAL, TOKEN_SYMBOL } from "../constants.js";
import * as crypto from "crypto";

// check command line arg
let deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument.

Usage:
node build/src/run.js <deployAlias>
`);
Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = "testnet";

let func = process.argv.length >= 4 ? process.argv[3] : undefined;
if (!func) {
  func = "deployToken";
}

let pwd = process.argv.length >= 5 ? process.argv[4] : undefined;

// parse config and private key from file
type Config = {
  deployAliases: Record<
    string,
    {
      networkId?: string;
      url: string;
      keyPath: string;
      fee: string;
    }
  >;
};
let configJson: Config = JSON.parse(await fs.readFile("config.json", "utf8"));
let config = configJson.deployAliases[deployAlias];

let keysBase58: {
  adminContract: { privateKey: string; publicKey: string };
  feepayer: { privateKey: string; publicKey: string };
  tokenContract: { privateKey: string; publicKey: string };
  vaultContract: { privateKey: string; publicKey: string };
  manager: { privateKey: string; publicKey: string };
} = JSON.parse(await fs.readFile(config.keyPath, "utf8"));

console.log("keyBase58: ", keysBase58);

// Add decryption function
const decryptPrivateKey = (
  encryptedPrivateKey: string,
  password: string
): string => {
  try {
    // Decode the full encrypted data from Base64 string
    const encryptedData = Buffer.from(encryptedPrivateKey, "base64");

    // Extract IV (first 16 bytes)
    const iv = encryptedData.slice(0, 16);

    // Extract encrypted content
    const encryptedContent = encryptedData.slice(16);

    // Generate key using password
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

// Modify the key loading section
let feepayerKey = pwd
  ? PrivateKey.fromBase58(
      decryptPrivateKey(keysBase58.feepayer.privateKey, pwd)
    )
  : PrivateKey.fromBase58(keysBase58.feepayer.privateKey);

let tokenContractKey = pwd
  ? PrivateKey.fromBase58(
      decryptPrivateKey(keysBase58.tokenContract.privateKey, pwd)
    )
  : PrivateKey.fromBase58(keysBase58.tokenContract.privateKey);

let adminContractKey = pwd
  ? PrivateKey.fromBase58(
      decryptPrivateKey(keysBase58.adminContract.privateKey, pwd)
    )
  : PrivateKey.fromBase58(keysBase58.adminContract.privateKey);

let vaultContractKey = pwd
  ? PrivateKey.fromBase58(
      decryptPrivateKey(keysBase58.vaultContract.privateKey, pwd)
    )
  : PrivateKey.fromBase58(keysBase58.vaultContract.privateKey);

let managerKey = pwd
  ? PrivateKey.fromBase58(decryptPrivateKey(keysBase58.manager.privateKey, pwd))
  : PrivateKey.fromBase58(keysBase58.manager.privateKey);

// set up Mina instance and contract we interact with
const Network = Mina.Network({
  // We need to default to the testnet networkId if none is specified for this deploy alias in config.json
  // This is to ensure the backward compatibility.
  networkId: (config.networkId ?? DEFAULT_NETWORK_ID) as NetworkId,
  mina: config.url,
});
// const Network = Mina.Network(config.url);
const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
Mina.setActiveInstance(Network);
let managerAddress = managerKey.toPublicKey();
let feepayerAddress = feepayerKey.toPublicKey();
let tokenContractAddress = tokenContractKey.toPublicKey();
let adminContractAddress = adminContractKey.toPublicKey();
let vaultContractAddress = vaultContractKey.toPublicKey();

let tokenContract = new FungibleToken(tokenContractAddress);
let tokenId = tokenContract.deriveTokenId();
let adminContract = new HttpzTokenAdmin(adminContractAddress);
let vaultContract = new VaultContract(vaultContractAddress, tokenId);

// compile the contracts to create prover keys
console.log("Start compiling contracts...");

console.time("Compile adminContract");
const { verificationKey: adminContractVk } = await HttpzTokenAdmin.compile();
console.log("adminContract vk hash:", adminContractVk.hash.toString());
console.timeEnd("Compile adminContract");

console.time("Compile tokenContract");
const { verificationKey: tokenContractVk } = await FungibleToken.compile();
console.log("tokenContract vk hash:", tokenContractVk.hash.toString());
console.timeEnd("Compile tokenContract");

console.time("Compile vaultContract");
const { verificationKey: vaultContractVk } = await VaultContract.compile();
console.log("vaultContract vk hash:", vaultContractVk.hash.toString());
console.timeEnd("Compile vaultContract");

FungibleToken.AdminContract = HttpzTokenAdmin;

if (func == "deployToken") {
  console.log("func: deployToken");

  try {
    console.log("deploy token...");
    console.time("Deploy token computation");

    let tx = await Mina.transaction(
      { sender: feepayerAddress, fee, memo: "deploy token and admin" },
      async () => {
        AccountUpdate.fundNewAccount(feepayerAddress, 3);

        await adminContract.deploy({ adminPublicKey: managerAddress });
        await tokenContract.deploy({
          symbol: TOKEN_SYMBOL,
          src: "https://github.com/mina-httpz/mina-httpz-token",
        });
        await tokenContract.initialize(
          adminContractAddress,
          UInt8.from(TOKEN_DECIMAL),
          Bool(false)
        );
      }
    );
    await tx.prove();
    console.timeEnd("Deploy token computation");

    console.log("send token deploy transaction...");
    const sentTx = await tx
      .sign([feepayerKey, adminContractKey, tokenContractKey])
      .send();
    if (sentTx.status === "pending") {
      console.log(
        "\nSuccess! Token deploy transaction sent.\n" +
          "\nYour smart contract state will be updated" +
          "\nas soon as the transaction is included in a block:" +
          `\n${getTxnUrl(config.url, sentTx.hash)}`
      );
    }
  } catch (err) {
    console.log(err);
  }
} else if (func == "deployVault") {
  console.log("func: deployVault");

  try {
    console.log("deploy vault...");
    console.time("Deploy vault computation");

    let tx = await Mina.transaction(
      { sender: feepayerAddress, fee, memo: "deploy vault" },
      async () => {
        AccountUpdate.fundNewAccount(feepayerAddress, 1);

        await vaultContract.deploy({ admin: managerAddress });
        await tokenContract.approveAccountUpdate(vaultContract.self);
      }
    );
    await tx.prove();
    console.timeEnd("Deploy vault computation");

    console.log("send vault deploy transaction...");
    const sentTx = await tx.sign([feepayerKey, vaultContractKey]).send();
    if (sentTx.status === "pending") {
      console.log(
        "\nSuccess! Vault deploy transaction sent.\n" +
          "\nYour smart contract state will be updated" +
          "\nas soon as the transaction is included in a block:" +
          `\n${getTxnUrl(config.url, sentTx.hash)}`
      );
    }
  } catch (err) {
    console.log(err);
  }
} else if (func == "mint") {
  console.log("func: mint");

  try {
    console.log("mint token...");
    console.time("Mint token computation");

    let tx = await Mina.transaction(
      { sender: feepayerAddress, fee, memo: "mint tokens" },
      async () => {
        AccountUpdate.fundNewAccount(feepayerAddress, 1);
        await tokenContract.mint(
          vaultContractAddress,
          UInt64.from(CIRCULATION_MAX)
        );
      }
    );
    await tx.prove();
    console.timeEnd("Mint token computation");

    console.log("send token mint transaction...");
    const sentTx = await tx.sign([feepayerKey, managerKey]).send();
    if (sentTx.status === "pending") {
      console.log(
        "\nSuccess! Token mint transaction sent.\n" +
          "\nYour smart contract state will be updated" +
          "\nas soon as the transaction is included in a block:" +
          `\n${getTxnUrl(config.url, sentTx.hash)}`
      );
    }
  } catch (err) {
    console.log(err);
  }
} else if (func === "claim") {
  console.log("func: claim tokens");

  try {
    console.log("claim tokens...");
    console.time("Claim tokens computation");

    let tx = await Mina.transaction(
      { sender: feepayerAddress, fee, memo: "claim test" },
      async () => {
        AccountUpdate.fundNewAccount(feepayerAddress, 1);
        let userAU = await vaultContract.claim(managerAddress);
        await tokenContract.approveAccountUpdates([vaultContract.self, userAU]);
      }
    );
    await tx.prove();
    console.timeEnd("Claim tokens computation");

    console.log("send token claim transaction...");
    const sentTx = await tx.sign([feepayerKey]).send();
    if (sentTx.status === "pending") {
      console.log(
        "\nSuccess! Token claim transaction sent.\n" +
          "\nYour smart contract state will be updated" +
          "\nas soon as the transaction is included in a block:" +
          `\n${getTxnUrl(config.url, sentTx.hash)}`
      );
    }
  } catch (err) {
    console.log(err);
  }
} else {
  console.log("update vk not available");
  // console.log("Update Vk");

  // try {
  //   await fetchAccount({ publicKey: tokenContractAddress });
  //   let tx = await Mina.transaction(
  //     { sender: feepayerAddress, fee, memo: "update vk" },
  //     async () => {
  //       //await tokenContract.updateVerificationKey(tokenContractTestVk);

  //       const accountUpdate = AccountUpdate.createSigned(tokenContractAddress);
  //       accountUpdate.account.permissions.set({
  //         ...Permissions.default(),
  //       });
  //     }
  //   );
  //   //await tx.prove();

  //   const sentTx = await tx.sign([feepayerKey, tokenContractKey]).send();
  //   if (sentTx.status === "pending") {
  //     console.log(
  //       "\nSuccess! Update vk transaction sent.\n" +
  //         "\nYour smart contract state will be updated" +
  //         "\nas soon as the transaction is included in a block:" +
  //         `\n${getTxnUrl(config.url, sentTx.hash)}`
  //     );
  //   }
  // } catch (err) {
  //   console.log(err);
  // }
}

function getTxnUrl(graphQlUrl: string, txnHash: string | undefined) {
  const hostName = new URL(graphQlUrl).hostname;
  const txnBroadcastServiceName = hostName
    .split(".")
    .filter((item) => item === "minascan")?.[0];
  const networkName = graphQlUrl
    .split("/")
    .filter((item) => item === "mainnet" || item === "devnet")?.[0];
  if (txnBroadcastServiceName && networkName) {
    return `https://minascan.io/${networkName}/tx/${txnHash}?type=zk-tx`;
  }
  return `Transaction hash: ${txnHash}`;
}
