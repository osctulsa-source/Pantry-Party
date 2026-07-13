import { describe, expect, it } from "vitest";

import {
  COOKING_DEVICES,
  DEVICE_BOOST,
  detectDevices,
  formatDeviceBadge,
  scoreDeviceBoost,
  type CookingDevice,
} from "./cookingDevice.ts";

describe("detectDevices", () => {
  it("detects every device from a title keyword alone", () => {
    expect(detectDevices("Chicken Stir-Fry in a Wok", [])).toContain("stove");
    expect(detectDevices("Sheet Pan Salmon", [])).toContain("oven");
    expect(detectDevices("Slow Cooker Pulled Pork", [])).toContain("crockpot");
    expect(detectDevices("Crispy Air Fryer Wings", [])).toContain("airfryer");
    expect(detectDevices("Grilled Corn Salad", [])).toContain("grill");
    expect(detectDevices("Griddle Smash Burgers", [])).toContain("griddle");
  });

  it("detects from equipment strings when the title is silent", () => {
    expect(detectDevices("Shrimp Scampi", ["large skillet"])).toContain("stove");
    expect(detectDevices("Weeknight Casserole", ["baking dish"])).toContain("oven");
    expect(detectDevices("Sunday Chili", ["slow cooker"])).toContain("crockpot");
  });

  it("keyword matching is case-insensitive", () => {
    expect(detectDevices("BBQ Ribs", [])).toContain("grill");
    expect(detectDevices("dinner", ["Air Fryer basket"])).toContain("airfryer");
  });

  it("'dutch oven' reads as stove, not oven", () => {
    const detected = detectDevices("Dutch Oven Braised Beef", []);
    expect(detected).toContain("stove");
    expect(detected).not.toContain("oven");
  });

  it("'grill pan' reads as stove, not grill", () => {
    const detected = detectDevices("Steak Night", ["grill pan"]);
    expect(detected).toContain("stove");
    expect(detected).not.toContain("grill");
  });

  it("a recipe can match multiple devices", () => {
    const detected = detectDevices("Grilled Chicken with Skillet Corn", []);
    expect(detected).toContain("grill");
    expect(detected).toContain("stove");
  });

  it("returns an empty set when nothing matches", () => {
    expect(detectDevices("Fruit Salad", ["mixing bowl"]).size).toBe(0);
  });
});

describe("scoreDeviceBoost", () => {
  const detected = new Set<CookingDevice>(["grill"]);

  it("returns the flat boost when any selected device is detected", () => {
    expect(scoreDeviceBoost(["grill"], detected)).toBe(DEVICE_BOOST);
    expect(scoreDeviceBoost(["stove", "grill"], detected)).toBe(DEVICE_BOOST);
  });

  it("is flat, not summed, when several selected devices match", () => {
    const multi = new Set<CookingDevice>(["grill", "stove"]);
    expect(scoreDeviceBoost(["grill", "stove"], multi)).toBe(DEVICE_BOOST);
  });

  it("returns 0 with an empty selection ('Anything')", () => {
    expect(scoreDeviceBoost([], detected)).toBe(0);
  });

  it("returns 0 when no selected device was detected", () => {
    expect(scoreDeviceBoost(["crockpot"], detected)).toBe(0);
  });
});

describe("formatDeviceBadge", () => {
  it("names the first selected device that matched", () => {
    const detected = new Set<CookingDevice>(["stove", "grill"]);
    expect(formatDeviceBadge(["grill", "stove"], detected)).toBe("Grill pick");
    expect(formatDeviceBadge(["airfryer", "stove"], detected)).toBe("Stovetop pick");
  });

  it("uses each device's badge label", () => {
    for (const d of COOKING_DEVICES) {
      expect(formatDeviceBadge([d.id], new Set([d.id]))).toMatch(/ pick$/);
    }
    expect(formatDeviceBadge(["crockpot"], new Set<CookingDevice>(["crockpot"]))).toBe("Crockpot pick");
    expect(formatDeviceBadge(["airfryer"], new Set<CookingDevice>(["airfryer"]))).toBe("Air fryer pick");
  });

  it("returns null when nothing matched or nothing is selected", () => {
    expect(formatDeviceBadge(["grill"], new Set())).toBeNull();
    expect(formatDeviceBadge([], new Set<CookingDevice>(["grill"]))).toBeNull();
  });
});
