importScripts('fake-dom.js');
'use strict';

let device;
// let screenCanvas;
let offScreen;
let verticesBuffer;
let swapChain;
let renderPipeline;
let videoTexture;
// let j = 0;

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

onmessage = async (event) => {
    const { operation } = event.data;
    if (operation == 'init') {
        // j++;
        console.log('[WebGPUTransform] Initializing WebGPU.');
        // screenCanvas = document.getElementById('canvas');
        // if (!screenCanvas) {
        //     screenCanvas = document.createElement('canvas');
        //     screenCanvas.width = 5000;
        //     screenCanvas.height = 2500;
        // }
        // offScreen = screenCanvas.transferControlToOffscreen();
        // offScreen = new OffscreenCanvas(1, 1);
        const { canvas } = event.data;
        offScreen = canvas;
        const context = offScreen.getContext('gpupresent');
        const adapter = await navigator.gpu.requestAdapter();
        device = await adapter.requestDevice();
        if (device == null) return;
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
        verticesBuffer = device.createBuffer({
            size: rectVerts.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        // Copies rectVerts to verticesBuffer
        new Float32Array(verticesBuffer.getMappedRange()).set(rectVerts);
        verticesBuffer.unmap();

        swapChain = context.configureSwapChain({
            device,
            format: swapChainFormat,
        });

        renderPipeline = device.createRenderPipeline({
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

        videoTexture = device.createTexture({
            size: {
                width: 960 * 2,
                height: 540 * 2,
                depthOrArrayLayers: 1,
            }, arrayLayerCount: 1,
            mipLevelCount: 1,
            sampleCount: 1,
            dimension: '2d',
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });

    }
    else if (operation == 'transform') {
        const { frame, number } = event.data;
        if (device == null) {
            console.log("Device is null");
            return;
        }
        const sampler = device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            addressModeW: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
        });
        const videoFrame = await createImageBitmap(frame, { resizeWidth: 1920, resizeHeight: 1080 });
        device.queue.copyExternalImageToTexture(
            { source: videoFrame },
            {
                texture: videoTexture,
                origin:
                {
                    x: 0,
                    y: 0,
                },
            },
            [1920, 1080]
        );

        frame.close();
        videoFrame.close();
        
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

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(renderPipeline);
        passEncoder.setVertexBuffer(0, verticesBuffer);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6, 1, 0, 0);
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
    }
    else if (operation == 'destroy') {
        console.log('[WebGPUTransform] Forcing WebGPU context to be lost. device value', device);
        const destroy = await device.destroy();
        console.log('[WebGPUTransform] WebGPU context is lost. device value', device);
    }
};