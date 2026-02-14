import http from "node:http";
import { createRouter } from "./router.js";
import { Store } from "./store.js";

const port = Number(process.env.PORT || 3020);
const store = await createDataStore();
const server = http.createServer(createRouter({ store }));

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`contracts-service listening on http://0.0.0.0:${port}\n`);
});

async function createDataStore() {
  if (!process.env.MONGODB_URI) {
    return new Store();
  }

  const { MongoStore } = await import("./mongoStore.js");
  const store = new MongoStore();
  await store.initialize();
  process.stdout.write("contracts-service using MongoDB persistence\n");
  return store;
}
