
'use strict';

const wgslShaders = {
    vertex: `
struct VertexInput {
  [[location(0)]] position : vec3<f32>;
  [[location(1)]] uv : vec2<f32>;
};

struct VertexOutput {
  [[builtin(position)]] Position : vec4<f32>;
  [[location(0)]] fragUV : vec2<f32>;
};

[[stage(vertex)]]
fn main(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    output.Position = vec4<f32>(input.position, 1.0);
    output.fragUV = vec2<f32>(-0.5,-0.0) + input.uv;
    return output;
}
`,

    fragment: `
[[binding(0), group(0)]] var mySampler: sampler;
[[binding(1), group(0)]] var myTexture: texture_2d<f32>;

[[stage(fragment)]]
fn main([[location(0)]] fragUV : vec2<f32>) -> [[location(0)]] vec4<f32> {
  return textureSample(myTexture, mySampler, fragUV);
}
`,
};

class WebGPUTransform {
    constructor() {
        this.canvas_ = null;
        this.context_ = null;
        this.device_ = null;
        this.renderPipeline_ = null;
        this.sampler_ = null;
        this.videoTexture_ = null;
        this.vertexBuffer_ = null;
    }

    async init() {
        console.log('[WebGPUTransform] Initializing WebGPU.');

        if (!this.canvas_) {
            this.canvas_ = document.createElement('canvas');
            document.getElementById('outputVideo').append(this.canvas_);
            this.canvas_.width = 960;
            this.canvas_.height = 540;
        }

        const canvas = this.canvas_;
        const context = canvas.getContext('webgpu');
        if (context === null || context === undefined) {
            const errorMessage = 'Your browser does not support the WebGPU API.' +
                ' Please see the note at the bottom of the page.';
            document.getElementById('errorMsg').innerText = errorMessage;
            console.log(errorMessage);
            return;
        }
        this.context_ = context;
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        this.device_ = device;
        if (this.device_ === null || this.device_ === undefined) {
            console.log('[WebGPUTransform] requestDevice failed.')
            return;
        }
        const swapChainFormat = 'bgra8unorm';

        const rectVerts = new Float32Array([
            1.0, 1.0, 0.0, 1.0, 0.0,
            1.0, -1.0, 0.0, 1.0, 1.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            1.0, 1.0, 0.0, 1.0, 0.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            -1.0, 1.0, 0.0, 0.0, 0.0,
        ]);
        // Creates a GPU buffer.
        const vertexBuffer = device.createBuffer({
            size: rectVerts.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        // Copies rectVerts to vertexBuffer
        new Float32Array(vertexBuffer.getMappedRange()).set(rectVerts);
        vertexBuffer.unmap();
        this.vertexBuffer_ = vertexBuffer;

        context.configure({
            device,
            format: swapChainFormat
        })

        this.renderPipeline_ = device.createRenderPipeline({
            vertex: {
                module: device.createShaderModule({
                    code: wgslShaders.vertex,
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 20,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x3',
                            },
                            {
                                // uv
                                shaderLocation: 1,
                                offset: 12,
                                format: 'float32x2',
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: device.createShaderModule({
                    code: wgslShaders.fragment,
                }),
                entryPoint: 'main',
                targets: [
                    {
                        format: swapChainFormat,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        this.videoTexture_ = device.createTexture({
            size: {
                width: 480 * 2,
                height: 270 * 2,
                depthOrArrayLayers: 1,
            },
            arrayLayerCount: 1,
            mipLevelCount: 1,
            sampleCount: 1,
            dimension: '2d',
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.sampler_ = device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            addressModeW: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
        });
    }

    async renderOnScreen(videoFrame, gumFrame) {
        const device = this.device_;
        if (device === null || device === undefined) {
            console.log('[WebGPUTransform] device is undefined or null.')
            if (videoFrame) videoFrame.close();
            if (gumFrame) gumFrame.close();
            return false;
        }
        const videoTexture = this.videoTexture_;
        let videoBitmap, gumBitmap;
        if (videoFrame) {
            videoBitmap = await createImageBitmap(videoFrame, { resizeWidth: 480, resizeHeight: 270 });
            device.queue.copyExternalImageToTexture(
                { source: videoBitmap, origin: { x: 0, y: 0 } },
                { texture: videoTexture, origin: { x: 0, y: 270 } },
                {
                    // the width of the image being copied
                    width: videoBitmap.width,
                    height: videoBitmap.height,
                }
            );
            videoBitmap.close();
            videoFrame.close();
        }
        if (gumFrame) {
            gumBitmap = await createImageBitmap(gumFrame, { resizeWidth: 480, resizeHeight: 270 });
            device.queue.copyExternalImageToTexture(
                { source: gumBitmap, origin: { x: 0, y: 0 } },
                { texture: videoTexture, origin: { x: 480, y: 0 } },
                {
                    width: gumBitmap.width,
                    height: gumBitmap.height,
                }
            );
            gumBitmap.close();
            gumFrame.close();
        }
        const uniformBindGroup = device.createBindGroup({
            layout: this.renderPipeline_.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: this.sampler_,
                },
                {
                    binding: 1,
                    resource: videoTexture.createView(),
                },
            ],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.context_.getCurrentTexture().createView();

        const renderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    storeOp: 'store',
                },
            ],
        };
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.renderPipeline_);
        passEncoder.setVertexBuffer(0, this.vertexBuffer_);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
        return true;
    }


    async transform(videoStream, gumStream) {
        const videoSource = videoStream.getReader();
        const gumSource = gumStream.getReader();
        if (videoSource === undefined || videoSource === null) {
            console.log('[WebGPUTransform] videoSource is undefined or null.')
            return;
        }
        if (gumSource === undefined || gumSource === null) {
            console.log('[WebGPUTransform] gumSource is undefined or null.')
            return;
        }

        while (true) {
            let { value: videoFrame } = await videoSource.read();
            let { value: gumFrame } = await gumSource.read();
            const rendered = await this.renderOnScreen(videoFrame, gumFrame);
            if(!rendered){
                break;
            }
        }
    }

    async destroy() {
        if (this.device_) {
            // Not yet in canary
            // await this.device_.destroy();
            this.vertexBuffer_.destroy();
            this.device_ = null;
            if (this.canvas_.parentNode) {
                this.canvas_.parentNode.removeChild(this.canvas_);
            }
            console.log('[WebGPUTransform] Context destroyed.',);
        }
    }
}