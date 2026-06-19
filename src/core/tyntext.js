/** @namespace ty */
import * as THREE from "three";
import logger from "../logger.js";
import { cache } from "../math.js";

import { DitheredOpacity } from "../render/materials/DitheredOpacity.js";
import { ExtendedMaterial } from "../render/materials/ExtendedMaterial.js";
import { MeshSimplefontMaterial, SimplefontMaterialExtension } from "../render/materials/simplefont.js";
import { SdfFontMaterialExtension } from "../render/materials/sdf.js";
import { MsdfFontMaterialExtension } from "../render/materials/msdf.js";
import { InstancedEntity, InstancedMesh2 } from "@three.ez/instanced-mesh";

class TyntextSource {
	constructor() {
		/** @type {InstancedMesh2} */
		this.imesh = null;
		this.dimensions = null;
		this.characters_raw = null;
		this.kernings_raw = null;
		/** @type {Map<string, number} */
		this.characters = new Map();
		/** @type {Map<string, Map<string, number>>} */
		this.kernings = new Map();

		this.cw = 10;
		this.ch = 10;
		this.frames = 100;
	}

	/**
	 * @param {TyntextSource} source
	 */
	copy(source) {
		this.imesh = source.imesh;
		this.dimensions = source.dimensions;
		this.characters_raw = source.characters_raw;
		this.kernings_raw = source.kernings_raw;
		this.characters = source.characters;
		this.kernings = source.kernings;
		this.cw = source.cw;
		this.ch = source.ch;
		this.frames = source.frames;
	}

	init(imesh, dimensions, characters, kernings, cw, ch) {
		this.characters.clear();
		this.imesh = imesh;
		this.dimensions = dimensions;
		this.characters_raw = characters;
		this.kernings_raw = kernings;

		for (let i = 0, kerningi = 0; i < characters.length; i++, kerningi++) {
			const glyph = String.fromCharCode(characters[i]);
			this.characters.set(glyph, i);
			const kerningmap = new Map();
			this.kernings.set(glyph, kerningmap);

			const kernings_count = kernings[kerningi];
			for (let ii = 0; ii < kernings_count; ii++) {
				const charcode = kernings[++kerningi];
				const kerning = kernings[++kerningi] / 0xffff - 0.5;
				kerningmap.set(String.fromCharCode(charcode), kerning);
			}
		}

		this.cw = cw;
		this.ch = ch;
		this.frames = cw * ch;
	}

	makeletters(count, callback) {
		this.imesh.addInstances(count, (mesh) => {
			this.imesh.setColorAt(mesh.id, cache.color0.setHex(0xffffff));
			mesh.setUniform("emissive", cache.color0.setHex(0xffffff).multiplyScalar(1));
			mesh.setUniform("opacity", 1.0);
			mesh.setUniform("pad_x", 0.0);
			mesh.setUniform("pad_y", 0.0);
			mesh.setUniform("frame_w", 1.0);
			mesh.setUniform("frame_h", 1.0);
			mesh.scale.setScalar(100);
			mesh.updateMatrix();
			callback(mesh);
		});
	}

}

/**
 * @class TyntextCore
 * @memberof ACore
 */
class TyntextCore {
	/**
	 * @param {import("./draw.js").default} draw
	 * @param {import("./db.js").default} db
	 * @param {import("./assets.js").default} assets
	 */
	constructor(draw, db, assets) {
		// 2026-06-14, Composer: playbox draw/db/assets deps for tyntext [tydeps1]
		this._draw = draw;
		this._db = db;
		this._assets = assets;

		/** @type {Map<string, TyntextSource} */
		this.sources = new Map();
	}

	maketext(fontname = "afont", ui = true) {
		const fontkey_ui = `${fontname}-ui`
		const fontkey = ui ? fontkey_ui : fontname;
		let source = this.sources.get(fontkey);
		if (!source) {
			const source_xx = new TyntextSource();
			const source_ui = new TyntextSource();
			this.sources.set(fontname, source_xx);
			this.sources.set(fontkey_ui, source_ui);

			const fontconf = this._db.get("fonts")?.getconfig(fontname);
			if (!fontconf) {
				logger.error(
					`TyntextCore::maketext "${name}" error: no font "${fontname}" declared`,
				);
				return null;
			}

			const imesh_xx = this._makemesh(fontconf, false);
			const imesh_ui = this._makemesh(fontconf, true);
			if (!imesh_ui || !imesh_xx) {
				return null;
			}

			// 2026-06-12, Composer: font glyph data from preloaded JSON config [tyjson1]
			const fontdata = this._loadfontdata(fontconf);
			if (!fontdata) {
				return null;
			}

			source_xx.init(
				imesh_xx,
				fontdata.dimensions,
				fontdata.characters,
				fontdata.kernings,
				fontdata.cw,
				fontdata.ch,
			);
			source_ui.copy(source_xx);
			source_ui.imesh = imesh_ui;

			source = ui ? source_ui : source_xx;
		}


		return new Tyntext(source);
	}

