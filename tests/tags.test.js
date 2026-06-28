// 2026-06-28, Composer: tags module configure and runtime API tests [tagtst1]
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import EventsBus from "../src/core/eventsbus.js";
import Itembox from "../src/scene/itembox.js";
import Toybox from "../src/scene/toybox.js";

const TOY_KEY = "tags_toy";
const DT_FRAME = 1 / 60;

/**
 * @returns {{ get: (name: string) => { getkeys: () => string[], getconfig: (key: string) => Record<string, unknown>|undefined }|undefined }}
 */
function create_tags_db() {
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
						modules: ["tags"],
						tags: ["coin", "grabbable"],
					}
				: undefined,
	};
	return {
		get: (name) => (name === "items" ? items : name === "toys" ? toys : undefined),
	};
}

describe("tags module", () => {
	/** @type {Toybox} */
	let toybox;
	/** @type {Itembox} */
	let itembox;

	beforeEach(() => {
		const db = create_tags_db();
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

	it("configure_module_sets_db_tags", () => {
		const index = toybox.spawn(TOY_KEY);
		expect(index).not.toBeNull();

		while (toybox.mempool.read_flag(index, 2, 1) === false) {
			itembox.step(DT_FRAME);
		}

		expect(toybox.has_tag(index, "coin")).toBe(true);
		expect(toybox.has_tag(index, "grabbable")).toBe(true);
		expect(toybox.has_tag(index, "unknown")).toBe(false);
		expect(toybox.get_tag_names()).toEqual(["coin", "grabbable"]);
	});

	it("runtime_add_tag", () => {
		const index = toybox.spawn(TOY_KEY);
		expect(index).not.toBeNull();

		while (toybox.mempool.read_flag(index, 2, 1) === false) {
			itembox.step(DT_FRAME);
		}

		expect(toybox.has_tag(index, "picked_up")).toBe(false);
		toybox.add_tag(index, "picked_up");
		expect(toybox.has_tag(index, "picked_up")).toBe(true);
		expect(toybox.get_tag_names()).toContain("picked_up");

		toybox.remove_tag(index, "coin");
		expect(toybox.has_tag(index, "coin")).toBe(false);
	});
});

// 2026-06-28, Composer: tags module configure and runtime API tests [tagtst1]
