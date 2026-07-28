import {
    _decorator,
    Component,
    Camera,
    Node,
    Vec3,
    Quat,
    EventHandler,
    CCFloat,
} from 'cc';

import { EDITOR } from 'cc/env';

import Spline from './spline';
import CurveSample from './curve-sample';

const {
    ccclass,
    property,
    executeInEditMode,
    requireComponent,
} = _decorator;

export enum CameraPlayState {
    Stopped,
    Playing,
    Paused,
}

@ccclass('SplineCameraController')
@requireComponent(Camera)
@executeInEditMode(true)
export class SplineCameraController extends Component {

    //==================================================
    // References
    //==================================================

    @property(Spline)
    spline: Spline = null!;

    @property(Camera)
    camera: Camera = null!;

    //==================================================
    // Spline
    //==================================================

    @property({
        group: {
            id: 'spline',
            name: 'Spline',
        }
    })
    loop = false;

    private _reverse = false;
    @property({
        tooltip: '反向播放Spline',
        group: {
            id: 'spline',
            name: 'Spline',
        }
    })
    get reverse() {
        return this._reverse;
    }

    set reverse(value) {
        this._reverse = value;

        if (this.isEditorPreviewEnabled()) {
            this.updatePreview();
        }
    }

    //==================================================
    // Runtime
    //==================================================

    @property({
        tooltip: '播放速度（单位：Spline距离/秒）',
        group: {
            id: 'runtime',
            name: 'Runtime',
        }
    })
    speed = 5;

    @property({
        tooltip: '运行时启动自动播放',
        group: {
            id: 'runtime',
            name: 'Runtime',
        }
    })
    playOnStart = true;

    //==================================================
    // Preview
    //==================================================

    private _previewInEditor = true;
    @property({
        tooltip: '编辑器中允许预览',
        group: {
            id: 'preview',
            name: 'Preview',
        }
    })
    get previewInEditor() {
        return this._previewInEditor;
    }

    set previewInEditor(value) {
        this._previewInEditor = value;

        if (EDITOR) {
            if (this._previewInEditor && this.playInEditor) {
                this.play();
            }
            else {
                this.playInEditor = false;
                this.stop();
            }
        }
    }

    private _playInEditor = false;
    @property({
        tooltip: '编辑器中自动播放',
        group: {
            id: 'preview',
            name: 'Preview',
        }
    })
    get playInEditor() {
        return this._playInEditor;
    }

    set playInEditor(value: boolean) {
        this._playInEditor = value;

        if (!this.isEditorPreviewEnabled()) {
            return;
        }

        if (this._playInEditor) {
            this.play();
        }
        else {
            this.stop();
        }
    }

    private _previewProgress = 0;

    @property({
        type: CCFloat,
        range: [0, 0.9999, 0.0001],
        slide: true,
        group: {
            id: 'preview',
            name: 'Preview',
        }
    })
    get previewProgress() {
        return this._previewProgress;
    }

    set previewProgress(v: number) {
        this._previewProgress = v;

        if (!this.isEditorPreviewEnabled()) {
            return;
        }

        this.updatePreview();
    }

    //==================================================
    // LookAt
    //==================================================

    @property({
        group: {
            id: 'lookAt',
            name: 'LookAt',
        }
    })
    lookAtEnabled = true;

    @property({
        tooltip: '没有指定LookAt目标时，沿Spline向前看的距离',
        group: {
            id: 'lookAt',
            name: 'LookAt',
        }
    })
    lookAheadDistance = 3;

    @property({
        type: Node,
        group: {
            id: 'lookAt',
            name: 'LookAt',
        }
    })
    lookAtTarget: Node | null = null;

    @property({
        group: {
            id: 'lookAt',
            name: 'LookAt',
        }
    })
    lookAtOffset = new Vec3();

    //==================================================
    // Events
    //==================================================

    @property({
        type: EventHandler,
        group: {
            id: 'event',
            name: 'Event',
        }
    })
    playFinishedEvents: EventHandler[] = [];

    //==================================================
    // Runtime State
    //==================================================

    private _state = CameraPlayState.Stopped;

    private _distance = 0;

    private readonly _sample = new CurveSample();

    private readonly _worldPosition = new Vec3();

    private readonly _worldRotation = new Quat();

    private readonly _splineRotation = new Quat();

    /** 当前是否处于启用中的编辑器预览状态。 */
    private isEditorPreviewEnabled(): boolean {
        return EDITOR && this._previewInEditor;
    }

    //==================================================
    // Life Cycle
    //==================================================

    start(): void {
        if (!this.isEditorPreviewEnabled() && this.playOnStart) {
            this.play();
        }
    }

