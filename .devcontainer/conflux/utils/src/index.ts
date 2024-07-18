#!/usr/bin/env node
import { Command } from "commander";
import {
  genesisList,
  faucet,
  genesisToeSpace,
  genesisSecrets,
  balance,
} from "./utils";
const program = new Command();

program
  .version("0.1.0")
  .description("DevKit CLI utils")
  .option("-l, --list", "List genesis accounts")
  .option("-b, --balance", "Balance of the genesis accounts")
  .option("-f, --faucet [value...]", "Faucet <amount> <address>")
  .option("-e, --eSpaceGenesis", "Transfer from Core genesis address to eSpace")
  .option("-g, --generateGenesis [value]", "Generate genesis addresses")
  .parse(process.argv);

const options = program.opts();

if (options.list) {
  // console.log(options.list)
  genesisList();
}

if (options.faucet) {
  faucet(options.faucet);
}

if (options.eSpaceGenesis) {
  genesisToeSpace();
}

if (options.generateGenesis) {
  let value = options.generateGenesis == true ? "5" : options.generateGenesis;
  genesisSecrets(value);
}

if (options.balance) {
  balance();
}

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
