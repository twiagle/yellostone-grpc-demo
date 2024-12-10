import Client, {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeUpdate,
  SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import {
  Message,
  CompiledInstruction,
} from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
const ENDPOINT = "";
const PROGRAM_ID = "721v6F7kPhKoysprtn5d41k6vUYjbsGsQcB4D3Ac8Goc";
const IX_DISCRIMINATOR: Uint8Array = Buffer.from([
  225, 33, 198, 1, 90, 131, 62, 90,
]);
const COMMITMENT = CommitmentLevel.CONFIRMED;
const FILTER_CONFIG = {
  programIds: [PROGRAM_ID],
  instructionDiscriminators: [IX_DISCRIMINATOR],
};
const ACCOUNTS_TO_INCLUDE = [{ name: "mint", index: 0 }];
// Type definitions
interface FormattedTransactionData {
  signature: string;
  slot: string;
  [accountName: string]: string;
}

// Main function
async function main(): Promise<void> {
  const client = new Client(ENDPOINT, undefined, {
    "grpc.max_receive_message_length": 1752460654, // 64MiB
  });
  //   const blockHeight = await client.getBlockHeight();
  //   console.log(blockHeight);
  const stream = await client.subscribe();
  const request = createSubscribeRequest();

  try {
    await sendSubscribeRequest(stream, request);
    console.log("Geyser connection established - watching odyssey open box \n");
    await handleStreamEvents(stream);
  } catch (error) {
    console.error("Error in subscription process:", error);
    stream.end();
  }
}

// Subscribe tx with certain programIds
function createSubscribeRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      odyssey: {
        accountInclude: FILTER_CONFIG.programIds,
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    commitment: COMMITMENT,
    accountsDataSlice: [],
    ping: undefined,
  };
}

function sendSubscribeRequest(
  stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>,
  request: SubscribeRequest
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function handleStreamEvents(
  stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.on("data", handleData);
    stream.on("error", (error: Error) => {
      console.error("Stream error:", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      console.log("Stream ended");
      resolve();
    });
    stream.on("close", () => {
      console.log("Stream closed");
      resolve();
    });
  });
}

function handleData(data: SubscribeUpdate): void {
  if (
    !isSubscribeUpdateTransaction(data) ||
    !data.filters.includes("odyssey")
  ) {
    return;
  }
  const transaction = data.transaction?.transaction;
  const message = transaction?.transaction?.message;
  if (!transaction || !message) {
    return;
  }
  const matchingInstruction = message.instructions.find(
    matchesInstructionDiscriminator
  );
  if (!matchingInstruction) {
    return;
  }
  const formattedSignature = convertSignature(transaction.signature);
  const formattedData = formatData(
    message,
    formattedSignature.base58,
    data.transaction.slot
  );
  if (formattedData) {
    console.table(formattedData);
    console.log("\n");
  }
}
function isSubscribeUpdateTransaction(
  data: SubscribeUpdate
): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
  console.log(data);
  return (
    "transaction" in data &&
    typeof data.transaction === "object" &&
    data.transaction !== null &&
    "slot" in data.transaction &&
    "transaction" in data.transaction
  );
}
function convertSignature(signature: Uint8Array): { base58: string } {
  return { base58: bs58.encode(Buffer.from(signature)) };
}
function formatData(
  message: Message,
  signature: string,
  slot: string
): FormattedTransactionData | undefined {
  const matchingInstruction = message.instructions.find(
    matchesInstructionDiscriminator
  );
  if (!matchingInstruction) {
    return undefined;
  }
  const accountKeys = message.accountKeys;
  const includedAccounts = ACCOUNTS_TO_INCLUDE.reduce<Record<string, string>>(
    (acc, { name, index }) => {
      const accountIndex = matchingInstruction.accounts[index];
      const publicKey = accountKeys[accountIndex];
      acc[name] = new PublicKey(publicKey).toBase58();
      return acc;
    },
    {}
  );
  return { signature, slot, ...includedAccounts };
}
function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
  return (
    ix?.data &&
    FILTER_CONFIG.instructionDiscriminators.some((discriminator) =>
      Buffer.from(discriminator).equals(ix.data.slice(0, 8))
    )
  );
}

main().catch((err) => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});