	/**
	 * @brief Decode font JSON from assets filecache via fonts db config key.
	 * @param {Object} fontconf - fonts db entry with config source keys.
	 * @returns {{dimensions: Uint16Array, characters: Uint16Array, kernings: Uint16Array, cw: number, ch: number}|null}
	 */
	_loadfontdata(fontconf) {
		const fontname = fontconf["name"];
		const configkey = fontconf["config"];
		const fontjson = this._assets.file(configkey);
		if (!fontjson) {
			logger.error(
				`TyntextCore::_loadfontdata "${fontname}" error: no font config "${configkey}" preloaded`,
			);
			return null;
		}

		const meta = String(fontjson["meta"] ?? "").split(",");
		const cw = parseInt(meta[0], 10) || 10;
		const ch = parseInt(meta[1], 10) || 10;

		return {
			dimensions: new Uint16Array(
				Uint8Array.fromBase64(fontjson["dimensions"]).buffer,
			),
			characters: new Uint16Array(
				Uint8Array.fromBase64(fontjson["characters"]).buffer,
			),
			kernings: new Uint16Array(
				Uint8Array.fromBase64(fontjson["kernings"]).buffer,
			),
			cw,
			ch,
		};
	}

	_makemesh(fontconf, ui = true) {
		const drawcore = this._draw.core;

		const fontname = fontconf["name"];
		const texturekey = fontconf["source"];
		// 2026-06-12, Composer: fonts db msdf/sdf flags select distance shader [tymsdf3]
		const msdf = fontconf["msdf"] === true;
		const sdf = !msdf && fontconf["sdf"] === true;
		// 2026-06-14, Composer: textures cached as THREE.Texture in assets.file [t3cch1]
		const file = this._assets.file(texturekey);
		if (!file) {
			logger.error(
				`TyntextCore::_makemesh "${fontname}" error: no texture "${texturekey}" preloaded`,
			);
			return null;
		}

		const key = `font-${fontname}-tasset${ui ? "-ui" : ""}${msdf ? "-msdf" : sdf ? "-sdf" : ""}`;

		let imesh = drawcore.getimesh(key);
		if (!imesh) {
			const extensions = [
				SimplefontMaterialExtension,
				...(msdf ? [MsdfFontMaterialExtension] : sdf ? [SdfFontMaterialExtension] : []),
				DitheredOpacity,
			];
			const materialProps = {
				map: file,
				emissiveMap: file,
				emissive: 0xffffff,
				alphaTest: msdf || sdf ? 0.01 : 0.3,
				emissiveIntensity: 0,
				color: 0xffffff,
				transparent: true,
			};
			if (msdf) {
				const fontjson = this._assets.file(fontconf["config"]);
				const page = fontjson?.pages?.[0];
				materialProps.msdf_px_range = fontjson?.distanceRange ?? 4;
				materialProps.msdf_tex_size = new THREE.Vector2(
					page?.width ?? file.image?.width ?? 512,
					page?.height ?? file.image?.height ?? 256,
				);
				// 2026-06-12, Composer: msdf_boldness from fonts db or JSON [tymsdf2]
				materialProps.msdf_boldness =
					fontconf["boldness"] ?? fontjson?.boldness ?? 0;
				// 2026-06-19, Composer: nearest msdf atlas + tighter alphaTest [tymsdf4]
				file.minFilter = THREE.NearestFilter;
				file.magFilter = THREE.NearestFilter;
				materialProps.alphaTest = 0.25;
			}
			const material = new ExtendedMaterial(
				MeshSimplefontMaterial,
				extensions,
				materialProps,
			);
			material.side = THREE.DoubleSide;
			const geometry = new THREE.PlaneGeometry();
			imesh = drawcore.initimesh(key, geometry, material, {
				castShadow: false,
			}, ui ? this._draw.sceneui : this._draw.scene);
			drawcore.inituniforms(key, {
				color: "vec3",
				emissive: "vec3",
				opacity: "float",
				pad_x: "float",
				pad_y: "float",
				frame_w: "float",
				frame_h: "float",
			});
			logger.log(`TyntextCore::_makemesh. Made ${key} instance`);
		}

		return imesh;
	}

