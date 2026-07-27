import {
    _decorator,
    Component,
    Camera,
    Node,
    Vec3,
    Quat,
} from 'cc';

import Spline from './spline';
import CurveSample from './curve-sample';

const { ccclass, property } = _decorator;

@ccclass('SplineCameraFollow')
export default class SplineCameraFollow extends Component {
    @property(Spline)
    spline: Spline = null!;

    @property(Camera)
    camera: Camera = null!;

    @property
    speed = 5;

    @property
    loop = true;

    @property
    lookAtEnabled = true;

    @property({ tooltip: '没有指定目标节点时，镜头看向 Spline 前方的距离' })
    lookAheadDistance = 3;

    @property(Node)
    lookAtTarget: Node | null = null;

    @property({ tooltip: 'LookAt 目标的世界坐标偏移' })
    lookAtOffset = new Vec3();

    private distance = 0;
    private sample = new CurveSample();

    update(dt: number) {
        if (!this.spline || !this.camera || this.spline.length <= 0) {
            return;
        }

        this.distance += this.speed * dt;

        if (this.loop) {
            this.distance =
                ((this.distance % this.spline.length) + this.spline.length)
                % this.spline.length;
        } else {
            this.distance = Math.min(this.distance, this.spline.length);
        }

        // 该库在端点处会主动偏移 0.001，避免查找失败
        const d = this.normalizeDistance(this.distance);

        const sample = this.spline.getSampleAtDistance(d, this.sample);

        // Spline 局部位置转换为世界位置
        const worldPosition = new Vec3();
        Vec3.transformMat4(
            worldPosition,
            sample.location,
            this.spline.node.worldMatrix
        );

        this.camera.node.setWorldPosition(worldPosition);

        if (this.lookAtEnabled) {
            const target = this.getLookAtPosition(d);
            this.camera.node.lookAt(target, Vec3.UP);
            return;
        }

        // sample.rotation 是相对于 Spline 节点的局部旋转
        const splineWorldRotation = this.spline.node.getWorldRotation(new Quat());
        const worldRotation = new Quat();

        Quat.multiply(
            worldRotation,
            splineWorldRotation,
            sample.rotation
        );

        this.camera.node.setWorldRotation(worldRotation);
    }

    private getLookAtPosition(distance: number): Vec3 {
        const target = new Vec3();

        if (this.lookAtTarget) {
            this.lookAtTarget.getWorldPosition(target);
        } else {
            const lookAtDistance = this.normalizeDistance(
                distance + Math.max(0, this.lookAheadDistance)
            );
            const targetSample = this.spline.getSampleAtDistance(lookAtDistance);
            Vec3.transformMat4(
                target,
                targetSample.location,
                this.spline.node.worldMatrix
            );
        }

        target.add(this.lookAtOffset);
        return target;
    }

    private normalizeDistance(distance: number): number {
        if (this.loop) {
            return ((distance % this.spline.length) + this.spline.length)
                % this.spline.length;
        }

        const epsilon = Math.min(0.001, this.spline.length * 0.5);
        return Math.max(epsilon, Math.min(distance, this.spline.length - epsilon));
    }
}
