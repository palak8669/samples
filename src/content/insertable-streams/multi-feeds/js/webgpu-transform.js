
'use strict';

// import { makeBasicExample } from '../../components/basicExample';

// const shaderModule = device.createShaderModule({
//     code: `
//       [[block]] struct Matrix {
//         size : vec2<f32>;
//         numbers: array<f32>;
//       };

//       [[group(0), binding(0)]] var<storage> firstMatrix : [[access(read)]] Matrix;
//       [[group(0), binding(1)]] var<storage> secondMatrix : [[access(read)]] Matrix;
//       [[group(0), binding(2)]] var<storage> resultMatrix : [[access(write)]] Matrix;

//       [[stage(compute)]] fn main([[builtin(global_invocation_id)]] global_id : vec3<u32>) {
//         resultMatrix.size = vec2<f32>(firstMatrix.size.x, firstMatrix.size.y + secondMatrix.size.y);

//         let resultCell : vec2<u32> = vec2<u32>(global_id.x, global_id.y);

//         let index : u32 = resultCell.y + resultCell.x * u32(firstMatrix.size.y);
//         var result : f32 = firstMatrix.numbers[index];
//         resultMatrix.numbers[index] = result;
//         // for (var i : u32 = 0u; i < u32(firstMatrix.size.y); i = i + 1u) {
//         //   let a : u32 = i + resultCell.x * u32(firstMatrix.size.y);
//         //   let b : u32 = resultCell.y + i * u32(secondMatrix.size.y);
//         //   result = result + firstMatrix.numbers[a] * secondMatrix.numbers[b];
//         // }

