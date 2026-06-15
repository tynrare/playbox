// 2026-06-14, Composer: shared shader default pill uniforms [rbdef1]
// 2026-06-14, Composer: port booling 2d rounded panel material [rbxm1]
// 2026-06-14, Composer: pill+edge mixed normals and colorb lighting [rbmix1]
import * as THREE from "three";

export const RoundedboxShaderDefaults = {
	pillDome: 0.3,
	edgeSharp: 0.6,
	edgeWidth: 0.1,
};

export const RoundedboxMaterialExtension = {
	name: "simple-roundedbox",
	uniforms: {
		rbSize: new THREE.Vector2(1, 1),
		rbRef: 1,
		corner: 0.05,
		pillDome: RoundedboxShaderDefaults.pillDome,
		edgeSharp: RoundedboxShaderDefaults.edgeSharp,
		edgeWidth: RoundedboxShaderDefaults.edgeWidth,
	},
	fragmentShader: (shader) => {
		shader = shader
			.replace(
				"void main() {",
				`
			float sdRound2dBox( in vec2 p, in vec2 b, in vec4 r )
			{
				r.xy = (p.x>0.0)?r.xy : r.zw;
				r.x  = (p.y>0.0)?r.x  : r.y;
				vec2 q = abs(p)-b+r.x;
				return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r.x;
			}

			float rbInside( vec2 p, vec2 b, float c )
			{
				return max(0.0, -sdRound2dBox(p, b, vec4(c)));
			}

			vec3 rbPillNormal( vec2 p, vec2 b )
			{
				float halfLen = max(0.0, b.x - b.y);
				vec2 spine = vec2(clamp(p.x, -halfLen, halfLen), 0.0);
				vec2 toSpine = p - spine;
				float R = max(b.y, 0.0001);
				vec2 radial = toSpine / R;
				float r2 = dot(radial, radial);
				float z = sqrt(max(0.001, 1.0 - min(0.99, r2)));
				return normalize(vec3(radial, z));
			}

			vec3 rbEdgeNormal( vec2 p, vec2 b, float c, float ew )
			{
				float eps = max(ew * 0.35, fwidth(p.x) + fwidth(p.y));
				vec2 g = vec2(
					sdRound2dBox(p + vec2(eps, 0.0), b, vec4(c))
						- sdRound2dBox(p - vec2(eps, 0.0), b, vec4(c)),
					sdRound2dBox(p + vec2(0.0, eps), b, vec4(c))
						- sdRound2dBox(p - vec2(0.0, eps), b, vec4(c))
				) / (2.0 * eps);
				return normalize(vec3(g, 0.0));
			}

			void main() {
			vec3 rbFinalColor = vec3(0.0);
			vec2 rbpos = vMapUv.xy - vec2(0.5, 0.5);
			// 2026-06-14, Composer: aspect sdf space for w/h scaled mesh [rbasp2]
			vec2 rbRatio = rbSize / max(rbSize.x, rbSize.y);
			vec2 rbposS = rbpos * rbRatio;
			vec2 rbbox = 0.5 * rbRatio;
			float rbcorner = corner * min(rbRatio.x, rbRatio.y);
			float rbd = sdRound2dBox(rbposS, rbbox, vec4(rbcorner));
			if (rbd > 0.0) discard;

			float inside = rbInside(rbposS, rbbox, rbcorner);
			// 2026-06-14, Composer: edgeWidth pct of wmin via rbRef [rbedg2]
			float edgeSize = edgeWidth * rbRef;
			float rbMinPlane = 2.0 * min(rbSize.x, rbSize.y);
			float ew = edgeSize / max(rbMinPlane, 0.001);
			vec3 nPill = rbPillNormal(rbposS, rbbox);
			vec3 nEdge = rbEdgeNormal(rbposS, rbbox, rbcorner, ew);
			vec3 nFlat = vec3(0.0, 0.0, 1.0);
			vec3 nP = normalize(mix(nFlat, nPill, pillDome));
			float insideWorld = inside * rbMinPlane;
			float edgeMask = 1.0 - smoothstep(0.0, edgeSize, insideWorld);
			vec3 rbn = normalize(mix(nP, nEdge, edgeMask * edgeSharp));

			vec3 rbMat = color;
			vec3 rbLight = emissive;

			vec3 l1 = normalize(vec3(-0.65, 0.85, 0.45));
			vec3 l2 = normalize(vec3(0.45, -0.25, 0.95));
			float d1 = max(0.0, dot(rbn, l1));
			float d2 = max(0.0, dot(rbn, l2));
			float diff = d1 * 0.75 + d2 * 0.25;

			float pillShade = mix(1.0, 0.18 + diff * 0.82, pillDome);
			vec3 body = rbMat * pillShade;

			float pillHighlight = pillDome * pow(diff, 2.8) * 0.55;
			float edgeHighlight = edgeMask * edgeSharp * pow(d1, 1.15) * 0.95;
			vec3 highlights = rbLight * (pillHighlight + edgeHighlight);

			rbFinalColor = body + highlights;
			`,
			)
			.replace(
				"#include <map_fragment>",
				`
			#ifdef USE_MAP
				diffuseColor.rgb = rbFinalColor;
			#else
				diffuseColor.rgb = rbFinalColor;
			#endif
			`,
			)
			.replace(
				"#include <color_fragment>",
				`diffuseColor.rgb = rbFinalColor;`,
			)
			.replace(
				"#include <emissivemap_fragment>",
				`totalEmissiveRadiance = vec3(0.0);`,
			)
			.replace(
				"#include <lights_lambert_fragment>",
				`
			#include <lights_lambert_fragment>
			reflectedLight.directDiffuse = rbFinalColor;
			reflectedLight.indirectDiffuse = vec3(0.0);
			`,
			);
		return shader;
	},
};
// 2026-06-14, Composer: shared shader default pill uniforms [rbdef1]
// 2026-06-14, Composer: port booling 2d rounded panel material [rbxm1]
// 2026-06-14, Composer: pass edgeWidth into helper for instanced locals [rbfix1]
// 2026-06-14, Composer: edgeWidth pct of wmin via rbRef [rbedg2]
// 2026-06-14, Composer: aspect sdf space for w/h scaled mesh [rbasp2]
// 2026-06-14, Composer: pill+edge mixed normals and colorb lighting [rbmix1]
