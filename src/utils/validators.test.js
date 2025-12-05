import {describe, it, expect} from "vitest";
import {ValidateTextField} from "@/utils/validators.js";

describe("ValidateTextField", () => {
  it("returns false if the field is empty", () => {
    expect(ValidateTextField()).toBe("Value is required");
  });

  it("returns null if the value is at least 3 characters long", () => {
    expect(ValidateTextField({value: "Test", key: "Name"})).toBe(null);
  });

  it("complains if the trimmed value is less than 3 characters long and there are end whitespace", () => {
    expect(ValidateTextField({value: "T    ", key: "Name"})).toBe("Name must be at least 3 characters long");
  });

  it("passes if the trimmed value is 3 characters, including a whitespace in the middle", () => {
    expect(ValidateTextField({value: "T s  ", key: "Name"})).toBe(null);
  });
});
