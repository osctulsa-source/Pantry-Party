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
    expect(detectDevices("Slow Cooker Pulled Pork", [])).toContain("crockpot");
    expect(detectDevices("Instant Pot Chicken Soup", [])).toContain("instantpot");
    expect(detectDevices("Crispy Air Fryer Wings", [])).toContain("airfryer");
    expect(detectDevices("Sheet Pan Salmon", [])).toContain("sheetpan");
    expect(detectDevices("Microwave Mug Eggs", [])).toContain("microwave");
    expect(detectDevices("No-Cook Caprese Wraps", [])).toContain("nocook");
    expect(detectDevices("Chicken Stir-Fry in a Wok", [])).toContain("stove");
    expect(detectDevices("Baked Ziti Night", [])).toContain("oven");
    expect(detectDevices("Grilled Corn Salad", [])).toContain("grill");
    expect(detectDevices("Griddle Smash Burgers", [])).toContain("griddle");
  });

  it("detects from equipment strings when the title is silent", () => {
    expect(detectDevices("Shrimp Scampi", ["large skillet"])).toContain("stove");
    expect(detectDevices("Weeknight Casserole", ["baking dish"])).toContain("oven");
    expect(detectDevices("Sunday Chili", ["slow cooker"])).toContain("crockpot");
    expect(detectDevices("Rice Bowl", ["instant pot"])).toContain("instantpot");
    expect(detectDevices("Roasted Veg", ["sheet pan"])).toContain("sheetpan");
    expect(detectDevices("Steamed Broccoli", ["microwave"])).toContain("microwave");
  });

  it("sheet-pan titles do not also count as oven", () => {
    const detected = detectDevices("Sheet Pan Salmon", ["sheet pan"]);
    expect(detected).toContain("sheetpan");
    expect(detected).not.toContain("oven");
  });

  it("baking sheet maps to sheetpan, not oven", () => {
    const detected = detectDevices("Crispy Potatoes", ["baking sheet"]);
    expect(detected).toContain("sheetpan");
    expect(detected).not.toContain("oven");
  });

  it("pressure cooker phrases map to instantpot; bare 'pressure' does not", () => {
    expect(detectDevices("Weeknight Stew", ["pressure cooker"])).toContain("instantpot");
    expect(detectDevices("High Pressure Day", ["mixing bowl"]).has("instantpot")).toBe(false);
  });

  it("keyword matching is case-insensitive", () => {
    expect(detectDevices("BBQ Ribs", [])).toContain("grill");
    expect(detectDevices("dinner", ["Air Fryer basket"])).toContain("airfryer");
    expect(detectDevices("NO-COOK Pasta Salad", [])).toContain("nocook");
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

  it("lists lazy appliances before stove/oven in display order", () => {
    const ids = COOKING_DEVICES.map((d) => d.id);
    expect(ids.indexOf("crockpot")).toBeLessThan(ids.indexOf("stove"));
    expect(ids.indexOf("nocook")).toBeLessThan(ids.indexOf("stove"));
    expect(ids[0]).toBe("crockpot");
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
    expect(formatDeviceBadge(["crockpot"], new Set<CookingDevice>(["crockpot"]))).toBe(
      "Crockpot pick",
    );
    expect(formatDeviceBadge(["airfryer"], new Set<CookingDevice>(["airfryer"]))).toBe(
      "Air fryer pick",
    );
    expect(formatDeviceBadge(["instantpot"], new Set<CookingDevice>(["instantpot"]))).toBe(
      "Instant Pot pick",
    );
    expect(formatDeviceBadge(["sheetpan"], new Set<CookingDevice>(["sheetpan"]))).toBe(
      "Sheet pan pick",
    );
    expect(formatDeviceBadge(["nocook"], new Set<CookingDevice>(["nocook"]))).toBe("No-cook pick");
  });

  it("returns null when nothing matched or nothing is selected", () => {
    expect(formatDeviceBadge(["grill"], new Set())).toBeNull();
    expect(formatDeviceBadge([], new Set<CookingDevice>(["grill"]))).toBeNull();
  });
});
