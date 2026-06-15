// 2026-06-14, Composer: toybox lifecycle stress tests in Node [tbxst1]
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../src/core/mempool.js";
import {
	count_active,
	create_harness,
} from "./helpers/toybox_harness.js";

/** @param {import("../src/scene/toybox.js").default} toybox */
function is_toy_slot_active(toybox, index) {
	return toybox.mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE);
}

describe("toybox stress", () => {
	/** @type {ReturnType<typeof create_harness>} */
	let h;

	beforeEach(() => {
		h = create_harness();
	});

	afterEach(() => {
		h.teardown();
	});

	it("lifespan_dispose_timing", () => {
		h = create_harness({ lifespan: 1 });
		const index = h.toybox.spawn(h.TOY_KEY);
		expect(index).not.toBeNull();

		while (h.events.toy_init < 1) {
			h.tick(h.DT_FRAME);
		}

		let frames = 0;
		const maxFrames = 80;
		while (frames < maxFrames && is_toy_slot_active(h.toybox, index)) {
			h.tick(h.DT_FRAME);
			frames++;
		}

		expect(frames).toBeGreaterThanOrEqual(58);
		expect(frames).toBeLessThanOrEqual(66);
		h.drain();
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});

	it("lifespan_short_ms", () => {
		h = create_harness({ lifespan: 0.05 });
		const index = h.toybox.spawn(h.TOY_KEY);
		expect(index).not.toBeNull();

		while (h.events.toy_init < 1) {
			h.tick(h.DT_FRAME);
		}

		let frames = 0;
		while (frames < 12 && is_toy_slot_active(h.toybox, index)) {
			h.tick(h.DT_FRAME);
			frames++;
		}

		expect(frames).toBeGreaterThan(0);
		expect(frames).toBeLessThanOrEqual(8);
		h.drain();
		expect(h.toybox.mempool.takencount).toBe(0);
	});

	it("spawn_burst_to_pool_limit", () => {
		const spawned = [];
		while (true) {
			const index = h.toybox.spawn(h.TOY_KEY);
			if (index == null) {
				break;
			}
			spawned.push(index);
		}

		expect(spawned.length).toBe(255);
		expect(count_active(h.toybox.mempool)).toBe(255);
		expect(count_active(h.itembox.mempool)).toBe(255);

		h.drain(512);
		h.teardown();
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});

	it("rapid_immediate_spawn_despawn", () => {
		for (let i = 0; i < 500; i++) {
			const index = h.toybox.spawn(h.TOY_KEY, true);
			expect(index).not.toBeNull();
			h.toybox.despawn(index, true);
			h.drain(16);
		}

		h.drain();
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});

	it("overlapping_lifespans", () => {
		h = create_harness({ lifespan: 0.1 });
		const spawned = [];
		for (let i = 0; i < 32; i++) {
			const index = h.toybox.spawn(h.TOY_KEY);
			expect(index).not.toBeNull();
			spawned.push(index);
		}

		for (let f = 0; f < 20; f++) {
			h.tick(h.DT_FRAME);
		}

		h.drain(64);
		expect(count_active(h.toybox.mempool)).toBe(0);
		expect(count_active(h.itembox.mempool)).toBe(0);
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});

	it("random_churn", () => {
		h = create_harness({ lifespan: 0.5 });
		/** @type {number[]} */
		const active = [];

		for (let f = 0; f < 2000; f++) {
			if (Math.random() < 0.4) {
				const index = h.toybox.spawn(h.TOY_KEY);
				if (index != null) {
					active.push(index);
				}
			}
			if (active.length > 0 && Math.random() < 0.35) {
				const pick = Math.floor(Math.random() * active.length);
				const index = active[pick];
				active[pick] = active[active.length - 1];
				active.pop();
				h.toybox.despawn(index);
			}
			h.tick(h.DT_FRAME);
		}

		for (const index of active) {
			h.toybox.despawn(index, true);
		}
		for (let f = 0; f < 120; f++) {
			h.tick(h.DT_FRAME);
		}
		h.purge_all();
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});

	it("stop_cleans_active", () => {
		for (let i = 0; i < 16; i++) {
			expect(h.toybox.spawn(h.TOY_KEY)).not.toBeNull();
		}
		expect(count_active(h.toybox.mempool)).toBe(16);

		h.teardown();
		expect(h.toybox.mempool.takencount).toBe(0);
		expect(h.itembox.mempool.takencount).toBe(0);
	});
});

// 2026-06-14, Composer: toybox lifecycle stress tests in Node [tbxst1]
