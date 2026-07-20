import { describe, expect, it } from "vitest";

import {
  parseAnnouncement,
  parseAnnouncementReaction,
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_STATUSES,
  REACTIONS,
  RUN_WINDOWS,
  windowToDepartsAt,
  formatDepartureLabel,
  recipientUserIds,
  announcementPushBody,
  isRunnerSummaryDue,
  runnerSummaryBody,
} from "./announcements.ts";

describe("Announcement", () => {
  const run = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    householdId: "223e4567-e89b-12d3-a456-426614174000",
    kind: "shopping_run" as const,
    createdBy: "user-1",
    createdAt: "2026-07-10T12:00:00.000Z",
    status: "active" as const,
    departsAt: "2026-07-10T17:00:00.000Z",
    message: "Grabbing Kroger",
    updatedAt: Date.now(),
    deleted: false,
  };

  it("parses a valid shopping_run announcement", () => {
    expect(parseAnnouncement(run)).toEqual(run);
  });

  it("parses a valid cooking announcement", () => {
    const cook = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      householdId: "223e4567-e89b-12d3-a456-426614174000",
      kind: "cooking" as const,
      createdBy: "user-1",
      createdAt: "2026-07-10T12:00:00.000Z",
      status: "active" as const,
      recipeId: "716429",
      recipeTitle: "Chicken Tikka",
      updatedAt: Date.now(),
      deleted: false,
    };
    expect(parseAnnouncement(cook)).toEqual(cook);
  });

  it("rejects an unknown kind", () => {
    expect(() => parseAnnouncement({ ...run, kind: "party" })).toThrow();
  });

  it("rejects a non-UUID id", () => {
    expect(() => parseAnnouncement({ ...run, id: "nope" })).toThrow();
  });

  it("exposes the known enum sets", () => {
    expect(ANNOUNCEMENT_KINDS).toContain("shopping_run");
    expect(ANNOUNCEMENT_KINDS).toContain("cooking");
    expect(ANNOUNCEMENT_STATUSES).toContain("active");
    expect(REACTIONS).toEqual(["thumbs_up", "party", "cant_tonight"]);
  });

  it("parses a valid reaction", () => {
    const reaction = {
      id: "423e4567-e89b-12d3-a456-426614174000",
      announcementId: run.id,
      householdId: run.householdId,
      userId: "user-2",
      reaction: "thumbs_up" as const,
      createdAt: "2026-07-10T12:05:00.000Z",
      updatedAt: Date.now(),
      deleted: false,
    };
    expect(parseAnnouncementReaction(reaction)).toEqual(reaction);
  });
});

describe("run windows", () => {
  const now = new Date("2026-07-10T14:00:00.000Z");

  it("lists the four window options", () => {
    expect(RUN_WINDOWS.map((w) => w.id)).toEqual([
      "now",
      "30min",
      "afternoon",
      "tonight",
    ]);
  });

  it("maps 'now' to the current instant", () => {
    expect(windowToDepartsAt("now", now)).toBe("2026-07-10T14:00:00.000Z");
  });

  it("maps '30min' to 30 minutes out", () => {
    expect(windowToDepartsAt("30min", now)).toBe("2026-07-10T14:30:00.000Z");
  });

  it("formats a departure label in local time", () => {
    const iso = "2026-07-10T17:00:00.000Z";
    const expected = new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(formatDepartureLabel(iso)).toBe(expected);
  });
});

describe("recipientUserIds", () => {
  it("returns every member except the sender", () => {
    expect(
      recipientUserIds(["user-1", "user-2", "user-3"], "user-1"),
    ).toEqual(["user-2", "user-3"]);
  });

  it("dedupes and drops the sender", () => {
    expect(recipientUserIds(["a", "a", "b"], "b")).toEqual(["a"]);
  });
});

describe("announcementPushBody", () => {
  it("writes shopping-run copy using the sender's custom message", () => {
    const msg = announcementPushBody(
      {
        kind: "shopping_run",
        message: "Grabbing Kroger, need anything for tacos?",
        departsAt: "2026-07-10T17:00:00.000Z",
      },
      "Sam",
    );
    expect(msg.title).toBe("Sam is heading to the store");
    expect(msg.body).toBe("Grabbing Kroger, need anything for tacos?");
  });

  it("falls back to the default body when no message is given", () => {
    const msg = announcementPushBody(
      { kind: "shopping_run", departsAt: "2026-07-10T17:00:00.000Z" },
      "Sam",
    );
    expect(msg.title).toBe("Sam is heading to the store");
    expect(msg.body).toBe("Add anything you need to the list.");
  });

  it("falls back to the default body when the message is blank", () => {
    const msg = announcementPushBody(
      { kind: "shopping_run", message: "   ", departsAt: "2026-07-10T17:00:00.000Z" },
      "Sam",
    );
    expect(msg.body).toBe("Add anything you need to the list.");
  });

  it("writes cooking copy with sender and recipe", () => {
    const msg = announcementPushBody(
      { kind: "cooking", recipeTitle: "Chicken Tikka" },
      "Alex",
    );
    expect(msg.title).toBe("Alex is cooking tonight");
    expect(msg.body).toContain("Chicken Tikka");
  });
});

describe("isRunnerSummaryDue", () => {
  const base = {
    status: "active" as const,
    departsAt: "2026-07-10T17:00:00.000Z",
    runnerSummarySentAt: null as string | null,
    requestedItemCount: 3,
  };
  const near = new Date("2026-07-10T16:57:00.000Z"); // 3 min before
  const far = new Date("2026-07-10T16:40:00.000Z"); // 20 min before

  it("is due within 5 minutes of departure with requests", () => {
    expect(isRunnerSummaryDue(base, near)).toBe(true);
  });

  it("is not due when departure is far off", () => {
    expect(isRunnerSummaryDue(base, far)).toBe(false);
  });

  it("is not due once already sent", () => {
    expect(
      isRunnerSummaryDue(
        { ...base, runnerSummarySentAt: "2026-07-10T16:56:00.000Z" },
        near,
      ),
    ).toBe(false);
  });

  it("is not due with zero requested items", () => {
    expect(isRunnerSummaryDue({ ...base, requestedItemCount: 0 }, near)).toBe(
      false,
    );
  });

  it("is not due when the run is done", () => {
    expect(isRunnerSummaryDue({ ...base, status: "done" }, near)).toBe(false);
  });

  it("formats the summary body", () => {
    expect(runnerSummaryBody(5, 2)).toContain("5 items");
    expect(runnerSummaryBody(5, 2)).toContain("2 housemates");
  });
});
