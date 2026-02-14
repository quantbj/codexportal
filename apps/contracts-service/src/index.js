import http from "node:http";
import { createRouter } from "./router.js";

const port = Number(process.env.PORT || 3020);
const server = http.createServer(createRouter());

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`contracts-service listening on http://0.0.0.0:${port}\n`);
});