	step(dt, _rdt) {
		this.sources.forEach((s) => {
			s.imesh.computeBoundingSphere();
		});
	}

}

/**
 * @class Tyntext
 * @memberof ACore
 */
class Tyntext {
	/** 
	 * @param {TyntextSource} source
	 */
	constructor(source) {
		/** @type {TyntextSource} */
		this.source = source;
		this.position = new THREE.Vector3(0, 0, 0);
		this.scale = new THREE.Vector3(1, 1, 1);
		this.anchor = new THREE.Vector2(0.5, 0.5);
		this._size = new THREE.Vector2(0, 0);
		/** @type {Array<InstancedEntity>} */
		this.letters = [];
		/** @type {Array<InstancedEntity | null>} */
		this.meshes = [];
		/** @type {Array<Object>} */
		this.tokens = [];
		this._text = "";
		this._text_updated = false;
		this.text = "ttt";
		this._sprite_factory = null;
		this._sprite_ui = true;

		this.fontsize = 100;

		this.color = 0xffffff;
		this.emissive = 0xffffff;
		this.glow = 1;
		this.opacity = 1;
		this.spacing = 0.1;
		this.crop = 0xffff;
	}

	set text(t) {
		const text = `${t ?? ""}`;
		if (this._text === text) {
			return;
		}
		this._text = text;
		this._text_updated = true;
	}

	get text() {
		return this._text;
	}

	setspritefactory(factory, ui = true) {
		this._sprite_factory = factory;
		this._sprite_ui = ui;
		this._text_updated = true;
	}

	// 2026-04-29, Codex 5.3: inline sprite tokens and text guard [c8f27a]
	_parse_tokens(text) {
		/** @type {Array<Object>} */
		const tokens = [];
		for (let i = 0; i < text.length; i++) {
			const glyph = text[i];
			if (glyph === "\n") {
				tokens.push({ kind: "newline" });
				continue;
			}
			if (glyph === "#" && text[i + 1] === "[") {
				const end = text.indexOf("]", i + 2);
				if (end !== -1) {
					const sprite = text.slice(i + 2, end).trim();
					if (sprite.length) {
						tokens.push({ kind: "sprite", sprite });
						i = end;
						continue;
					}
				}
				tokens.push({ kind: "glyph", glyph: "#" });
				continue;
			}
			tokens.push({ kind: "glyph", glyph });
		}
		return tokens;
	}

	_make_letter_mesh() {
		let mesh = null;
		this.source.makeletters(1, (l) => {
			mesh = l;
		});
		if (mesh) {
			mesh.__ty_kind = "glyph";
		}
		return mesh;
	}

	_make_sprite_mesh(sprite) {
		if (!this._sprite_factory) {
			return null;
		}
		const mesh = this._sprite_factory(sprite, this._sprite_ui);
		if (!mesh) {
			return null;
		}
		mesh.__ty_kind = "sprite";
		mesh.__ty_sprite = sprite;
		mesh.__ty_base_scale = mesh.scale.clone();
		return mesh;
	}

	_remove_mesh(mesh) {
		if (!mesh) {
			return;
		}
		mesh.scale.setScalar(0);
		mesh.updateMatrix();
		mesh.remove();
	}

	_rebuild_content() {
		const parsed = this._parse_tokens(this._text);
		const oldmeshes = this.meshes;
		/** @type {Array<InstancedEntity | null>} */
		const meshes = [];
		/** @type {Array<Object>} */
		const tokens = [];

		for (let i = 0; i < parsed.length; i++) {
			let token = parsed[i];
			let mesh = oldmeshes[i] ?? null;

			if (token.kind === "newline") {
				if (mesh) {
					this._remove_mesh(mesh);
				}
				meshes.push(null);
				tokens.push(token);
				continue;
			}

			if (token.kind === "sprite") {
				if (!mesh || mesh.__ty_kind !== "sprite" || mesh.__ty_sprite !== token.sprite) {
					this._remove_mesh(mesh);
					mesh = this._make_sprite_mesh(token.sprite);
				}
				if (!mesh) {
					token = { kind: "glyph", glyph: "#" };
				}
			}

			if (token.kind === "glyph") {
				if (!mesh || mesh.__ty_kind !== "glyph") {
					this._remove_mesh(mesh);
					mesh = this._make_letter_mesh();
				}
			}

			meshes.push(mesh);
			tokens.push(token);
		}

		for (let i = parsed.length; i < oldmeshes.length; i++) {
			this._remove_mesh(oldmeshes[i]);
		}

		this.meshes = meshes;
		this.tokens = tokens;
		this.letters = this.meshes.filter((m) => m?.__ty_kind === "glyph");
		this._text_updated = false;
	}

