// SDF alpha sampling for font sprites (pairs with SimplefontMaterialExtension)

// 2026-06-12, Composer: signed-distance alpha from atlas cropuv [sdfnt1]
export const SdfFontMaterialExtension = {
	name: "sdf-font",
	uniforms: {},
	fragmentShader: (shader) => {
		// 2026-06-12, Composer: distance in .r; atlas alpha is opaque [sdfnt2]
		const sdfMapFrag = `
			#ifdef USE_MAP

				float sdf_dist = texture2D( map, cropuv ).r;
				float sdf_w = fwidth( sdf_dist ) * 0.5;
				float sdf_mask = smoothstep( 0.5 - sdf_w, 0.5 + sdf_w, sdf_dist );
				diffuseColor.a *= sdf_mask;

			#endif
		`;
		const sdfEmissiveFrag = `
			#ifdef USE_EMISSIVEMAP

				float sdf_em_dist = texture2D( emissiveMap, cropuv ).r;
				float sdf_em_w = fwidth( sdf_em_dist ) * 0.5;
				float sdf_em_mask = smoothstep( 0.5 - sdf_em_w, 0.5 + sdf_em_w, sdf_em_dist );
				totalEmissiveRadiance *= sdf_em_mask;

			#endif
		`;
		shader = shader.replace(
			/#ifdef USE_MAP\s*vec4 sampledDiffuseColor = texture2D\( map, cropuv \);\s*diffuseColor \*= sampledDiffuseColor;\s*#endif/,
			sdfMapFrag,
		);
		shader = shader.replace(
			/#ifdef USE_EMISSIVEMAP\s*vec4 emissiveColor = texture2D\( emissiveMap, cropuv \);\s*totalEmissiveRadiance \*= emissiveColor\.rgb;\s*#endif/,
			sdfEmissiveFrag,
		);
		return shader;
	},
};
// 2026-06-12, Composer: signed-distance alpha from atlas cropuv [sdfnt1]
// 2026-06-12, Composer: distance in .r; atlas alpha is opaque [sdfnt2]
