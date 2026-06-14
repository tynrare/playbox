// MSDF alpha sampling for font sprites (pairs with SimplefontMaterialExtension)

import * as THREE from "three";

// 2026-06-12, Composer: multi-channel distance alpha from atlas cropuv [msdfnt1]
export const MsdfFontMaterialExtension = {
	name: "msdf-font",
	uniforms: {
		msdf_px_range: 4,
		msdf_tex_size: new THREE.Vector2(512, 256),
		msdf_boldness: 0,
	},
	fragmentShader: (shader) => {
		// 2026-06-12, Composer: declare msdf uniforms in GLSL source [msdfnt3]
		shader = `
			uniform float msdf_px_range;
			uniform vec2 msdf_tex_size;
			uniform float msdf_boldness;

			float msdf_median( float r, float g, float b ) {
				return max( min( r, g ), min( max( r, g ), b ) );
			}

			float msdf_screenPxRange( vec2 uv ) {
				vec2 unitRange = vec2( msdf_px_range ) / msdf_tex_size;
				vec2 screenTexSize = vec2( 1.0 ) / fwidth( uv );
				return max( 0.5 * dot( unitRange, screenTexSize ), 1.0 );
			}

			float msdf_maskFromSd( float sd, vec2 uv ) {
				// 2026-06-12, Composer: msdf_boldness shifts distance edge outward [msdfnt5]
				return clamp( msdf_screenPxRange( uv ) * ( sd - 0.5 + msdf_boldness ) + 0.5, 0.0, 1.0 );
			}

			${shader.replace(
				"void main() {",
				`
				void main() {
				`,
			)}
		`;
		// 2026-06-12, Composer: sample map inside USE_MAP where sampler is in scope [msdfnt4]
		const msdfMapFrag = `
			#ifdef USE_MAP

				vec3 msdf_rgb = texture2D( map, cropuv ).rgb;
				float msdf_sd = msdf_median( msdf_rgb.r, msdf_rgb.g, msdf_rgb.b );
				diffuseColor.a *= msdf_maskFromSd( msdf_sd, cropuv );

			#endif
		`;
		const msdfEmissiveFrag = `
			#ifdef USE_EMISSIVEMAP

				vec3 msdf_em_rgb = texture2D( emissiveMap, cropuv ).rgb;
				float msdf_em_sd = msdf_median( msdf_em_rgb.r, msdf_em_rgb.g, msdf_em_rgb.b );
				totalEmissiveRadiance *= msdf_maskFromSd( msdf_em_sd, cropuv );

			#endif
		`;
		shader = shader.replace(
			/#ifdef USE_MAP\s*vec4 sampledDiffuseColor = texture2D\( map, cropuv \);\s*diffuseColor \*= sampledDiffuseColor;\s*#endif/,
			msdfMapFrag,
		);
		shader = shader.replace(
			/#ifdef USE_EMISSIVEMAP\s*vec4 emissiveColor = texture2D\( emissiveMap, cropuv \);\s*totalEmissiveRadiance \*= emissiveColor\.rgb;\s*#endif/,
			msdfEmissiveFrag,
		);
		return shader;
	},
};
// 2026-06-12, Composer: multi-channel distance alpha from atlas cropuv [msdfnt1]
// 2026-06-12, Composer: median-of-RGB distance mask on map/emissive [msdfnt2]
// 2026-06-12, Composer: declare msdf uniforms in GLSL source [msdfnt3]
// 2026-06-12, Composer: sample map inside USE_MAP where sampler is in scope [msdfnt4]
// 2026-06-12, Composer: msdf_boldness shifts distance edge outward [msdfnt5]
