// 2026-06-18, Composer: fused pixelate+AO at W/P then upscale [pxaof1]
import {
  DepthTexture,
  HalfFloatType,
  NearestFilter,
  ShaderMaterial,
  WebGLRenderTarget,
} from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { N8AOPass } from "./N8AO.js";

/**
 * GPU path when pixelate and AO are both on: scene @ W/P, AO @ (W/P)×s, one upscale.
 */
class PixelateAOFusedPass extends Pass {
  /**
   * @param {number} pixelSize
   * @param {import("three").Scene} scene
   * @param {import("three").Camera} camera
   */
  constructor(pixelSize, scene, camera) {
    super();
    this.pixelSize = pixelSize;
    this.scene = scene;
    this.camera = camera;
    this._fullW = 1;
    this._fullH = 1;
    this._lowW = 1;
    this._lowH = 1;

    this._beautyRT = new WebGLRenderTarget(1, 1, { depthBuffer: true });
    this._beautyRT.texture.minFilter = NearestFilter;
    this._beautyRT.texture.magFilter = NearestFilter;
    this._beautyRT.texture.type = HalfFloatType;
    this._beautyRT.depthTexture = new DepthTexture(1, 1);
    this._beautyRT.depthTexture.minFilter = NearestFilter;
    this._beautyRT.depthTexture.magFilter = NearestFilter;

    this._aoOutRT = new WebGLRenderTarget(1, 1);
    this._aoOutRT.texture.minFilter = NearestFilter;
    this._aoOutRT.texture.magFilter = NearestFilter;
    this._aoOutRT.texture.type = HalfFloatType;

    this._n8ao = new N8AOPass(scene, camera, 1, 1);
    this._n8ao.configuration.gammaCorrection = false;
    this._n8ao.configuration.intensity = 2.0;
    this._n8ao.configuration.colorMultiply = false;
    this._n8ao.configuration.halfRes = false;
    // 2026-06-19, Composer: AO full-res; quality via render_scale [pxaof2]
    this._n8ao.configuration.aoBufferScale = 1.0;
    this._n8ao.configuration.depthAwareUpsampling = true;
    this._n8ao.configuration.aoSamples = 8;
    this._n8ao.configuration.denoiseSamples = 4;
    this._n8ao.configuration.denoiseRadius = 16;
    this._n8ao.configuration.aoTones = 0;
    this._n8ao.configuration.autoRenderBeauty = false;
    this._n8ao.configuration.accumulate = false;
    this._n8ao.configuration.transparencyAware = false;
    this._n8ao.renderToScreen = false;

    this._upscaleQuad = new FullScreenQuad(this._createUpscaleMaterial());
  }

  dispose() {
    this._beautyRT.dispose();
    this._aoOutRT.dispose();
    this._upscaleQuad.dispose();
  }

  firstFrame() {
    this._n8ao.firstFrame();
  }

  /**
   * @param {number} fullW
   * @param {number} fullH
   */
  setSize(fullW, fullH) {
    this._fullW = fullW;
    this._fullH = fullH;
    this._lowW = Math.max(1, (fullW / this.pixelSize) | 0);
    this._lowH = Math.max(1, (fullH / this.pixelSize) | 0);
    this._beautyRT.setSize(this._lowW, this._lowH);
    this._aoOutRT.setSize(this._lowW, this._lowH);
    this._n8ao.setSize(this._lowW, this._lowH);
  }

  /**
   * @param {import("three").WebGLRenderer} renderer
   * @param {import("three").WebGLRenderTarget} writeBuffer
   */
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this._beautyRT);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    const fakeRead = {
      texture: this._beautyRT.texture,
      depthTexture: this._beautyRT.depthTexture,
    };
    this._n8ao.render(renderer, this._aoOutRT, fakeRead, 0, false);

    const dst = this.renderToScreen ? null : writeBuffer;
    this._upscaleQuad.material.uniforms.tDiffuse.value = this._aoOutRT.texture;
    renderer.setRenderTarget(dst);
    if (this.clear) {
      renderer.clear();
    }
    this._upscaleQuad.render(renderer);
  }

  _createUpscaleMaterial() {
    return new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
    });
  }
}

export default PixelateAOFusedPass;
// 2026-06-18, Composer: fused pixelate+AO at W/P then upscale [pxaof1]
// 2026-06-19, Composer: AO full-res; quality via render_scale [pxaof2]
