import { afterEach, describe, expect, it, vi } from "vitest";
import { Cosmograph } from "@cosmograph/cosmograph";
import { CosmographConfigManager } from "@cosmograph/cosmograph/cosmograph/config/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("installed Cosmograph live simulation mode", () => {
  it.each([true, false])(
    "synchronizes Cosmos and public controls when initially enabled=%s",
    async (initial) => {
      vi.stubGlobal("window", {});
      const cosmos = {
        setConfigPartial: vi.fn(),
        start: vi.fn(),
        pause: vi.fn(),
        unpause: vi.fn(),
      };
      const wrapper = Object.setPrototypeOf(
        {
          _enableSimulation: initial,
          _cosmos: cosmos,
          _internalApi: { dispatchEvent: vi.fn() },
        },
        Cosmograph.prototype,
      );
      // Execute the installed manager's real config application and translation.
      // Database/property work is unrelated; keep those boundaries inert.
      const manager = Object.setPrototypeOf(
        {
          _appliedConfig: { points: "same_points", enableSimulation: initial },
          isConfigVersionCurrent: () => true,
          _controlBackgroundColor: vi.fn(),
          _handleScaleChangeEvents: vi.fn(),
          _processConfigUpdate: vi.fn(),
          _checkPointEvents: () => false,
          _: {
            public: wrapper,
            cosmos,
            dbReady: async () => {},
            indexManager: { applyResolvedConfig: vi.fn() },
            rectangularSelection: { updateSelectionClassName: vi.fn() },
            eventManager: { attachCosmosEvents: vi.fn() },
          },
        },
        CosmographConfigManager.prototype,
      );
      for (const enabled of [false, true, false, true]) {
        const config = { points: "same_points", enableSimulation: enabled };
        await manager._applyConfigUpdate({ rawConfig: config, resolvedConfig: config, version: 1 });
        expect(cosmos.setConfigPartial).toHaveBeenLastCalledWith(
          expect.objectContaining({ enableSimulation: enabled }),
        );
        expect(wrapper.isSimulationAvailable).toBe(enabled);
        cosmos.start.mockClear();
        cosmos.unpause.mockClear();
        wrapper.start(0.3);
        wrapper.unpause();
        expect(cosmos.start).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(cosmos.unpause).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(manager.config.points).toBe("same_points");
      }
    },
  );
});
