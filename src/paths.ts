import { homedir } from "node:os";
import { join } from "node:path";

function agentDir(): string {
  const env = process.env.PI_CODING_AGENT_DIR;
  if (env && env.trim()) return env.trim();
  return join(homedir(), ".pi", "agent");
}

export function getPimAgentDir(): string {
  return agentDir();
}

export function getModelsJsonPath(): string {
  return join(agentDir(), "models.json");
}

export function getModelsDevCachePath(): string {
  return join(agentDir(), "cache", "models.dev.json");
}

export function getSidecarPath(): string {
  return join(agentDir(), "pim-models.json");
}

export function backupName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const millis = String(now.getMilliseconds()).padStart(3, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("") + `-${millis}`;
  return `models.json.bak-${stamp}`;
}

export function getBackupPath(now = new Date()): string {
  return join(agentDir(), backupName(now));
}

export function getProviderBackupDir(): string {
  return join(agentDir(), "backups");
}

export function providerBackupId(providerId: string): string {
  return providerId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "provider";
}

export function getProviderBackupPath(providerId: string, now = new Date()): string {
  const stamp = backupName(now).replace("models.json.bak-", "");
  return join(getProviderBackupDir(), `${providerBackupId(providerId)}-${stamp}.json`);
}