	update() {
		if (this._text_updated) {
			this._rebuild_content();
		}

		if (!this.tokens.length) {
			return;
		}

		let x = 0;
		let y = 0;
		this._size.setScalar(0);
		let pmesh = null;
		let pglyph = null;
		// 2026-06-10, Composer: stable row anchor via "0" glyph metrics, original _size.y semantics [tyny3]
		const line_h = this.fontsize * this.scale.y;
		const zero_index = this.source.characters.get("0") ?? 0;
		const zero_descend = this.source.dimensions[zero_index * 8 + 6] / 0xffff - 0.5;
		const zero_ratio_y = this.source.dimensions[zero_index * 8 + 5] / 0xffff;
		const zero_scale_y = (zero_ratio_y || 0.5) * line_h;
		const accumulate_row = (row) => {
			const y0 = zero_scale_y * 0.5 - zero_descend * line_h - row * line_h - line_h * 0.5;
			const row_ybaselinemin = y0 + zero_descend * this.fontsize * 2;
			this._size.y = Math.min(this._size.y, row_ybaselinemin - zero_scale_y * 0.5);
		};

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];
			const mesh = this.meshes[i];
			if (i >= this.crop) {
				if (mesh) {
					mesh.visible = false;
				}
				continue;
			}
			if (token.kind == "newline") {
				if (mesh) {
					mesh.visible = false;
				}
				x = 0;
				y += 1;
				pmesh = null;
				pglyph = null;
				accumulate_row(y);
				continue;
			}

			if (!mesh) {
				continue;
			}

