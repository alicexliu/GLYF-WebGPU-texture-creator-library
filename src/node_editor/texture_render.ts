import * as renderer from './renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class TextureRenderer extends renderer.Renderer {

    outputTexture: GPUTexture;
    outputTextureView: GPUTextureView;

    textureComputePipeline: GPUComputePipeline;
    texComputeBindGroupLayout: GPUBindGroupLayout;
    texComputeBindGroup: GPUBindGroup;
    
    
    renderBindGroupLayout: GPUBindGroupLayout;
    renderBindGroup: GPUBindGroup;
    renderPipeline: GPURenderPipeline;

    sampler: GPUSampler;


    constructor(stage: Stage) {
        super(stage);

        this.outputTexture = renderer.device.createTexture({
            size: [512, 512],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
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

        // compute pipeline: writing to texture
        this.textureComputePipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                label: "texture compute pipeline layout",
                bindGroupLayouts: [
                    this.texComputeBindGroupLayout
                ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "texture compute shader",
                    code: shaders.noiseComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // render pipeline: display texture 
        this.renderBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
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
            ]
        });
        this.renderBindGroup = renderer.device.createBindGroup({
            layout: this.renderBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.outputTextureView
                },
                {
                    binding: 1,
                    resource: this.sampler
                }
                
            ]
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
                    code: shaders.displayFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override draw() {
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const encoder = renderer.device.createCommandEncoder();
        
        // compute pass 
        const computePass = encoder.beginComputePass({
            label: "texture compute pass"
        });
        computePass.setPipeline(this.textureComputePipeline);
        computePass.setBindGroup(0, this.texComputeBindGroup);
        computePass.dispatchWorkgroups(512 / 8, 512 / 8);
        
        computePass.end();
    
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
