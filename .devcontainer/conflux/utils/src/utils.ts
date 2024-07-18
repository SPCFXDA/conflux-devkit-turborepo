// Import required modules
import { parse, stringify } from "@iarna/toml"; // For parsing TOML files
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs"; // For file system operations
import { PrivateKeyAccount, Conflux, Drip, address } from "js-conflux-sdk"; // Conflux SDK for blockchain interactions
import path = require("path"); // For handling and transforming file paths
import {
  http,
  createPublicClient,
  defineChain,
  formatEther,
  isAddress,
  Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Define paths and RPC host from environment variables or default values
const configPath: string =
  process.env.CONFIG_PATH || "/opt/conflux/develop.toml";

const configString: string = readFileSync(configPath, "utf-8");
const config: any = parse(configString);

function initConflux(): Conflux {
  return new Conflux({
    url: `http://localhost:${config.jsonrpc_http_port}`,
    networkId: config.chain_id,
  });
}

function isNumeric(value: string): boolean {
  return !isNaN(parseFloat(value)) && isFinite(parseFloat(value));
}

// Main function to list genesis accounts
export async function genesisList(): Promise<void> {
  try {
    // Initialize Conflux instance with RPC URL and network ID from config
    const conflux = initConflux();
    // Read and process the genesis secrets file
    const secrets: string = readFileSync(config.genesis_secrets, "utf-8");

    // Split the secrets file into lines and process each
    let i = 0;
    secrets.split(/\r?\n/).forEach((privateKey: string) => {
      if (privateKey.length) {
        try {
          // Add the private key to Conflux wallet
          const account = conflux.wallet.addPrivateKey(`0x${privateKey}`);

          // Generate eSpace address from the private key
          const eSpaceAddress: string = privateKeyToAccount(
            `0x${privateKey}`,
          ).address;

          // Log account details
          console.group(`\n######  ACCOUNT ${i}  ######`);
          console.warn(`Private Key`.padEnd(14), `: 0x${privateKey}`);
          console.log(`Core Address`.padEnd(14), `: ${account.address}`);
          console.log(`eSpace Address`.padEnd(14), `: ${eSpaceAddress}`);
          console.groupEnd();
          i++;
        } catch (error) {
          console.error(
            `Failed to process private key ${privateKey}:`,
            (error as Error).message,
          );
        }
      }
    });
    conflux.close();
  } catch (error) {
    // Handle errors
    console.error("An error occurred:", (error as Error).message);
    process.exit(1);
  }
}

// Main function to handle the faucet logic
export async function faucet(options: string[]): Promise<void> {
  const secretPath: string =
    process.env.MINER_PATH || "/opt/conflux/mining_secret.txt";
  try {
    // Read secret and config files
    const secretString: string = readFileSync(secretPath, "utf-8");

    // Initialize Conflux instance with RPC URL and network ID from config
    const conflux = initConflux();

    // Validate the connection
    await conflux.cfx.getStatus();
    console.log("Connected to Conflux node");

    // Add miner private key to Conflux wallet and get balance
    const miner = conflux.wallet.addPrivateKey(secretString);
    const balance: string = new Drip(
      await conflux.cfx.getBalance(miner.address),
    ).toCFX();
    console.log(`Faucet balance is ${balance} CFX`);

    // Exit if no arguments are provided
    if (options.length !== 2) {
      console.warn(
        "Please provide the request amount and destination address (faucet <amount> <address>).",
      );
      return;
    }

    // Retrieve request amount and destination address from arguments
    const requestAmount: string = options[0];
    const destinationAddress: string = options[1];

    // Check if the request amount is numeric
    if (!isNumeric(requestAmount)) {
      console.error("Requested amount is not a valid number.");
      return;
    }

    // Check if the request amount exceeds the faucet balance
    if (parseFloat(requestAmount) >= parseFloat(balance)) {
      console.error("Requested amount exceeds faucet balance.");
      return;
    }

    // Check if the destination address is a valid Conflux address
    if (address.isValidCfxAddress(destinationAddress)) {
      // Send transaction to the Conflux address
      await conflux.cfx.sendTransaction({
        from: miner.address,
        to: destinationAddress,
        value: Drip.fromCFX(parseFloat(requestAmount)),
      });
      console.log(
        `${requestAmount} CFX successfully sent to ${destinationAddress}`,
      );
      return;
    }

    // Check if the destination address is a valid Ethereum address
    if (isAddress(destinationAddress)) {
      // Initialize CrossSpaceCall internal contract for cross-space transactions
      const crossSpaceCall = conflux.InternalContract("CrossSpaceCall");

      // Function to handle cross-space call transactions
      async function crossSpaceCallFx(
        eSpaceAddress: string,
        amount: string,
      ): Promise<void> {
        const receipt = await crossSpaceCall
          .transferEVM(eSpaceAddress)
          .sendTransaction({
            from: miner,
            value: Drip.fromCFX(amount),
          })
          .executed();

        // Check transaction outcome status
        if (receipt.outcomeStatus === 0) {
          console.log(`${amount} CFX successfully sent to ${eSpaceAddress}`);
        } else {
          console.error(`Transfer to ${eSpaceAddress} failed.`);
        }
      }

      // Execute cross-space call
      await crossSpaceCallFx(destinationAddress, requestAmount);
      return;
    }

    // Log error if the destination address is invalid
    console.error("Invalid destination address.");
    conflux.close();
  } catch (error: any) {
    // Handle connection error
    if (error.errno === -111) {
      console.warn(
        `Failed to connect to ${error.address}:${error.port}. Have you started the local node with the "dev_node" command?`,
      );
    } else {
      console.error("An error occurred:", error.message);
    }
    process.exit(1);
  }
}

export async function genesisToeSpace(): Promise<void> {
  try {
    // Initialize Conflux instance with RPC URL and network ID from config
    const conflux = initConflux();

    // Validate the connection
    await conflux.cfx.getStatus();
    console.log("Connected to Conflux node");

    // Initialize CrossSpaceCall internal contract for cross-space transactions
    const crossSpaceCall = conflux.InternalContract("CrossSpaceCall");

    // Async function to handle cross-space call transactions
    async function crossSpaceCallFx(privateKey: string): Promise<void> {
      try {
        // Add account to Conflux wallet using the private key
        const account = conflux.wallet.addPrivateKey(`0x${privateKey}`);
        // Generate eSpace address from the private key
        const eSpaceAddress: string = privateKeyToAccount(
          `0x${privateKey}`,
        ).address;

        // Send transaction to transfer 1000 CFX to the eSpace address
        const receipt = await crossSpaceCall
          .transferEVM(eSpaceAddress)
          .sendTransaction({
            from: account,
            value: Drip.fromCFX(1000), // Transfer 1000 CFX
          })
          .executed();

        // Log the result of the transaction
        if (receipt.outcomeStatus === 0) {
          console.log(
            `Transfer from ${account.address} to ${eSpaceAddress} succeeded`,
          );
        } else {
          console.error(
            `Transfer from ${account.address} to ${eSpaceAddress} failed`,
          );
        }
      } catch (error: any) {
        console.error(
          `Failed to process private key ${privateKey}:`,
          error.message,
        );
      }
    }

    // Read and process the genesis secrets file
    const secrets: string = readFileSync(config.genesis_secrets, "utf-8");
    // Split the secrets file into lines and process each line
    secrets.split(/\r?\n/).forEach((line: string) => {
      if (line.length) {
        crossSpaceCallFx(line);
      }
    });
    conflux.close();
  } catch (error: any) {
    // Handle errors
    if (error.errno === -111) {
      console.warn(
        `Failed to connect to ${error.address}:${error.port}. Have you started the local node with the "dev_node" command?`,
      );
    } else {
      console.error("An error occurred:", error.message);
    }
    process.exit(1);
  }
}

export async function genesisSecrets(value: string): Promise<void> {
  try {
    let valueInt: number;
    if (!isNumeric(value)) {
      console.error(`${value} is not a valid number.`);
      return;
    } else {
      valueInt = parseInt(value);
    }

    const genesisSecretsPath = config.genesis_secrets;
    const miningAccountPath = path.join(
      path.dirname(genesisSecretsPath),
      "mining_secret.txt",
    );

    if (existsSync(genesisSecretsPath)) {
      console.log(`The file ${genesisSecretsPath} already exists.`);
      return;
    }

    // Array to store generated private keys
    let secrets: string[] = [];

    // Generate 5 random accounts and store their private keys (without '0x' prefix) in the secrets array
    for (let i = 0; i < valueInt; i++) {
      const randomAccount = PrivateKeyAccount.random(
        // @ts-ignore
        undefined,
        config.chain_id,
      );
      secrets.push(randomAccount.privateKey.replace("0x", ""));
    }

    // Append the generated secrets to the genesis secrets file
    appendFileSync(genesisSecretsPath, secrets.join("\n") + "\n");
    console.log("Secrets generated and appended successfully!");

    // Check if mining account file exists, skip if it does
    if (existsSync(miningAccountPath)) {
      console.log(
        `The file ${miningAccountPath} already exists. Skipping mining account creation.`,
      );
      return;
    }

    // Generate a random mining account
    // @ts-ignore
    const miningAccount = PrivateKeyAccount.random(undefined, config.chain_id);

    // Update the configuration with the new mining account address
    config.mining_author = miningAccount.address;

    // Write the updated configuration back to the config file
    writeFileSync(configPath, stringify(config));
    console.log("Configuration file updated successfully!");

    // Write the mining account's private key to a separate file
    writeFileSync(miningAccountPath, miningAccount.privateKey);
    console.log(
      `Mining account configured successfully! Private key saved to ${miningAccountPath}`,
    );
  } catch (error: any) {
    console.error("An error occurred:", error.message);
    process.exit(1);
  }
}

function viemClient() {
  const dev_node = defineChain({
    id: 2030,
    name: "eSpace",
    nativeCurrency: {
      decimals: 18,
      name: "Conflux",
      symbol: "CFX",
    },
    rpcUrls: {
      default: {
        http: ["http://localhost:8545"],
        webSocket: ["wss://localhost:8546"],
      },
    },
  });

  return createPublicClient({
    chain: dev_node,
    transport: http(),
  });
}

// Main function to handle the balance logic
export async function balance(): Promise<void> {
  try {
    // Initialize Conflux instance with RPC URL and network ID from config
    const conflux = initConflux();

    // Validate the connection
    await conflux.cfx.getStatus();
    console.log("Connected to Conflux node");
    const client = viemClient();

    // Read and process the genesis secrets file
    const secrets: string = readFileSync(config.genesis_secrets, "utf-8");
    // Split the secrets file into lines and process each line
    secrets.split(/\r?\n/).forEach(async (line: string, index: number) => {
      if (line.length) {
        const coreAddress: string = conflux.wallet.addPrivateKey(
          `0x${line}`,
        ).address;
        const eSpaceAddress: string = privateKeyToAccount(`0x${line}`).address;

        const coreBalance: string = new Drip(
          await conflux.cfx.getBalance(coreAddress),
        ).toCFX();
        const eSpaceBalance = formatEther(
          await client.getBalance({ address: eSpaceAddress as Address }),
        );
        console.log(
          "Account",
          index,
          "Core:",
          coreBalance,
          "eSpace:",
          eSpaceBalance,
        );
      }
    });
    conflux.close();
  } catch (error: any) {
    console.error("An error occurred:", error.message);
    process.exit(1);
  }
}
