// 2026-06-14, Composer: port a_legacy spritesheet material [sprmat1]
import * as THREE from "three";

export const SpriteMaterialExtension = {
	name: "simple-sprite",
	uniforms: {
		frames: 1,
		frame: 0,
		cells_w: 1,
		cells_h: 1,
		pad_x: 0.0,
		pad_y: 0.0,
	},
	fragmentShader: (shader) => {
		shader = shader.replace(
			"void main() {",
			`
			uniform float pad_x;
			uniform float pad_y;

			void main() {
				vec2 cropuv = vMapUv.xy;
				float cell_xf = 1.0 / cells_w;
				float cell_yf = 1.0 / cells_h;

				cropuv -= 0.5;
				cropuv.x *= (0.5 - pad_x) * 2.0;
				cropuv.y *= (0.5 - pad_y) * 2.0;
				cropuv += 0.5;

				cropuv.x /= cells_w;
				cropuv.y /= cells_h;
				float cell_y = (1.0 + floor((frame) / cells_w));
				cropuv.y += (cells_h - cell_y) / cells_h;
				cropuv.x += mod(frame, cells_w) / cells_w;
			`)
			.replace(
			"#include <map_fragment>",
			`
			#ifdef USE_MAP

				vec4 sampledDiffuseColor = texture2D( map, cropuv );
				diffuseColor *= sampledDiffuseColor;

			#endif
			`
			)
			.replace(
			"#include <emissivemap_fragment>",
			`
			#ifdef USE_EMISSIVEMAP

				vec4 emissiveColor = texture2D( emissiveMap, cropuv );
				totalEmissiveRadiance *= emissiveColor.rgb;

			#endif
			`
			)

		return shader;
		}
}

export class MeshSpritesheetMaterial extends THREE.MeshLambertMaterial {
	/**
	 *
	 * @param {THREE.MeshStandardMaterialParameters} parameters
	 */
	constructor(parameters) {
		super(parameters);
		this.setValues(parameters);
	}

	/**
	 *
	 * @param {{vertexShader:string,fragmentShader:string,uniforms:Object}} shader - The object holds the uniforms and the vertex and fragment shader source.
	 */
	onBeforeCompile(shader) {
		//console.log(shader.fragmentShader)
	}
}
// 2026-06-14, Composer: port a_legacy spritesheet material [sprmat1]
