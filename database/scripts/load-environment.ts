import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultEnvironmentFile = resolve(scriptDirectory, "../../source/apps/api/.env");
const environmentFile = process.env.BCIS_ENV_FILE ?? defaultEnvironmentFile;

const result = config({ path: environmentFile, quiet: true });

if (result.error) {
  throw new Error(`BCIS environment file could not be loaded from ${environmentFile}.`);
}
