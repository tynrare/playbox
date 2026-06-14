import * as THREE from "three";

export const SimplefontMaterialExtension = {
	name: "simple-font",
	uniforms: {
		pad_x: 0, 
		pad_y: 0, 
		frame_w: 1, 
		frame_h: 1, 
	},
	fragmentShader: (shader) => {
		shader = shader.replace(
			"void main() {",
			`

			void main() {
				vec2 cropuv = vMapUv.xy;
				cropuv.x *= frame_w;
				cropuv.y *= frame_h;
				cropuv.x += pad_x;
				cropuv.y += pad_y;
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

export class MeshSimplefontMaterial extends THREE.MeshLambertMaterial {
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
