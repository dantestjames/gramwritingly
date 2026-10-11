import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { authHook, HttpError, type Deps } from "./lib/context.js";
import { aiRoutes } from "./routes/ai.js";
import { authRoutes } from "./routes/auth.js";
import { checkRoutes } from "./routes/check.js";
import { dataRoutes } from "./routes/data.js";
import { plagiarismRoutes } from "./routes/plagiarism.js";
import { AiNotConfiguredError } from "./services/ai.js";
import { QuotaError } from "./services/usage.js";

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ? { level: "info", redact: ["req.headers.authorization"] } : false,
    bodyLimit: 4 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Web app, browser extensions and the desktop app (Tauri) may call the API.
      if (
        !origin ||
        origin === deps.config.webOrigin ||
        /^(chrome|moz|safari-web)-extension:\/\//.test(origin) ||
        /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/.test(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin)
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  app.decorateRequest("user", null);
  app.addHook("preHandler", authHook(deps));

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_request", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof QuotaError) {
      return reply.code(402).send({ error: err.limit === 0 ? "pro_required" : "quota", message: err.message });
    }
    if (err instanceof AiNotConfiguredError) return reply.code(503).send({ error: "ai_not_configured", message: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: "request_error", message: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: "server_error", message: "Something went wrong. Try again." });
  });

  app.get("/health", async () => ({
    ok: true,
    languageTool: await deps.lt.available(),
    ai: deps.ai.configured,
    plagiarism: deps.plagiarism.configured,
  }));

  authRoutes(app, deps);
  checkRoutes(app, deps);
  aiRoutes(app, deps);
  dataRoutes(app, deps);
  plagiarismRoutes(app, deps);

  return app;
}
