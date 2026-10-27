// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Rendering safety: crafted names cannot inject Markdown/HTML, DSL or SARIF structure; reports are labelled as
 * untrusted data; truncation and caps work.
 */
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/report/markdown.js";
import { renderCalm, renderDsl } from "../src/report/model-writers.js";
import { tokenize, readDsl } from "../src/model/dsl.js";
import { Limitations } from "../src/limitations.js";
import { cli, copyFixture, fixture, reportOf } from "./helpers.js";

describe("rendering", () => {
  it("Markdown: untrusted-data notice; crafted names stay in code spans; @mentions neutralized", async () => {
    const dir = copyFixture("a9");
    const md = (await cli(["analyze", "--quiet"], dir)).stdout;
    expect(md).toContain("untrusted data");
    // Outside code spans, "<" only appears escaped ("\\<"), which GitHub renders as a literal character.
    const outsideCode = md.replace(/(`+)[\s\S]*?\1/g, "");
    expect(outsideCode).not.toMatch(/(?<!\\)<img/);
    expect(outsideCode).toContain("@\u200bteam");
    expect(md).toContain('`evil"name\\n<img src=x onerror=alert(1)> @team`');
    expect(md).toContain("Suggested model change");
    expect(
      md
        .split("\n")
        .filter((l) => l.startsWith("#"))
        .every((l) => !l.includes("evil"))
    ).toBe(true);
  });

  it("DSL output: a crafted name cannot add statements, and re-reads as one element", async () => {
    const dir = copyFixture("a9");
    const dsl = (await cli(["derive", "--quiet"], dir)).stdout;
    expect(dsl).toContain('container "evil\\"name <img src=x onerror=alert(1)> @team"');
    const limitations = new Limitations();
    const model = readDsl(dsl, "derived.dsl", limitations);
    expect(model.usable).toBe(true);
    expect(model.issues).toEqual([]);
    expect(model.elements.map((e) => e.kind).sort()).toEqual(["container", "container", "software_system"]);
  });

  it("DSL output of A10 re-reads as a model with no drift against its own repository", async () => {
    const dir = copyFixture("a4");
    const dsl = await cli(
      ["derive", "--quiet", "--graph", "graph.json", "--output", "architecture/derived.dsl"],
      dir
    );
    expect(dsl.code).toBe(0);
    const report = await reportOf(dir, ["--graph", "graph.json", "--model", "architecture/derived.dsl"]);
    expect(report.findings).toEqual([]);
    expect(report.complete_mapping).toBe(true);
  });

  it("CALM output of A10 re-reads as a model with no drift against its own repository", async () => {
    const dir = copyFixture("a4");
    await cli(
      [
        "derive",
        "--quiet",
        "--format",
        "calm",
        "--graph",
        "graph.json",
        "--output",
        "architecture/derived.json",
      ],
      dir
    );
    const report = await reportOf(dir, ["--graph", "graph.json", "--model", "architecture/derived.json"]);
    expect(report.findings).toEqual([]);
  });

  it("SARIF keeps status labels and omits regions for directory evidence", async () => {
    const dir = fixture("a4");
    const sarif = JSON.parse(
      (await cli(["analyze", "--format", "sarif", "--quiet", "--graph", `${dir}/graph.json`], dir)).stdout
    ) as {
      runs: {
        results: {
          ruleId: string;
          properties: { status: string };
          locations: { physicalLocation: { region?: unknown } }[];
        }[];
      }[];
    };
    const results = sarif.runs[0]!.results;
    expect(results.map((r) => r.properties.status)).toEqual([
      "verified_static_fact",
      "verified_static_fact",
      "hypothesis",
      "hypothesis",
    ]);
    const component = results.find((r) => r.ruleId === "component-undeclared")!;
    expect(component.locations[0]!.physicalLocation.region).toBeUndefined();
  });

  it("Markdown is capped at 60k characters", async () => {
    const report = await reportOf(fixture("a2"));
    const finding = report.findings[0]!;
    report.findings = Array.from({ length: 400 }, (_, i) => ({
      ...finding,
      id: `ACF-${i}`,
      summary: "x".repeat(300),
    }));
    const md = renderMarkdown(report, { branding: true });
    expect(md.length).toBeLessThan(60_200);
    expect(md).toContain("truncated at 60000 characters");
  });

  it("renderers handle an empty as-built model", async () => {
    const report = await reportOf(fixture("a1"), [], "derive");
    report.as_built.elements = [];
    report.as_built.relationships = [];
    expect(renderDsl(report)).toContain('system = softwareSystem "As-built system" {');
    expect(JSON.parse(renderCalm(report)).nodes).toHaveLength(1);
    expect(renderMarkdown(report, { branding: false })).toContain("No elements found.");
  });

  it("tokenizer handles comments, escapes and arrows", () => {
    const statements = tokenize('a -> b "x \\" y" // c\n/* block\n still */ c\n# comment\n');
    expect(statements).toEqual([
      {
        line: 1,
        tokens: [
          { text: "a", quoted: false },
          { text: "->", quoted: false },
          { text: "b", quoted: false },
          { text: 'x " y', quoted: true },
        ],
      },
      { line: 3, tokens: [{ text: "c", quoted: false }] },
    ]);
    expect(tokenize('a "unterminated')).toBeNull();
    expect(tokenize("/* never closed")).toBeNull();
  });
});
