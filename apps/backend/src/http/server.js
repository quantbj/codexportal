import http from "node:http";
import { createRouter } from "./router.js";

/**
 * Creates the HTTP server bound to the configured router.
 */
export function createServer(dependencies = {}) {
  const router = createRouter(dependencies);
  return http.createServer(router);
}
