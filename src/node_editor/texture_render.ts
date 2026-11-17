    import * as renderer from './renderer';
    import * as shaders from '../shaders/shaders';
    import { Stage } from '../stage/stage';


    import { GraphExecution } from '../library/parser/graph_execution';
    import { buildNodeShader, packParams } from '../library/node_shader_builder';
    import { nodeDefinitions, NodeType } from '../definitions';
    // temp
    import colorWGSL from '../library/node_shaders/generate/color.cs.wgsl?raw';

    export class TextureRenderer extends renderer.Renderer {

        outputTexture: GPUTexture;
        outputTextureView: GPUTextureView;

        textureComputePipeline: GPUComputePipeline;
        texComputeBindGroupLayout: GPUBindGroupLayout;
        texComputeBindGroup: GPUBindGroup;
        
        renderBindGroupLayout: GPUBindGroupLayout;
        renderBindGroup: GPUBindGroup;
        renderPipeline: GPURenderPipeline;
        sphereParamsBuffer?: GPUBuffer;

        sampler: GPUSampler;
        execution: GraphExecution;
        private readonly spherePreview: boolean;
        private sphereDragStart?: {
            button: number;
            pointerX: number;
            pointerY: number;
            centerX: number;
            centerY: number;
            yaw: number;
            pitch: number;
            radius: number;
        };

        private startTime = performance.now();


        constructor(
            stage: Stage,
            texture: GPUTexture,
            execution: GraphExecution,
            spherePreview = false,
            private readonly spherePosition = { x: 0.5, y: 0.5, radius: 1, yaw: 0, pitch: 0 }
        ) {
            super(stage);
            this.execution = execution;
            this.spherePreview = spherePreview;

            // this.outputTexture = renderer.device.createTexture({
            //     size: [512, 512],
            //     format: "rgba16float",
            //     usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            // });
            this.outputTexture = texture;
            this.outputTextureView = this.outputTexture.createView();

            this.sampler = renderer.device.createSampler({ magFilter: "linear", minFilter: "linear" });

            // pass storage texture 
            this.texComputeBindGroupLayout = renderer.device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: { access: "write-only", format: "rgba16float" }
                    }
                ]
            });
            this.texComputeBindGroup = renderer.device.createBindGroup({
                layout: this.texComputeBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.outputTextureView
                    }
                ]
            });


            // simple node builder test 
            const wgsl = buildNodeShader(nodeDefinitions[NodeType.Color], colorWGSL);
            console.log(wgsl);

            this.textureComputePipeline = renderer.device.createComputePipeline({
                layout: "auto",
                compute: {
                    module: renderer.device.createShaderModule({
                        label: "texture compute shader",
                        code: wgsl
                    }),
                    entryPoint: "main"
                }
            });

            // pass in uniforms: Params, outTex, other input Tex
            const data = packParams(nodeDefinitions[NodeType.Color], [[1, 0.5, 1, 1]], [false]);
            const paramsBuffer = renderer.device.createBuffer({
                size: data.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            renderer.device.queue.writeBuffer(paramsBuffer, 0, data);

            this.texComputeBindGroup = renderer.device.createBindGroup({
                layout: this.textureComputePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: paramsBuffer } },
                    { binding: 1, resource: this.outputTextureView },
                ],
            });

            // render pipeline: display texture 
            const renderBindings: GPUBindGroupLayoutEntry[] = [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float"
                        }
                    }, 
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: { type: "filtering" }
                    }
                ];
            if (spherePreview) {
                this.sphereParamsBuffer = renderer.device.createBuffer({
                    label: "sphere preview parameters",
                    size: 32,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
                });
                this.updateSphereParams();
                renderBindings.push({
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                });
            }
            this.renderBindGroupLayout = renderer.device.createBindGroupLayout({ entries: renderBindings });
            const renderEntries: GPUBindGroupEntry[] = [
                { binding: 0, resource: this.outputTextureView },
                { binding: 1, resource: this.sampler }
            ];
            if (this.sphereParamsBuffer) {
                renderEntries.push({ binding: 2, resource: { buffer: this.sphereParamsBuffer } });
            }
            this.renderBindGroup = renderer.device.createBindGroup({
                layout: this.renderBindGroupLayout,
                entries: renderEntries
            });

            this.renderPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "node pipeline layout",
                    bindGroupLayouts: [
                        this.renderBindGroupLayout
                    ]
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        label: "clustered deferred fullscreen vert shader",
                        code: shaders.fullscreenVertSrc
                    }),
                    buffers: []
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "node frag shader",
                        code: spherePreview ? shaders.sphereDisplayFragSrc : shaders.displayFragSrc
                    }),
                    targets: [
                        {
                            format: renderer.canvasFormat,
                        }
                    ]
                }
            });
            if (spherePreview) {
                renderer.canvas.addEventListener("mousedown", this.onSphereMouseDown, true);
                renderer.canvas.addEventListener("contextmenu", this.onSphereContextMenu, true);
                renderer.canvas.addEventListener("wheel", this.onSphereWheel, { capture: true, passive: false });
                window.addEventListener("mousemove", this.onSphereMouseMove);
                window.addEventListener("mouseup", this.onSphereMouseUp);
            }
        }

        override stop(): void {
            super.stop();
            if (this.spherePreview) {
                renderer.canvas.removeEventListener("mousedown", this.onSphereMouseDown, true);
                renderer.canvas.removeEventListener("contextmenu", this.onSphereContextMenu, true);
                renderer.canvas.removeEventListener("wheel", this.onSphereWheel, true);
                window.removeEventListener("mousemove", this.onSphereMouseMove);
                window.removeEventListener("mouseup", this.onSphereMouseUp);
                this.sphereParamsBuffer?.destroy();
                this.sphereParamsBuffer = undefined;
            }
        }

        private updateSphereParams(): void {
            if (!this.sphereParamsBuffer) return;
            renderer.device.queue.writeBuffer(
                this.sphereParamsBuffer,
                0,
                new Float32Array([
                    this.spherePosition.x, this.spherePosition.y, this.spherePosition.radius, 0,
                    this.spherePosition.yaw, this.spherePosition.pitch, 0, 0
                ])
            );
        }

        private onSphereWheel = (event: WheelEvent): void => {
            const rect = renderer.canvas.getBoundingClientRect();
            const x = (event.clientX - rect.left - rect.width * this.spherePosition.x) / rect.width;
            const y = (event.clientY - rect.top - rect.height * this.spherePosition.y) / rect.height;
            if (Math.hypot(x, y) > this.spherePosition.radius * 0.5) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            this.spherePosition.radius = Math.max(
                0.35,
                Math.min(2.5, this.spherePosition.radius * Math.exp(-event.deltaY * 0.001))
            );
            this.updateSphereParams();
        };

        private onSphereMouseDown = (event: MouseEvent): void => {
            if (event.button !== 0 && event.button !== 2) {
                event.stopImmediatePropagation();
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();

            const rect = renderer.canvas.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            const sphereX = (x - this.spherePosition.x) * 2 / this.spherePosition.radius;
            const sphereY = (this.spherePosition.y - y) * 2 / this.spherePosition.radius;
            if (sphereX * sphereX + sphereY * sphereY > 1) return;

            this.sphereDragStart = {
                button: event.button,
                pointerX: event.clientX,
                pointerY: event.clientY,
                centerX: this.spherePosition.x,
                centerY: this.spherePosition.y,
                yaw: this.spherePosition.yaw,
                pitch: this.spherePosition.pitch,
                radius: this.spherePosition.radius
            };
        };

        private onSphereMouseMove = (event: MouseEvent): void => {
            if (!this.sphereDragStart) return;
            const rect = renderer.canvas.getBoundingClientRect();
            const deltaX = event.clientX - this.sphereDragStart.pointerX;
            const deltaY = event.clientY - this.sphereDragStart.pointerY;
            if (this.sphereDragStart.button === 2) {
                this.spherePosition.yaw = this.sphereDragStart.yaw + deltaX / rect.width * 2 * Math.PI;
                this.spherePosition.pitch = Math.max(
                    -Math.PI / 2,
                    Math.min(Math.PI / 2, this.sphereDragStart.pitch + deltaY / rect.height * Math.PI)
                );
            } else {
                this.spherePosition.x = Math.max(0, Math.min(1,
                    this.sphereDragStart.centerX + deltaX / rect.width
                ));
                this.spherePosition.y = Math.max(0, Math.min(1,
                    this.sphereDragStart.centerY + deltaY / rect.height
                ));
            }
            this.updateSphereParams();
        };

        private onSphereMouseUp = (event: MouseEvent): void => {
            if (this.sphereDragStart?.button === event.button) {
                this.sphereDragStart = undefined;
            }
        };

        private onSphereContextMenu = (event: MouseEvent): void => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        override draw() {
            const canvasTextureView = renderer.context.getCurrentTexture().createView();
            const encoder = renderer.device.createCommandEncoder();

            // compute animated textures 
            const elapsedTime = (performance.now() - this.startTime) / 1000
            this.execution.updateTime(encoder, elapsedTime);
        
            // render pass
            const renderPass = encoder.beginRenderPass({
                label: "naive render pass",
                colorAttachments: [
                    {
                        view: canvasTextureView,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ],
            });
            renderPass.setPipeline(this.renderPipeline);
            renderPass.setBindGroup(0, this.renderBindGroup);
            renderPass.draw(3);

            renderPass.end();

            renderer.device.queue.submit([encoder.finish()]);
        }
    }
