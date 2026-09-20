import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildBridgeArgs, resolveWorkspace } from "../lib/index.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("DSH plugin bridge boundary", () => {
  it("binds bridge commands to the current DSH session cwd", () => {
    const ctx = {
      get(name: string) {
        if (name !== "sessions") return undefined;
        return { get: () => ({ header: { cwd: "C:/work/current-project" } }) };
      },
    };
    const workspace = resolveWorkspace(ctx, { agent: { id: "agent-1" } }, {});
    expect(workspace).toBe(path.resolve("C:/work/current-project"));
  });

  it("maps only a predefined status action and injects the bound workspace", () => {
    expect(buildBridgeArgs("status", {}, "C:/work/current-project")).toEqual([
      "status",
      "--json",
      "--workspace",
      "C:/work/current-project",
    ]);
  });

  it("rejects arbitrary actions instead of exposing a shell", () => {
    expect(() => buildBridgeArgs("shell", { command: "whoami" }, "C:/work/current-project")).toThrow(
      "unsupported action"
    );
  });
});

describe("DSH 0.1.6 browser runtime contract", () => {
  it("declares the tested official Browser Use packages and no BrowserSkill dependency", () => {
    const compatibility = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "compatibility.json"), "utf8")
    );

    expect(compatibility.tested.dsh).toEqual(["0.1.6-alpha.2"]);
    expect(compatibility.requires.browserUseService).toContain("@deepseek-ai/dsh-browser-use");
    expect(compatibility.requires.browserUseProvider).toContain(
      "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp"
    );
    expect(compatibility.requires.browserPlugin).toBeUndefined();
  });

  it("routes ChatGPT automation only through the official Playwright MCP namespace", () => {
    const skill = fs.readFileSync(path.join(repoRoot, "skill", "SKILL.md"), "utf8");

    expect(skill).toContain("mcp__playwright-mcp__browser_tabs");
    expect(skill).toContain("mcp__playwright-mcp__browser_snapshot");
    expect(skill).toContain("mcp__playwright-mcp__browser_click");
    expect(skill).not.toContain("browser_assist");
    expect(skill).not.toContain("Use the `browser-skill`");
  });
});
