import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBridgeArgs, resolveWorkspace } from "../lib/index.mjs";

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
