
'use strict';

class WebGPUTransform {
    constructor() {
        this.worker_ = null;
        this.worker2_ = null;
        this.offscreen_ = null;
        this.screencanvas_ = null;
        this.offscreen2_ = null;
        this.screencanvas2_ = null;
    }

    async init() {
        console.log('[WebGPUTransform] Initializing WebGPU.');
        this.screencanvas_ = document.getElementById('oVC');
        const screenCanvas = this.screencanvas_;
        const offScreen = screenCanvas.transferControlToOffscreen();
        this.offscreen_ = offScreen;

        this.screencanvas2_ = document.getElementById('oVC2');
        const screenCanvas2 = this.screencanvas2_;
        const offScreen2 = screenCanvas2.transferControlToOffscreen();
        this.offscreen2_ = offScreen2;
        // const context = offScreen.getContext('gpupresent');
        // const swapChainFormat = 'bgra8unorm';
        // const swapChain = context.configureSwapChain({
        //     device,
        //     format: swapChainFormat,
        // });
        this.worker_ = new Worker("./js/worker.js");
        this.worker2_ = new Worker("./js/worker.js");
        this.worker_.postMessage(
            {
                operation: 'init',
                canvas: offScreen,
                //     document,
            }, [offScreen]);
        this.worker2_.postMessage(
            {
                operation: 'init',
                canvas: offScreen2,
                //     document,
            }, [offScreen2]);
        // });
    }

    async transform(frame, frame2, frame3) {
        // console.log('[WebGPUTransform] Transform function WebGPU.');
        this.worker_.postMessage(
            {
                operation: 'transform',
                frame: frame,
                number: 1,
            }, [frame]);
            this.worker2_.postMessage(
                {
                    operation: 'transform',
                    frame: frame2,
                    number: 2,
                }, [frame2]);
                frame3.close();
            // this.worker_.onmessage = function (e) {
        //     // this.offscreen_ = e.data;
        //     console.log(e.data);
        //     // const offScreen = this.offscreen_;
        //     // const outputBitmap = await createImageBitmap(offScreen);
        //     // const outputFrame = new VideoFrame(outputBitmap);
        //     // outputBitmap.close();
        //     // controller.enqueue(outputFrame);
        // }

    }

    /** @override */
    async destroy() {
        this.worker_.postMessage(
            {
                operation: 'destroy',
            });
    }
}
