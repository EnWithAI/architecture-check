// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Every report the fixtures produce validates against schema/architecture-check-report.schema.json, and the
 * schema rejects scores and unknown fields.
 */
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { copyFixture, fixture, reportOf } from "./helpers.js";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const schema = JSON.parse(
  readFileSync(new URL("../schema/architecture-check-report.schema.json", import.meta.url), "utf8")
) as object;
const ajv = addFormats(new Ajv2020({ strict: true, allErrors: true }));
const validate = ajv.compile(schema);

describe("report schema", () => {
  const cases: [string, string[], "analyze" | "check" | "derive"][] = [
    ["a1", [], "analyze"],
    ["a1", [], "derive"],
    ["a2", [], "check"],
    ["a3", [], "analyze"],
    ["a5", [], "analyze"],
    ["a6", [], "analyze"],
    ["a7", [], "analyze"],
    ["a8", [], "analyze"],
    ["a14", [], "analyze"],
  ];
  for (const [id, args, command] of cases)
    it(`${id} ${command} validates`, async () => {
      const report = await reportOf(fixture(id), args, command);
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
    });

  it("a4 with graph and Impact Check report validates", async () => {
    const dir = fixture("a4");
    const report = await reportOf(
      dir,
      ["--graph", `${dir}/graph.json`, "--impact-check", `${dir}/impact-check-report.json`],
      "check"
    );
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it("a9 (adversarial) validates", async () => {
    const report = await reportOf(copyFixture("a9"));
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects a score field and unknown finding fields", async () => {
    const report = (await reportOf(fixture("a2"))) as unknown as Record<string, unknown>;
    expect(validate({ ...report, score: 87 })).toBe(false);
    const findings = report["findings"] as Record<string, unknown>[];
    expect(validate({ ...report, findings: [{ ...findings[0], risk_score: 0.9 }] })).toBe(false);
  });
});
