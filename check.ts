import { PolynanceClient } from "./src/index";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ExecuteOrderParams } from "./src/core/types";
const targetEventSlug = "will-google-have-the-top-ai-model-on-may-31";
const api = "http://localhost:9000";
const priceFeedAddress = "";
const forkPolygonRpc = "http://localhost:8545";
const testPrivateKey = "0xabcb64d0dac49f551b8180f7c7f86cc43b63868a74d2964910ca87c155133242";


async function main() {
    const wallet = new Wallet(testPrivateKey, new JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/cidppsnxqV4JafKXVW7qd9N2x6wTvTpN"));
    const client = new PolynanceClient({apiBaseUrl: api, wallet});
    const market = await client.getExchangeBySlug(targetEventSlug);
    console.log("1.", JSON.stringify(market, null, 2));
    const orders = [
        {
            marketIdOrSlug: targetEventSlug,
            positionIdOrName: "YES",
            buyOrSell: "BUY",
            inOrOutAmount: 5,
        },
        {
            marketIdOrSlug: targetEventSlug,
            positionIdOrName: "YES",
            buyOrSell: "SELL",
            inOrOutAmount: 5,
        }
    ] as ExecuteOrderParams[];
    for(const order of orders) {
        const signedOrder = await client.buildOrder(order);
        console.log("2.", JSON.stringify(signedOrder, null, 2));
        console.log("\n\n");
        console.log("size", signedOrder.takerAmount);
        console.log("pay", signedOrder.makerAmount);
    }
    // await client.executeOrder(order);

}
main();

