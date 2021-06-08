
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
        this.device_ = null;
        this.renderPipeline_ = null;
        this.swapChain_ = null;
        /** GPU buffer */
        this.verticesBuffer_ = null;
        /**
         * @private {boolean} If false, pass VideoFrame directly to
         * WebGLRenderingContext.texImage2D and create VideoFrame directly from
         * this.canvas_. If either of these operations fail (it's not supported in
         * Chrome <90 and broken in Chrome 90: https://crbug.com/1184128), we set
         * this field to true; in that case we create an ImageBitmap from the
         * VideoFrame and pass the ImageBitmap to texImage2D on the input side and
         * create the VideoFrame using an ImageBitmap of the canvas on the output
         * side.
         */
        this.use_image_bitmap_ = true; // Earlier value is false
        /** @private {string} */
        this.debugPath_ = 'debug.pipeline.frameTransform_';
    }

    async init() {
        
        console.log('[WebGPUTransform] Initializing WebGPU.');
        
        this.canvas_ = document.createElement('canvas');
        this.canvas_.width = 5000;
        this.canvas_.height = 2500;

        const canvas = this.canvas_;
        const context = canvas.getContext('gpupresent');
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        this.device_ = device;
        if(this.device_ == null) return;

        // Copies rectVerts to this.verticesBuffer_
        const rectVerts = new Float32Array([
            1.0, 1.0, 0.0, 1.0, 0.0,
            1.0, -1.0, 0.0, 1.0, 1.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            1.0, 1.0, 0.0, 1.0, 0.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            -1.0, 1.0, 0.0, 0.0, 0.0,
        ]);
        this.verticesBuffer_ = device.createBuffer({
            size: rectVerts.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.verticesBuffer_.getMappedRange()).set(rectVerts);
        this.verticesBuffer_.unmap();

        const swapChainFormat = 'bgra8unorm';
        this.swapChain_ = context.configureSwapChain({
            device,
            format: swapChainFormat,
        });
        
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

    }

    async transform(frame, controller) {
        const device = this.device_;
        if(device == null) init();
        const canvas = this.canvas_;
        const sampler = device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            addressModeW: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
        });

        const videoFrame = await createImageBitmap(frame);
        const videoTexture = device.createTexture({size: {
            width: frame.displayWidth*2,
            height: frame.displayHeight*2,
            depthOrArrayLayers: 1,
        }, arrayLayerCount: 1,
        mipLevelCount: 1,
        sampleCount: 1,
        dimension: '2d',
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED,});
        
        device.queue.copyImageBitmapToTexture(
            { 
                imageBitmap: videoFrame, 
                origin: { x: 0, y: 0 } 
            },
            { 
                texture: videoTexture, 
                origin: { x: 0, y: 0 }  
            },
            {
                width: frame.displayWidth,
                height: frame.displayHeight,
            }
        );
        
        device.queue.copyImageBitmapToTexture(
            { 
                imageBitmap: videoFrame, 
                origin: { x: 0, y: 0 } 
            },
            { 
                texture: videoTexture ,
                origin: 
                { 
                    x: frame.displayWidth, 
                    y: frame.displayHeight 
                }  
            },
            {
                width: frame.displayWidth,
                height: frame.displayHeight,
            }
        );

        const uniformBindGroup = device.createBindGroup({
            layout: this.renderPipeline_.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sampler,
                },
                {
                    binding: 1,
                    resource: videoTexture.createView(),
                },
            ],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = this.swapChain_.getCurrentTexture().createView();

        const renderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    storeOp: 'store',
                },
            ],
        };
        const timestamp = frame.timestamp;
        frame.close();
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.renderPipeline_);
        passEncoder.setVertexBuffer(0, this.verticesBuffer_);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);

        document.body.appendChild(canvas);
        // controller.enqueue(new VideoFrame(canvas, {timestamp}));

        // const outputBitmap = await createImageBitmap(canvas);
        const outputBitmap = await createImageBitmap(videoFrame);
        const outputFrame = new VideoFrame(outputBitmap, {timestamp});
        outputBitmap.close();
        controller.enqueue(outputFrame);
    }

    /** @override */
    async destroy() {
        console.log('[WebGPUTransform] Forcing WebGPU context to be lost.');
        const destroy = await this.device_.destroy();
    }
}