			if (token.kind === "sprite") {
				this.drawsprite(mesh, x++, y, pmesh);
				pglyph = null;
			} else {
				this.drawletter(mesh, token.glyph, x++, y, pmesh, pglyph);
				pglyph = token.glyph;
			}
			pmesh = mesh;
			mesh.visible = true;
			this._size.x = Math.max(this._size.x, mesh.position.x + mesh.scale.x * 0.5);
			accumulate_row(y);
		}

		for (let i = 0; i < this.meshes.length; i++) {
			const mesh = this.meshes[i];
			if (!mesh) {
				continue;
			}
			mesh.position.add(this.position);
			mesh.position.x -= this._size.x * this.anchor.x;
			// 2026-06-14, Composer: anchory 0=bottom 1=top like ui layout [tyan1]
			mesh.position.y -= this._size.y * (1 - this.anchor.y);
			mesh.updateMatrix();
		}

		//this.source.imesh.computeBoundingSphere();
	}

	drawletter(mesh, glyph, posx, posy, pmesh, pglyph) {
		mesh.position.setScalar(0);

		this.setletter(mesh, glyph, this.fontsize, posx, posy, pmesh, pglyph);

		mesh.color = cache.color0.setHex(this.color);
		mesh.setUniform("emissive", cache.color0.setHex(this.emissive).multiplyScalar(this.glow));
		mesh.setUniform("opacity", this.opacity);

		return mesh;
	}

	drawsprite(mesh, posx, posy, pmesh) {
		mesh.position.setScalar(0);
		this.setsprite(mesh, this.fontsize, posx, posy, pmesh);
		mesh.owner?.setColorAt(mesh.id, cache.color0.setHex(this.color));
		mesh.setUniform("emissive", cache.color0.setHex(this.emissive).multiplyScalar(this.glow));
		mesh.setUniform("opacity", this.opacity);
		return mesh;
	}

	setletter(mesh, glyph, fontsize, posx, posy, pmesh, pglyph) {
		const charindex = this.source.characters.get(glyph) ?? 0;

		const frame_w = this.source.dimensions[charindex * 8 + 2] / 0xffff;
		const frame_h = this.source.dimensions[charindex * 8 + 3] / 0xffff;
		const pad_x = this.source.dimensions[charindex * 8 + 0] / 0xffff;
		const pad_y = 1 - this.source.dimensions[charindex * 8 + 1] / 0xffff - frame_h;
		const ratio_x = this.source.dimensions[charindex * 8 + 4] / 0xffff;
		const ratio_y = this.source.dimensions[charindex * 8 + 5] / 0xffff;
		const descend = this.source.dimensions[charindex * 8 + 6] / 0xffff - 0.5;

		mesh.setUniform("pad_x", pad_x);
		mesh.setUniform("pad_y", pad_y);
		mesh.setUniform("frame_w", frame_w);
		mesh.setUniform("frame_h", frame_h);

		mesh.scale.setScalar(fontsize).multiply(this.scale);
		mesh.scale.x *= ratio_x || 0.5;
		mesh.scale.y *= ratio_y || 0.5;

		const ppos = (pmesh?.position.x ?? 0);
		const pwidth = pmesh?.scale.x ?? 0;
		const kerning = posx !== 0 && pglyph ? this.source.kernings.get(pglyph)?.get(glyph) ?? 0 : 0;

		const fontsize_x = fontsize * this.scale.x;
		const fontsize_y = fontsize * this.scale.y;
		const x = ppos + pwidth * 0.5 + mesh.scale.x * 0.5 + kerning * fontsize_x + this.spacing * fontsize_x * 0.5;
		const y = mesh.scale.y * 0.5 - descend * fontsize_y - posy * fontsize_y * 1.0 - fontsize_y * 0.5;

		mesh.position.x += x;
		mesh.position.y += y;
	}

	setsprite(mesh, fontsize, posx, posy, pmesh) {
		// 2026-04-29, Codex 5.3: sprite baseline align with glyph row [7b91de]
		const fontsize_x = fontsize * this.scale.x;
		const fontsize_y = fontsize * this.scale.y;
		const base_scale = mesh.__ty_base_scale ?? cache.vec3.v0.set(1, 1, 1);
		mesh.scale.copy(base_scale);
		mesh.scale.x *= fontsize_x;
		mesh.scale.y *= fontsize_y;
		const ppos = (pmesh?.position.x ?? 0);
		const pwidth = pmesh?.scale.x ?? 0;
		const x = ppos + pwidth * 0.5 + mesh.scale.x * 0.5 + this.spacing * fontsize_x * 0.5;
		// 2026-04-29, Codex 5.3: anchor sprite baseline to "0" glyph metrics [e31fa2]
		// 2026-04-29, Codex 5.3: center sprite row by "0" glyph box [d4a82c]
		const zero_index = this.source.characters.get("0") ?? 0;
		const zero_descend = this.source.dimensions[zero_index * 8 + 6] / 0xffff - 0.5;
		const zero_ratio_y = this.source.dimensions[zero_index * 8 + 5] / 0xffff;
		const zero_scale_y = (zero_ratio_y || 0.5) * fontsize_y;
		const y = zero_scale_y * 0.5 - zero_descend * fontsize_y - posy * fontsize_y - fontsize_y * 0.5;
		mesh.position.x += x;
		mesh.position.y += y;
	}

	remove() {
		this.text = "";
		this.update();
	}
}

export { TyntextCore, Tyntext };
// 2026-06-14, Composer: playbox draw/db/assets deps for tyntext [tydeps1]
// 2026-04-29, Codex 5.3: inline sprite tokens and text guard [c8f27a]
// 2026-04-29, Codex 5.3: sprite baseline align with glyph row [7b91de]
// 2026-04-29, Codex 5.3: anchor sprite baseline to "0" glyph metrics [e31fa2]
// 2026-04-29, Codex 5.3: center sprite row by "0" glyph box [d4a82c]
// 2026-04-29, Codex 5.3: ignore sprite tokens for text vertical bounds [af62bd]
// 2026-05-27, Composer: anchor Y from full multiline bounds incl sprites [tyny1]
// 2026-06-10, Composer: stable row anchor via "0" glyph metrics, original _size.y semantics [tyny3]
// 2026-06-12, Composer: texture sdf flag toggles SDF font shader [tysdf1]
// 2026-06-12, Composer: font glyph data from preloaded JSON config [tyjson1]
// 2026-06-12, Composer: texture msdf/sdf flags select distance shader [tymsdf1]
// 2026-06-12, Composer: msdf_boldness from fonts db or JSON [tymsdf2]
// 2026-06-12, Composer: fonts db msdf/sdf flags select distance shader [tymsdf3]
// 2026-06-19, Composer: nearest msdf atlas + tighter alphaTest [tymsdf4]
// 2026-06-14, Composer: anchory 0=bottom 1=top like ui layout [tyan1]
