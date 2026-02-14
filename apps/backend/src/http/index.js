import { createServer } from "./server.js";

const port = Number(process.env.PORT || 3001);
const server = createServer();

// Starts the backend API listener for local development and deployment.
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`backend listening on http://0.0.0.0:${port}\n`);
});
