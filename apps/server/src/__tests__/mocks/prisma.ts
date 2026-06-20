/**
 * Prisma Mock — Shared test utility
 *
 * Creates a deeply-mocked Prisma client for unit testing
 * without requiring a real database connection.
 */

import { vi } from "vitest";

// Create a recursive mock that returns itself for chained calls
function createMockPrisma() {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === "then") return undefined; // Prevent Promise resolution
      if (prop === "$connect" || prop === "$disconnect") return vi.fn();
      if (prop === "$queryRaw") return vi.fn().mockResolvedValue([{ "?column?": 1 }]);
      if (prop === "$transaction") return vi.fn((fn: any) => fn(mockPrisma));

      // Return a model-level proxy
      const modelMock: Record<string, any> = {};
      const modelHandler: ProxyHandler<any> = {
        get: (_t, method) => {
          if (typeof method === "string" && !modelMock[method]) {
            modelMock[method] = vi.fn();
          }
          return modelMock[method as string];
        },
      };
      return new Proxy(modelMock, modelHandler);
    },
  };

  return new Proxy({}, handler);
}

export const mockPrisma = createMockPrisma();

// Mock the prisma module
vi.mock("../lib/prisma.js", () => ({
  default: mockPrisma,
}));