//         // let index : u32 = resultCell.y + resultCell.x * u32(firstMatrix.size.y + secondMatrix.size.y);
//         // resultMatrix.numbers[index] = result;
//       }
//     `
//   });

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

    //   return VertexOutput(vec4<f32>(input.position, 1.0), input.uv);
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
        /** @private {?WebGLRenderingContext} */
        this.context_ = null;
        /** @private {?WebGLUniformLocation} location of inSampler */
        this.device_ = null;
        /** @private {?WebGLProgram} */
        this.blurPipeline_ = null;
        this.renderPipeline_ = null;
        this.fullscreenQuadPipeline_ = null;
        this.texture_ = null;
        this.swapChain_ = null;
        this.videoTexture_ = null;
        this.video_ = null;
        this.emptyCanvas_ = null;
        this.verticesBuffer_ = null;
        this.uniformBindGroup_ = null;
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
        // Set video element
        console.log('[WebGPUTransform] Initializing WebGPU.');


        this.canvas_ = document.getElementById('canvas');
        if (!this.canvas_) {
            this.canvas_ = document.createElement('canvas');
            this.canvas_.width = 5000;
            this.canvas_.height = 2500;
        }
        this.emptyCanvas_ = document.createElement('canvas');
        
        const canvas = this.canvas_;
        // document.getElementById('outputVideoContainer');
        const context = canvas.getContext('gpupresent');
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter.requestDevice();
        this.device_ = device;
        if (this.device_ === null) return;
        console.log('[WebGPUTransform] transform begins');
        const swapChainFormat = 'bgra8unorm';

        // prettier-ignore
        const rectVerts = new Float32Array([
            1.0, 1.0, 0.0, 1.0, 0.0,
            1.0, -1.0, 0.0, 1.0, 1.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            1.0, 1.0, 0.0, 1.0, 0.0,
            -1.0, -1.0, 0.0, 0.0, 1.0,
            -1.0, 1.0, 0.0, 0.0, 0.0,
        ]);
        //Creates a GPU buffer.
        const verticesBuffer = device.createBuffer({
            size: rectVerts.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        // Copies rectVerts to verticesBuffer
        new Float32Array(verticesBuffer.getMappedRange()).set(rectVerts);
        verticesBuffer.unmap();
        this.verticesBuffer_ = verticesBuffer;

        this.swapChain_ = context.configureSwapChain({
            device,
            format: swapChainFormat,
        });

        // const computePipeline = device.createComputePipeline({
        //     layout: device.createPipelineLayout({
        //       bindGroupLayouts: [bindGroupLayout]
        //     }),
        //     compute: {
        //       module: shaderModule,
        //       entryPoint: "main"
        //     }
        //   });

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
            }, arrayLayerCount: 1,
            mipLevelCount: 1,
            sampleCount: 1,
            dimension: '2d',
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED,
        });

    }

    async transform(frame, frame2, frame3) {
        const device = this.device_;
        if (device == null) init();
        const canvas = this.canvas_;
        const sampler = device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            addressModeW: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
        });
        const videoTexture = this.videoTexture_;
        var videoFrame, videoFrame2, videoFrame3;
        console.log(frame.displayHeight, frame.displayWidth);
        // if(frame2){
            videoFrame = await createImageBitmap(frame, {resizeWidth:480, resizeHeight: 270});
        // }
        // else{
        //     videoFrame = await createImageBitmap(frame);
        // }

        device.queue.copyImageBitmapToTexture(
            { imageBitmap: videoFrame, origin: { x: 0, y: 0 } },
            { texture: videoTexture, origin: { x: videoFrame.width, y: 0 }  },
            {
                // the width of the image being copied
                width: videoFrame.width,
                height: videoFrame.height,
            }
        );
        videoFrame.close();
        frame.close();
        
        if(frame2){
            console.log(frame2.displayHeight, frame2.displayWidth);
            videoFrame2 = await createImageBitmap(frame2, {resizeWidth:480, resizeHeight: 270});
            device.queue.copyImageBitmapToTexture(
                { imageBitmap: videoFrame2, origin: { x: 0, y: 0 } },
                { texture: videoTexture, origin: { x: 480, y: 270 } },
                {
                    width: 480,
                    height: 270,
                }
            );
            videoFrame2.close();
            frame2.close();
        }
        if(frame3){
            console.log(frame3.displayHeight, frame3.displayWidth);
            videoFrame3 = await createImageBitmap(frame3, {resizeWidth:480, resizeHeight: 270});
            device.queue.copyImageBitmapToTexture(
                { imageBitmap: videoFrame3, origin: { x: 0, y: 0 } },
                { texture: videoTexture, origin: { x: 0, y: 0 } },
                {
                    width: 480,
                    height: 270,
                }
            );
            videoFrame3.close();
            frame3.close();
        }

        console.log('[WebGPUTransform] videoTexture type', videoTexture);
        const renderPipeline = this.renderPipeline_;
        const uniformBindGroup = device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
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
        const swapChain = this.swapChain_;
        const textureView = swapChain.getCurrentTexture().createView();

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
        const verticesBuffer = this.verticesBuffer_;
        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(renderPipeline);
        passEncoder.setVertexBuffer(0, verticesBuffer);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);

        // document.getElementById('oVC').value = canvas;
        // document.getElementById('outputVideoContainer').value = canvas;
        var parentNode = document.getElementById('outputVideoContainer');
        if(parentNode.hasChildNodes()){
            let children = parentNode.childNodes;
            for (let i = 0; i < children.length; i++) {
                parentNode.removeChild(children[i]);
                // do something with each child as children[i]
                // NOTE: List is live! Adding or removing children will change the list's `length`
            }
        }
        document.getElementById('outputVideoContainer').appendChild(canvas);
        
      
        // document.body.appendChild(canvas);
        // controller.enqueue(new VideoFrame(canvas, {timestamp}));

        // const outputBitmap = await createImageBitmap(canvas);
        // const outputBitmap = await createImageBitmap(videoFrame);
        // console.log('outputBitmap', outputBitmap);
        // const outputFrame = new VideoFrame(outputBitmap, { timestamp });
        // outputBitmap.close();
        // // controller.enqueue(outputFrame);
        // console.log('[WebGPUTransform] canvas type', canvas);

    }

    /** @override */
    async destroy() {
        if (this.device_) {

        document.getElementById('outputVideoContainer').removeChild(this.canvas_);
        console.log('[WebGPUTransform] Forcing WebGPU context to be lost. this.device_ value', this.device_);
        await this.device_.destroy();
        console.log('[WebGPUTransform] WebGPU context is lost. this.device_ value', this.device_);

        }
    }
}
