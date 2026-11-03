import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextCustomerCode,
  normalizeCustomerCode,
  validateCustomerCode,
} from "./customer-code.ts";

test("normalizes customer codes to trimmed uppercase text", () => {
  assert.equal(normalizeCustomerCode("  tys125  "), "TYS125");
});

test("accepts only TYS followed by digits", () => {
  assert.equal(validateCustomerCode("TYS001"), null);
  assert.equal(validateCustomerCode("TYS1000"), null);
  assert.equal(
    validateCustomerCode("001"),
    "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น",
  );
  assert.equal(
    validateCustomerCode("TYS"),
    "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น",
  );
  assert.equal(
    validateCustomerCode("TYS12A"),
    "รหัสร้านต้องขึ้นต้นด้วย TYS และตามด้วยตัวเลขเท่านั้น",
  );
});

test("requires a customer code", () => {
  assert.equal(validateCustomerCode(""), "กรอกรหัสร้านก่อนบันทึก");
});

test("calculates the next code from valid TYS codes only", () => {
  assert.equal(getNextCustomerCode(["TYS009", "legacy", "TYS125"]), "TYS126");
});

test("pads automatic codes to at least three digits", () => {
  assert.equal(getNextCustomerCode([]), "TYS001");
  assert.equal(getNextCustomerCode(["TYS999"]), "TYS1000");
});

test("normalizes lowercase manual input before validation", () => {
  const code = normalizeCustomerCode(" tys007 ");
  assert.equal(validateCustomerCode(code), null);
  assert.equal(code, "TYS007");
});
