import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Suppress expected console.error noise from SanitizeUrl being called on
// partial URLs while userEvent.type is typing character by character
const originalConsoleError = console.error;
console.error = (...args) => {
  if(typeof args[0] === "string" && args[0].includes("Unable to sanitize")) { return; }
  if(typeof args[0] === "string" && args[0].includes("non-boolean attribute `inert`")) { return; }
  originalConsoleError(...args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if(typeof args[0] === "string" && args[0].includes("React Router Future Flag Warning")) { return; }
  originalConsoleWarn(...args);
};

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// jsdom blocks localStorage by default; Mantine and other hooks use it for persistence
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }
});

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
