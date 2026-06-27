// Headless harness for toybox lifecycle stress tests in Node.
// 2026-06-14, Composer: mock db harness for toybox stress tests [tbxst1]
// 2026-06-26, Composer: harness init and item-only step tick [tbxst2]
import EventsBus from "../../src/core/eventsbus.js";
import { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../../src/core/mempool.js";
import Itembox from "../../src/scene/itembox.js";
import Toybox from "../../src/scene/toybox.js";

const TOY_KEY = "stress_toy";
const DT_FRAME = 1 / 60;

/**
 * @param {{ lifespan?: number }} [opts]
 * @returns {{ get: (name: string) => { getkeys: () => string[], getconfig: (key: string) => Record<string, unknown>|undefined }|undefined }}
 */
export function create_mock_db(opts = {}) {
	const lifespan = opts.lifespan ?? 1;
	const items = {
		getkeys: () => ["box_test_item"],
		getconfig: (key) =>
			key === "box_test_item" ? { id: 1, body: "box" } : undefined,
	};
	const toys = {
		getkeys: () => [TOY_KEY],
		getconfig: (key) =>
			key === TOY_KEY
				? {
						id: 1,
						item: "box_test_item",
						modules: ["lifespan"],
						lifespan,
					}
				: undefined,
	};
	return {
		get: (name) => (name === "items" ? items : name === "toys" ? toys : undefined),
	};
}

/**
 * @param {import("../../src/core/mempool.js").default} mempool
 * @returns {number}
 */
export function count_active(mempool) {
	let n = 0;
	for (let i = 0; i < mempool.chunk_size; i++) {
		if (mempool.read_flag(i, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
			n++;
		}
	}
	return n;
}

/**
 * @param {{ lifespan?: number }} [opts]
 * @returns {{
 *   db: ReturnType<typeof create_mock_db>,
 *   eventsbus: EventsBus,
 *   itembox: Itembox,
 *   toybox: Toybox,
 *   tick: (dt: number) => void,
 *   drain: (maxFrames?: number) => void,
 *   teardown: () => void,
 *   events: { toy_init: number, toy_dispose: number, item_init: number, item_dispose: number },
 *   TOY_KEY: string,
 *   DT_FRAME: number,
 * }}
 */
export function create_harness(opts = {}) {
	const db = create_mock_db(opts);
	const eventsbus = new EventsBus();
	const itembox = new Itembox(db, eventsbus);
	const toybox = new Toybox(db, eventsbus, itembox);
	const events = {
		toy_init: 0,
		toy_dispose: 0,
		item_init: 0,
		item_dispose: 0,
	};
	const ids = [
		eventsbus.on("toy.initialize", () => {
			events.toy_init++;
		}),
		eventsbus.on("toy.dispose", () => {
			events.toy_dispose++;
		}),
		eventsbus.on("item.initialize", () => {
			events.item_init++;
		}),
		eventsbus.on("item.dispose", () => {
			events.item_dispose++;
		}),
	];

	itembox.init();
	toybox.init();
	itembox.start();
	toybox.start();

	let torn_down = false;

	return {
		db,
		eventsbus,
		itembox,
		toybox,
		events,
		TOY_KEY,
		DT_FRAME,
		tick(dt) {
			itembox.step(dt);
		},
		drain(maxFrames = 512) {
			for (let i = 0; i < maxFrames; i++) {
				this.tick(i & 1 ? DT_FRAME : 0);
				if (
					itembox.mempool.takencount === 0 &&
					toybox.mempool.takencount === 0
				) {
					return;
				}
			}
		},
		teardown() {
			if (torn_down) {
				return;
			}
			torn_down = true;
			toybox.stop();
			itembox.stop();
			for (const id of ids) {
				eventsbus.off(id);
			}
		},
		purge_all() {
			for (let pass = 0; pass < 8; pass++) {
				for (let i = 0; i < toybox.mempool.chunk_size; i++) {
					if (toybox.mempool.read_flag(i, VAR_FLAGS_A, VAR_FLAG_ACTIVE)) {
						toybox.despawn(i, true);
					}
				}
				this.drain(128);
			}
		},
	};
}

// 2026-06-14, Composer: mock db harness for toybox stress tests [tbxst1]
// 2026-06-26, Composer: harness init and item-only step tick [tbxst2]
