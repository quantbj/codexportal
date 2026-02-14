import http from "node:http";
import { createRouter } from "./router.js";

const port = Number(process.env.PORT || 3010);
const router = createRouter();
const server = http.createServer(router);

// Starts the external pricing component.
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`pricing-service listening on http://0.0.0.0:${port}\n`);
});
