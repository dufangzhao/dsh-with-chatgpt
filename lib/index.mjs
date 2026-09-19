import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "dsh-with-chatgpt";
export const inject = ["tools"];

const here = path.dirname(fileURLToPath(import.meta.url));
const bundledBridgeEntry = path.resolve(here, "../dist/cli/index.js");
const bundledSkill = path.resolve(here, "../skill/SKILL.md");
const ACTIONS = [
  "update_check",
  "prefs_get",
  "prefs_set",
  "tunnel_status",
  "tunnel_choose",
  "setup",
  "doctor",
  "start",
  "status",
  "pair",
  "stop",
  "unpair",
  "workspace",
  "session_get",
  "session_set",
  "session_clear",
  "record"
];

export const Config = Schema.object({
  bridgeEntry: Schema.string().default("").description("Path to the bundled D2C CLI entry. Empty uses this package's bridge."),
  stateDir: Schema.string().default("").description("Private D2C state directory. Empty uses the operating-system local state directory."),
  defaultWorkspace: Schema.string().default("").description("Fallback workspace only when the DSH session does not provide a cwd."),
  commandTimeoutMs: Schema.number().default(180000).description("Maximum time for one bridge command, in milliseconds."),
  maxOutputChars: Schema.number().default(200000).description("Maximum captured stdout or stderr characters per command.")
});

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required for this action`);
  return value.trim();
}

function add(args, flag, value) {
  if (value !== undefined && value !== null && String(value).trim() !== "") args.push(flag, String(value));
}

export function resolveWorkspace(ctx, exec, config = {}) {
  const agentId = exec?.agent?.id;
  const session = agentId ? ctx.get("sessions")?.get?.(agentId) : undefined;
  const cwd = session?.header?.cwd;
  return path.resolve(cwd || config.defaultWorkspace || process.cwd());
}

export function defaultStateDir() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "dsh-with-chatgpt");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "dsh-with-chatgpt");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "dsh-with-chatgpt");
}

export function buildBridgeArgs(action, input, workspace) {
  const withWorkspace = (...parts) => [...parts, "--workspace", workspace];
  let args;
  switch (action) {
    case "update_check": args = ["update-check", "--json"]; break;
    case "prefs_get": args = ["prefs", "get", "--json"]; break;
    case "prefs_set":
      args = ["prefs", "set", "--json"];
      if (input.developerMode === true) args.push("--developer-mode");
      add(args, "--setup-mode", input.setupMode);
      break;
    case "tunnel_status":
      args = withWorkspace("tunnel", "status", "--json");
      add(args, "--zone", input.zone);
      break;
    case "tunnel_choose":
      args = withWorkspace("tunnel", "choose", "--json", "--mode", requireText(input.mode, "mode"));
      add(args, "--zone", input.zone);
      add(args, "--hostname", input.hostname);
      break;
    case "setup":
      args = withWorkspace("setup", "--json");
      if (input.noTunnel === true) args.push("--no-tunnel");
      break;
    case "doctor":
      args = withWorkspace("doctor", "--json");
      if (input.noFix === true) args.push("--no-fix");
      break;
    case "start":
      args = withWorkspace("start", "--json");
      if (input.tunnel === true) args.push("--tunnel");
      break;
    case "status": args = withWorkspace("status", "--json"); break;
    case "pair": args = withWorkspace("pair", "--json"); break;
    case "stop": args = withWorkspace("stop"); break;
    case "unpair": args = withWorkspace("unpair"); break;
    case "workspace": args = withWorkspace("workspace", "--json"); break;
    case "session_get": args = withWorkspace("session", "get", "--json"); break;
    case "session_clear": args = withWorkspace("session", "clear"); break;
    case "session_set":
      args = withWorkspace("session", "set");
      add(args, "--url", input.url);
      add(args, "--title", input.title);
      add(args, "--task", input.task);
      add(args, "--iteration", input.iteration);
      add(args, "--state", input.state);
      add(args, "--mode", input.sessionMode);
      add(args, "--project-url", input.projectUrl);
      add(args, "--connector-name", input.connectorName);
      add(args, "--protocol-state", input.protocolState);
      add(args, "--waiting-for", input.waitingFor);
      add(args, "--goal", input.goal);
      add(args, "--completed-subtasks", input.completedSubtasks);
      add(args, "--known-issues", input.knownIssues);
      add(args, "--next-step", input.nextStep);
      if (input.clearCheckpoint === true) args.push("--clear-checkpoint");
      break;
    case "record":
      args = withWorkspace("record", "--task", requireText(input.task, "task"));
      add(args, "--iteration", input.iteration ?? 0);
      add(args, "--changed-files", input.changedFiles ?? "0");
      add(args, "--tests", input.tests);
      add(args, "--exit-status", input.exitStatus ?? "ok");
      add(args, "--notes", input.notes);
      add(args, "--command", input.command);
      add(args, "--output", input.output);
      add(args, "--output-file", input.outputFile);
      add(args, "--exit-code", input.exitCode);
      break;
    default: throw new Error(`unsupported action: ${action}`);
  }
  return args;
}

function parseJsonOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch { /* continue */ }
  }
  return null;
}

export function runBridge({ entry, args, workspace, stateDir, timeoutMs, maxOutputChars, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: workspace,
      windowsHide: true,
      shell: false,
      env: { ...process.env, D2C_STATE_DIR: stateDir, C2C_STATE_DIR: stateDir }
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => (current + chunk.toString()).slice(-maxOutputChars);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const terminate = () => child.kill();
    signal?.addEventListener?.("abort", terminate, { once: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`bridge command timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", terminate);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", terminate);
      resolve({
        ok: exitCode === 0,
        exitCode: exitCode ?? -1,
        data: parseJsonOutput(stdout),
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

export function createDshChatgptTool(ctx, config) {
  return defineTool({
    name: "dsh_chatgpt",
    description: "Operate the DSH-with-ChatGPT bridge for the current DSH workspace. Only predefined bridge actions are allowed; this is not a shell tool.",
    parameters: {
      action: { type: "string", enum: ACTIONS, required: true },
      mode: { type: "string", enum: ["quick", "named"] },
      zone: { type: "string" },
      hostname: { type: "string" },
      setupMode: { type: "string", enum: ["auto", "manual"] },
      developerMode: { type: "boolean" },
      noTunnel: { type: "boolean" },
      noFix: { type: "boolean" },
      tunnel: { type: "boolean" },
      url: { type: "string" },
      title: { type: "string" },
      task: { type: "string" },
      iteration: { type: "integer" },
      state: { type: "string" },
      sessionMode: { type: "string", enum: ["long-chat", "project"] },
      projectUrl: { type: "string" },
      connectorName: { type: "string" },
      protocolState: { type: "string" },
      waitingFor: { type: "string", enum: ["none", "GPT_PLAN", "GPT_REVIEW", "USER"] },
      goal: { type: "string" },
      completedSubtasks: { type: "string" },
      knownIssues: { type: "string" },
      nextStep: { type: "string" },
      clearCheckpoint: { type: "boolean" },
      changedFiles: { type: "string" },
      tests: { type: "string" },
      exitStatus: { type: "string", enum: ["ok", "failed", "blocked"] },
      notes: { type: "string" },
      command: { type: "string" },
      output: { type: "string" },
      outputFile: { type: "string" },
      exitCode: { type: "integer" }
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }]
    },
    async execute(input, exec) {
      const workspace = resolveWorkspace(ctx, exec, config);
      const entry = path.resolve(config.bridgeEntry || bundledBridgeEntry);
      if (!existsSync(entry)) throw new Error(`D2C bridge entry not found: ${entry}. Run pnpm build or configure bridgeEntry.`);
      const stateDir = path.resolve(config.stateDir || process.env.D2C_STATE_DIR || defaultStateDir());
      const args = buildBridgeArgs(input.action, input, workspace);
      const result = await runBridge({
        entry,
        args,
        workspace,
        stateDir,
        timeoutMs: config.commandTimeoutMs,
        maxOutputChars: config.maxOutputChars,
        signal: exec?.signal
      });
      return { action: input.action, workspace, stateDir, ...result };
    }
  });
}

function registerSkill(ctx) {
  const skills = ctx.get("skills");
  if (!skills?.register || !existsSync(bundledSkill)) return () => {};
  return skills.register({
    name: "dsh-with-chatgpt",
    description: "Use ChatGPT web as the planning and review brain while DSH owns local execution.",
    content: readFileSync(bundledSkill, "utf8"),
    source: "bundled"
  });
}

export function apply(ctx, inputConfig = {}) {
  const config = {
    bridgeEntry: inputConfig.bridgeEntry || "",
    stateDir: inputConfig.stateDir || "",
    defaultWorkspace: inputConfig.defaultWorkspace || "",
    commandTimeoutMs: inputConfig.commandTimeoutMs ?? 180000,
    maxOutputChars: inputConfig.maxOutputChars ?? 200000
  };
  const unregisterTool = ctx.tools.register(createDshChatgptTool(ctx, config));
  const unregisterSkill = registerSkill(ctx);
  ctx.effect(() => () => {
    unregisterSkill?.();
    unregisterTool?.();
  });
}
