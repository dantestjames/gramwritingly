import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createClaude } from "./services/ai.js";
import { createLanguageTool } from "./services/languagetool.js";
import { createPlagiarism } from "./services/plagiarism.js";

const config = loadConfig();
const app = await buildApp(
  {
    config,
    db: openDb(config.databasePath),
    lt: createLanguageTool(config.languageToolUrl),
    ai: createClaude(config),
    plagiarism: createPlagiarism(config),
  },
  { logger: true },
);

await app.listen({ port: config.port, host: "0.0.0.0" });
