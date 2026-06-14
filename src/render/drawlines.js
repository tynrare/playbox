import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import * as THREE from "three";

class Drawlines {
	constructor(opts) {
        const lineMaterial = new LineMaterial({
            color: opts?.color ?? 0xffffff,
            vertexColors:  opts?.vertexColors ?? true,
			linewidth:  opts?.linewidth ?? 4,
			alphaToCoverage:  opts?.alphaToCoverage ?? true,
        });
		this.lineMaterial = lineMaterial;
		/** @type {LineSegments2} */
		this.pivot = null;

		this.indraw = false;
    }

    begin() {
		this.indraw = true;
		this.iterator = 0;
    }

    end() {
		if (!this.indraw) {
			return;
		}
		this.indraw = false;

		for (let i = this.iterator; i < this.linePositions.length; i++) {
			this.linePositions[i] = 1;
			this.lineColors[i] = 1;
		}
		this.geometry.setPositions( this.linePositions );
		this.geometry.setColors( this.lineColors );
    }

	/**
	 * 
	 * @param {THREE.Vector3} from 
	 * @param {THREE.Vector3} to 
	 * @param {THREE.Vector3Like} color 
	 */
    line(from, to, color, clamplimit = false) {
		if (!this.indraw) {
			this.begin();
		}
		
		const i = this.iterator;
		if (i + 6 > this.linePositions.length) {
			if (!clamplimit) {
				this.init(this.linePositions.length / 3 * 2);
			}
			return;
		}

        this.linePositions[i + 0] = from.x;
        this.linePositions[i + 1] = from.y;
        this.linePositions[i + 2] = from.z;
        this.linePositions[i + 3] = to.x;
        this.linePositions[i + 4] = to.y;
        this.linePositions[i + 5] = to.z;

        this.lineColors[i + 0] = color?.x ?? 0x000000;
        this.lineColors[i + 1] = color?.y ?? 0x000000;
        this.lineColors[i + 2] = color?.z ?? 0x000000;
        this.lineColors[i + 3] = color?.x ?? 0x000000;
        this.lineColors[i + 4] = color?.y ?? 0x000000;
        this.lineColors[i + 5] = color?.z ?? 0x000000;
		this.iterator += 6;
    }

	init(pointscount = 100) {
		const _pointscount = pointscount * 3;
		this.linePositions = new Float32Array(_pointscount);
        this.lineColors = new Float32Array(_pointscount);

		const geometry = new LineSegmentsGeometry();
		this.geometry = geometry;
		this.pivot?.removeFromParent();
        this.pivot = new LineSegments2(geometry, this.lineMaterial);
	}

	dispose() {
		// 2026-04-27, Codex 5.3: detach drawlines pivot before disposal [b6t9]
		this.pivot?.removeFromParent();
		this.geometry.dispose();
		this.lineMaterial.dispose();
		this.geometry = null;
		this.lineMaterial = null;
		this.linePositions = null;
		this.lineColors = null;
		this.pivot = null;
	}

}

export default Drawlines;
// 2026-04-27, Codex 5.3: detach drawlines pivot before disposal [b6t9]