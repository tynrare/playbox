// MSDF alpha sampling for font sprites (pairs with SimplefontMaterialExtension)

import * as THREE from "three";

// 2026-06-12, Composer: multi-channel distance alpha from atlas cropuv [msdfnt1]
export const MsdfFontMaterialExtension = {
	name: "msdf-font-v2",
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

			// 2026-06-19, Composer: corner-tap median interp, not rgb lerp [msdfnt8]
			float msdf_sampleDist( sampler2D tex, vec2 uv ) {
				vec2 st = uv * msdf_tex_size - 0.5;
				vec2 i = floor( st );
				vec2 f = fract( st );
				vec2 px = 1.0 / msdf_tex_size;
				vec3 v00 = texture2D( tex, ( i + vec2( 0.5, 0.5 ) ) * px ).rgb;
				vec3 v10 = texture2D( tex, ( i + vec2( 1.5, 0.5 ) ) * px ).rgb;
				vec3 v01 = texture2D( tex, ( i + vec2( 0.5, 1.5 ) ) * px ).rgb;
				vec3 v11 = texture2D( tex, ( i + vec2( 1.5, 1.5 ) ) * px ).rgb;
				float m00 = msdf_median( v00.r, v00.g, v00.b );
				float m10 = msdf_median( v10.r, v10.g, v10.b );
				float m01 = msdf_median( v01.r, v01.g, v01.b );
				float m11 = msdf_median( v11.r, v11.g, v11.b );
				return mix( mix( m00, m10, f.x ), mix( m01, m11, f.x ), f.y );
			}

			float msdf_maskFromDist( float sd ) {
				float w = max( fwidth( sd ) * 0.5, 1e-4 );
				// 2026-06-19, Composer: boldness scales with edge width [msdfnt9]
				float edge = msdf_boldness * w * 2.0;
				return smoothstep( 0.5 - w - edge, 0.5 + w + edge, sd );
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

				float msdf_sd = msdf_sampleDist( map, cropuv );
				diffuseColor.a *= msdf_maskFromDist( msdf_sd );

			#endif
		`;
		const msdfEmissiveFrag = `
			#ifdef USE_EMISSIVEMAP

				float msdf_em_sd = msdf_sampleDist( emissiveMap, cropuv );
				totalEmissiveRadiance *= msdf_maskFromDist( msdf_em_sd );

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
// 2026-06-19, Composer: no 1px floor; tiny eps only for stability [msdfnt6]
// 2026-06-19, Composer: corner-tap median interp, not rgb lerp [msdfnt8]
// 2026-06-19, Composer: boldness scales with edge width [msdfnt9]
