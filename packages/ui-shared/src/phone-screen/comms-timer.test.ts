import { describe, expect, it } from "vitest";
import { createCommsWindowTimer } from "./comms-timer.js";

describe("host-authoritative COMMS timer [M2-12]", () => {
  it("ignores an early client acknowledgement and only releases the window on host close", () => {
    const timer = createCommsWindowTimer(30);
    timer.tick(29);
    expect(timer.remainingSeconds()).toBe(1);
    expect(timer.isOpen()).toBe(true);

    timer.acknowledge();
    expect(timer.isOpen()).toBe(true);

    timer.tick(1);
    expect(timer.remainingSeconds()).toBe(0);
    expect(timer.isOpen()).toBe(true);

    timer.close();
    expect(timer.isOpen()).toBe(false);

    timer.acknowledge();
    expect(timer.isOpen()).toBe(false);
  });

  it("never ticks below zero and never resumes counting after close", () => {
    const timer = createCommsWindowTimer(5);
    timer.tick(100);
    expect(timer.remainingSeconds()).toBe(0);
    timer.close();
    timer.tick(10);
    expect(timer.remainingSeconds()).toBe(0);
    expect(timer.isOpen()).toBe(false);
  });
});

describe("pause and resume on disconnect [M2-13]", () => {
  it("freezes the exact remaining duration while paused and ignores ticks until resumed", () => {
    const timer = createCommsWindowTimer(30);
    timer.tick(13);
    expect(timer.remainingSeconds()).toBe(17);

    timer.pause();
    expect(timer.isPaused()).toBe(true);
    timer.tick(5);
    timer.tick(100);
    expect(timer.remainingSeconds()).toBe(17);
    expect(timer.isOpen()).toBe(true);

    timer.resume();
    expect(timer.isPaused()).toBe(false);
    timer.tick(17);
    expect(timer.remainingSeconds()).toBe(0);
    expect(timer.isOpen()).toBe(true);
  });

  it("close still wins even while paused", () => {
    const timer = createCommsWindowTimer(30);
    timer.tick(10);
    timer.pause();
    timer.close();
    expect(timer.isOpen()).toBe(false);
    timer.resume();
    timer.tick(5);
    expect(timer.remainingSeconds()).toBe(20);
    expect(timer.isOpen()).toBe(false);
  });
});
