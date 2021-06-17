async init(canvas) {
    // Set video element
    console.log('Inside worker');

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

    this.offscreen_ = canvas.transferControlToOffscreen();
    this.worker_ = new Worker("offscreencanvas.js");
}

onmessage = function(evt) {
    var canvas = evt.data.canvas;
    init(canvas);
    var device = evt.data.device;
    const frame = evt.data.frame;
    const frame2 = evt.data.frame2;
    const videoTexture = evt.data.videoTexture_;
    const renderPipeline = evt.data.renderPipeline_;
    const swapChain = evt.data.swapChain_;
    const verticesBuffer = evt.data.verticesBuffer_;

    const sampler = device.createSampler({
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        addressModeW: 'repeat',
        magFilter: 'linear',
        minFilter: 'linear',
    });
    console.log(frame.displayHeight, frame.displayWidth);
    console.log(frame2.displayHeight, frame2.displayWidth);
    const videoFrame = await createImageBitmap(frame);
    const videoFrame2 = await createImageBitmap(frame2);
    device.queue.copyImageBitmapToTexture(
        { imageBitmap: videoFrame, origin: { x: 0, y: 0 } },
        { texture: videoTexture },
        {
            width: frame.displayWidth,
            height: frame.displayHeight,
        }
    );
    device.queue.copyImageBitmapToTexture(
        { imageBitmap: videoFrame2, origin: { x: 0, y: 0 } },
        { texture: videoTexture, origin: { x: frame.displayWidth, y: frame.displayHeight } },
        {
            // the width of the image being copied
            // width: frame2.displayWidth,
            // height: frame2.displayHeight,
            width: frame.displayWidth,
            height: frame.displayHeight,
        }
    );
    // videoFrame.close();
    console.log('[WebGPUTransform] videoTexture type', videoTexture);
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
    const timestamp = frame.timestamp;
    frame.close();
    frame2.close();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(renderPipeline);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.endPass();
    device.queue.submit([commandEncoder.finish()]);


  };