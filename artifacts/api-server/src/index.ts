import { setGlobalDispatcher, ProxyAgent } from "undici";
import app from "./app";
import { logger } from "./lib/logger";

const proxyUrl = process.env["HTTPS_PROXY"] || process.env["HTTP_PROXY"] || process.env["https_proxy"] || process.env["http_proxy"];
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  logger.info({ proxy: proxyUrl.replace(/:[^:@/]*@/, ":***@") }, "HTTP proxy configured for outbound requests");
} else {
  logger.warn("No HTTPS_PROXY configured — direct Lighter API calls may fail if server IP is geo-blocked");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
