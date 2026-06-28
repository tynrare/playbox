// 2026-06-28, Composer: welds nested dispose cascade flag tests [wldtst1]
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EventsBus from "../src/core/eventsbus.js";
import { VAR_FLAGS_A, VAR_FLAG_ACTIVE } from "../src/core/mempool.js";
import Itembox from "../src/scene/itembox.js";
import Toybox, {
	VAR_FLAG_DISPOSED,
	VAR_FLAG_INITIALIZED,
} from "../src/scene/toybox.js";

const DT_FRAME = 1 / 60;
const ROOT_KEY = "root_toy";
const MEMBER_KEY = "member_toy";
const SUB_KEY = "sub_toy";
const LEAF_KEY = "leaf_toy";

/**
 * @returns {{ get: (name: string) => { getkeys: () => string[], getconfig: (key: string) => Record<string, unknown>|undefined }|undefined }}
 */
function create_welds_db() {
	const items = {
		getkeys: () => ["box_test_item"],
		getconfig: (key) =>
			key === "box_test_item" ? { id: 1, body: "box" } : undefined,
	};
	const toys = {
		getkeys: () => [ROOT_KEY, MEMBER_KEY, SUB_KEY, LEAF_KEY],
		getconfig: (key) => {
			switch (key) {
				case ROOT_KEY:
					return {
						id: 1,
						item: "box_test_item",
						modules: ["welds"],
						welds: [MEMBER_KEY],
					};
				case MEMBER_KEY:
					return { id: 2, item: "box_test_item", modules: ["welds"] };
				case SUB_KEY:
					return {
						id: 3,
						item: "box_test_item",
						modules: ["welds"],
						welds: [LEAF_KEY],
					};
				case LEAF_KEY:
					return { id: 4, item: "box_test_item", modules: ["welds"] };
				default:
					return undefined;
			}
		},
	};
	return {
		get: (name) => (name === "items" ? items : name === "toys" ? toys : undefined),
	};
}

/**
 * @param {Toybox} toybox
 * @param {Itembox} itembox
 * @param {string} key
 * @returns {number}
 */
function spawn_and_init(toybox, itembox, key) {
	const index = toybox.spawn(key);
	expect(index).not.toBeNull();
	while (
		toybox.mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_INITIALIZED) === false
	) {
		itembox.step(DT_FRAME);
	}
	return index;
}

/**
 * @param {Toybox} toybox
 * @param {number} index
 * @returns {boolean}
 */
function is_toy_active(toybox, index) {
	return toybox.mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_ACTIVE);
}

/**
 * @param {Toybox} toybox
 * @param {number} index
 * @returns {boolean}
 */
function is_toy_disposed(toybox, index) {
	return toybox.mempool.read_flag(index, VAR_FLAGS_A, VAR_FLAG_DISPOSED);
}

/**
 * @param {Itembox} itembox
 * @param {number} maxFrames
 * @returns {void}
 */
function drain(itembox, maxFrames = 64) {
	for (let i = 0; i < maxFrames; i++) {
		itembox.step(DT_FRAME);
	}
}

describe("welds module", () => {
	/** @type {Toybox} */
	let toybox;
	/** @type {Itembox} */
	let itembox;

	beforeEach(() => {
		const db = create_welds_db();
		const eventsbus = new EventsBus();
		itembox = new Itembox(db, eventsbus);
		toybox = new Toybox(db, eventsbus, itembox);
		itembox.init();
		toybox.init();
		itembox.start();
		toybox.start();
	});

	afterEach(() => {
		toybox.stop();
		itembox.stop();
	});

	it("root_dispose_cascades_member_disposed_flag", () => {
		const root = spawn_and_init(toybox, itembox, ROOT_KEY);
		const member = spawn_and_init(toybox, itembox, MEMBER_KEY);
		const welds = toybox.modulebox.welds;

		toybox.modulebox.configure(root, { welds: [MEMBER_KEY] });
		toybox.modulebox.configure(member, { weld_root: root });
		welds.push_member(root, member);

		expect(welds.is_root(root)).toBe(true);
		expect(welds.is_member(member)).toBe(true);

		toybox.despawn(root, true);
		expect(is_toy_disposed(toybox, member)).toBe(true);

		drain(itembox);
		expect(is_toy_active(toybox, root)).toBe(false);
		expect(is_toy_active(toybox, member)).toBe(false);
	});

	it("nested_root_dispose_cascades_whole_subtree", () => {
		const root = spawn_and_init(toybox, itembox, ROOT_KEY);
		const sub = spawn_and_init(toybox, itembox, SUB_KEY);
		const leaf = spawn_and_init(toybox, itembox, LEAF_KEY);
		const welds = toybox.modulebox.welds;

		toybox.modulebox.configure(root, { welds: [SUB_KEY] });
		toybox.modulebox.configure(sub, { welds: [LEAF_KEY], weld_root: root });
		welds.push_member(root, sub);
		toybox.modulebox.configure(leaf, { weld_root: sub });
		welds.push_member(sub, leaf);

		expect(welds.is_root(root)).toBe(true);
		expect(welds.is_root(sub)).toBe(true);
		expect(welds.is_member(sub)).toBe(true);
		expect(welds.is_member(leaf)).toBe(true);

		toybox.despawn(root, true);
		expect(is_toy_disposed(toybox, sub)).toBe(true);
		expect(is_toy_disposed(toybox, leaf)).toBe(true);

		drain(itembox);
		expect(is_toy_active(toybox, root)).toBe(false);
		expect(is_toy_active(toybox, sub)).toBe(false);
		expect(is_toy_active(toybox, leaf)).toBe(false);
	});
});

// 2026-06-28, Composer: welds nested dispose cascade flag tests [wldtst1]