    protected update(dt: number) {

        if (this.isEditorPreviewEnabled() && !this.playInEditor) {
            return;
        }

        if (this._state !== CameraPlayState.Playing) {
            return;
        }

        if (!this.isReady()) {
            return;
        }

        this._distance += this.speed * dt;

        if (this.loop) {

            this._distance = ((this._distance % this.spline.length) + this.spline.length) % this.spline.length;

        }
        else {

            if (this._distance >= this.spline.length) {

                this._distance = this.spline.length;

                this.applyCamera(this._distance);

                this.stop(false);

                EventHandler.emitEvents(this.playFinishedEvents, this);

                return;
            }

        }

        this.applyCamera(this._distance);
    }
    //==================================================
    // Public API
    //==================================================

    public play(): void {

        if (!this.isReady()) {
            return;
        }

        this._state = CameraPlayState.Playing;
    }

    public pause(): void {

        if (this._state === CameraPlayState.Playing) {
            this._state = CameraPlayState.Paused;
        }
    }

    public resume(): void {

        if (this._state === CameraPlayState.Paused) {
            this._state = CameraPlayState.Playing;
        }
    }

    public stop(resetProgress = true): void {

        this._state = CameraPlayState.Stopped;

        if (resetProgress) {
            this._distance = 0;
            this.applyCamera(this._distance);
        }
    }

    public jumpToStart(): void {

        this._distance = 0;

        this.applyCamera(this._distance);
    }

    public jumpToEnd(): void {

        this._distance = this.spline.length;

        this.applyCamera(this._distance);
    }

    public setProgress(progress: number): void {

        if (!this.isReady()) {
            return;
        }

        progress = Math.max(0, Math.min(1, progress));

        this._distance = progress * this.spline.length;

        this.applyCamera(this._distance);
    }

    public getProgress(): number {

        if (!this.isReady()) {
            return 0;
        }

        return this._distance / this.spline.length;
    }

    public isPlaying(): boolean {

        return this._state === CameraPlayState.Playing;
    }

    public isPaused(): boolean {

        return this._state === CameraPlayState.Paused;
    }

    public isStopped(): boolean {

        return this._state === CameraPlayState.Stopped;
    }

    //==================================================
    // Preview
    //==================================================

    private updatePreview() {

        if (!this.isReady()) {
            return;
        }

        this.applyCamera(
            this._previewProgress * this.spline.length
        );
    }

    //==================================================
    // Camera
    //==================================================

    private applyCamera(distance: number) {

        let d = this.normalizeDistance(distance);

        // 反向播放只在相机组件内部进行，不修改 Spline 的反转状态。
        const sampleDistance = this.getPlaybackDistance(d);

        const sample =
            this.spline.getSampleAtDistance(
                sampleDistance,
                this._sample
            );

        Vec3.transformMat4(
            this._worldPosition,
            sample.location,
            this.spline.node.worldMatrix
        );

        this.camera.node.setWorldPosition(
            this._worldPosition
        );

        if (this.lookAtEnabled) {

            const target =
                this.getLookAtPosition(d);

            this.camera.node.lookAt(
                target,
                Vec3.UP
            );

            return;
        }

        this.spline.node.getWorldRotation(
            this._splineRotation
        );

        Quat.multiply(
            this._worldRotation,
            this._splineRotation,
            sample.rotation
        );

        this.camera.node.setWorldRotation(
            this._worldRotation
        );
    }

    //==================================================
    // LookAt
    //==================================================

    private getLookAtPosition(
        distance: number
    ): Vec3 {

        const target = new Vec3();

        if (this.lookAtTarget) {

            this.lookAtTarget.getWorldPosition(
                target
            );

        }
        else {

            const lookDistance =
                this.normalizeDistance(
                    distance +
                    Math.max(
                        0,
                        this.lookAheadDistance
                    )
                );

            const sample =
                this.spline.getSampleAtDistance(
                    this.getPlaybackDistance(lookDistance)
                );

            Vec3.transformMat4(
                target,
                sample.location,
                this.spline.node.worldMatrix
            );
        }

        target.add(this.lookAtOffset);

        return target;
    }

    //==================================================
    // Utility
    //==================================================

    private getPlaybackDistance(distance: number): number {
        return this._reverse
            ? this.spline.length - distance
            : distance;
    }

    private normalizeDistance(distance: number): number {

        if (this.loop) {

            return (
                (
                    distance %
                    this.spline.length
                ) +
                this.spline.length
            ) %
                this.spline.length;
        }

        const epsilon = Math.min(
            0.001,
            this.spline.length * 0.5
        );

        return Math.max(
            epsilon,
            Math.min(
                distance,
                this.spline.length - epsilon
            )
        );
    }

    private isReady(): boolean {

        return !!(
            this.spline &&
            this.camera &&
            this.spline.length > 0
        );
    }
}
