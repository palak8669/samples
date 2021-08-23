/*
 *  Copyright (c) 2020 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

// const { chunk } = require("lodash");

/* global MediaStreamTrackProcessor, MediaStreamTrackGenerator */
if (typeof MediaStreamTrackProcessor === 'undefined' ||
    typeof MediaStreamTrackGenerator === 'undefined') {
  alert(
      'Your browser does not support the experimental MediaStreamTrack API ' +
      'for Insertable Streams of Media. See the note at the bottom of the ' +
      'page.');
}

// In Chrome 88, VideoFrame.close() was called VideoFrame.destroy()
if (VideoFrame.prototype.close === undefined) {
  VideoFrame.prototype.close = VideoFrame.prototype.destroy;
}

/* global CameraSource */ // defined in camera-source.js
/* global CanvasSource */ // defined in canvas-source.js
/* global CanvasTransform */ // defined in canvas-transform.js
/* global PeerConnectionSink */ // defined in peer-connection-sink.js
/* global PeerConnectionSource */ // defined in peer-connection-source.js
/* global Pipeline */ // defined in pipeline.js
/* global NullTransform, DropTransform, DelayTransform */ // defined in simple-transforms.js
/* global VideoSink */ // defined in video-sink.js
/* global VideoSource */ // defined in video-source.js
/* global WebGLTransform */ // defined in webgl-transform.js
/* global WebCodecTransform */ // defined in webcodec-transform.js

/**
 * Allows inspecting objects in the console. See console log messages for
 * attributes added to this debug object.
 * @type {!Object<string,*>}
 */
let debug = {};

/**
 * FrameTransformFn applies a transform to incoming frames from multiple feeds and 
 * creates a texture and draws it on the canvas. In this example, the first 4 arguments are the input frames and the
 * second argument is the stream controller.
 * The VideoFrame should be closed as soon as it is no longer needed to free
 * resources and maintain good performance.
 * @typedef {function(
 *     !VideoFrame,
 *     !TransformStreamDefaultController<!VideoFrame>): !Promise<undefined>}
 */
let FrameTransformFn; // eslint-disable-line no-unused-vars

/**
 * Creates a pair of MediaStreamTrackProcessor and MediaStreamTrackGenerator
 * that applies transform to sourceTrack. This function is the core part of the
 * sample, demonstrating how to use the new API.
 * @param {!MediaStreamTrack} sourceTrack the video track to be transformed. The
 *     track can be from any source, e.g. getUserMedia, RTCTrackEvent, or
 *     captureStream on HTMLMediaElement or HTMLCanvasElement.
 * @param {!FrameTransformFn} transform the transform to apply to sourceTrack;
 *     the transformed frames are available on the returned track. See the
 *     implementations of FrameTransform.transform later in this file for
 *     examples.
 * @param {!AbortSignal} signal can be used to stop processing
 * @return {!MediaStreamTrack} the result of sourceTrack transformed using
 *     transform.
 */
// eslint-disable-next-line no-unused-vars
function createProcessedMediaStreamTrack(sourceTrack1, sourceTrack2, sourceTrack3, transform, signal) {
  // Create the MediaStreamTrackProcessor.
  /** @type {?MediaStreamTrackProcessor<!VideoFrame>} */
  let processor1, processor2, processor3;
  try {
    processor1 = new MediaStreamTrackProcessor(sourceTrack1);
    if(sourceTrack2){
      processor2 = new MediaStreamTrackProcessor(sourceTrack2); 
    }
    if(sourceTrack3){
      processor3 = new MediaStreamTrackProcessor(sourceTrack3);
    }
  } catch (e) {
    alert(`MediaStreamTrackProcessor failed: ${e}`);
    throw e;
  }

  // Create the MediaStreamTrackGenerator.
  /** @type {?MediaStreamTrackGenerator<!VideoFrame>} */
  let generator;
  try {
    generator = new MediaStreamTrackGenerator('video');
  } catch (e) {
    alert(`MediaStreamTrackGenerator failed: ${e}`);
    throw e;
  }

  let source1, source2, source3;
  source1 = processor1.readable.getReader();
  if(processor2){
    source2 = processor2.readable.getReader();
  }
  if(processor3){
    source3 = processor3.readable.getReader();
  }
  const sink = generator.writable;

  // // Create a TransformStream using our FrameTransformFn. (Note that the
  // // "Stream" in TransformStream refers to the Streams API, specified by
  // // https://streams.spec.whatwg.org/, not the Media Capture and Streams API,
  // // specified by https://w3c.github.io/mediacapture-main/.)
  // /** @type {!TransformStream<!VideoFrame, !VideoFrame>} */
  // const transformer = new TransformStream({transform});

  // // Apply the transform to the processor's stream and send it to the
  // // generator's stream.
  // const promise = source.pipeThrough(transformer, {signal}).pipeTo(sink);

  // const promise1 = source1.read();
  // const promise2 = source2.read();
  // let screenImage;
  async function updateScreenImage() {
    // const screenReader = screenReadable.getReader();
    while (true) {
      var chunk2, chunk3;
      var readerDone2, readerDone3;
      
      let {value: chunk1, done: readerDone1} = await source1.read();
      if(source2){
        let {value: chunk, done: readerDone} = await source2.read();
        chunk2 = chunk;
        readerDone2 = readerDone;
      }
      if(source3){
        let {value: chunk, done: readerDone} = await source3.read();
        chunk3 = chunk;
        readerDone3= readerDone;
      }
      // console.log(chunk1, chunk2, chunk3);
      // if(source2){
      //   chunk2, readerDone2 = await source2.read();
      // }
      // if(source3){
      //   chunk3, readerDone3 = await source3.read();
      // }
      // if (chunk1.done && chunk2.done && chunk3.done) return;
      transform(chunk1, chunk2, chunk3);
      // const newImage = await frame.createImageBitmap();
      // frame.close();
      // screenImage.close();
      // screenImage = newImage;
    }
  }

  updateScreenImage();
  // let {value: chunk1, done: readerDone1} = await source1.read();
  // let {value: chunk2, done: readerDone2} = await source2.read();

  // transform(chunk1, chunk2);
  // promise.catch((e) => {
  //   if (signal.aborted) {
  //     console.log(
  //         '[createProcessedMediaStreamTrack] Shutting down streams after abort.');
  //   } else {
  //     console.error(
  //         '[createProcessedMediaStreamTrack] Error from stream transform:', e);
  //   }
  //   source.cancel(e);
  //   sink.abort(e);
  // });

  // debug['processor'] = processor;
  debug['generator'] = generator;
  // debug['transformStream'] = transformer;
  // console.log(
  //     '[createProcessedMediaStreamTrack] Created MediaStreamTrackProcessor, ' +
  //         'MediaStreamTrackGenerator, and TransformStream.',
  //     'debug.processor =', processor, 'debug.generator =', generator,
  //     'debug.transformStream =', transformer);

  return generator;
}

/**
 * The current video pipeline. Initialized by initPipeline().
 * @type {?Pipeline}
 */
let pipeline;

/**
 * Sets up handlers for interacting with the UI elements on the page.
 */
function initUI() {
  const sourceSelector = /** @type {!HTMLSelectElement} */ (
    document.getElementById('sourceSelector'));
  const sourceVisibleCheckbox = (/** @type {!HTMLInputElement} */ (
    document.getElementById('sourceVisible')));
  /**
   * Updates the pipeline based on the current settings of the sourceSelector
   * and sourceVisible UI elements. Unlike updatePipelineSource(), never
   * re-initializes the pipeline.
   */
  function updatePipelineSourceIfSet() {
    const sourceType =
        sourceSelector.options[sourceSelector.selectedIndex].value;
    if (!sourceType) return;
    console.log(`[UI] Selected source: ${sourceType}`);
    let source1, source2, source3;
    switch (sourceType) {
      case 'multiVideoFeed':
        source1 = new VideoSource();
        source2 = new VideoSource();
        source3 = new VideoSource();
        break;
      case 'canvasAndVideo':
        source1 = new VideoSource();
        source2 = new CanvasSource();
        // source3 = null;
        break;
      case 'cameraAndVideo':
        source1 = new CameraSource();
        source2 = new VideoSource();
        source3 = new VideoSource();
        break;
      default:
        alert(`unknown source ${sourceType}`);
        return;
    }
    source1.setVisibility(sourceVisibleCheckbox.checked);
    if(source2){
      source2.setVisibility(sourceVisibleCheckbox.checked);
    }
    if(source3){
      source3.setVisibility(sourceVisibleCheckbox.checked);
    }
    pipeline.updateSource(source1, source2, source3);
    
  }
  /**
   * Updates the pipeline based on the current settings of the sourceSelector
   * and sourceVisible UI elements. If the "stopped" option is selected,
   * reinitializes the pipeline instead.
   */
  function updatePipelineSource() {
    const sourceType =
        sourceSelector.options[sourceSelector.selectedIndex].value;
    if (!sourceType || !pipeline) {
      initPipeline();
    } else {
      updatePipelineSourceIfSet();
    }
  }
  sourceSelector.oninput = updatePipelineSource;
  sourceSelector.disabled = false;

  /**
   * Updates the source visibility, if the source is already started.
   */
  function updatePipelineSourceVisibility() {
    console.log(`[UI] Changed source visibility: ${
        sourceVisibleCheckbox.checked ? 'added' : 'removed'}`);
    if (pipeline) {
      source1, source2, source3 = pipeline.getSource();
      if (source1) {
        source1.setVisibility(sourceVisibleCheckbox.checked);
      }
      if (source2) {
        source2.setVisibility(sourceVisibleCheckbox.checked);
      }
      if (source3) {
        source3.setVisibility(sourceVisibleCheckbox.checked);
      }

    }
  }
  sourceVisibleCheckbox.oninput = updatePipelineSourceVisibility;
  sourceVisibleCheckbox.disabled = false;

  const transformSelector = /** @type {!HTMLSelectElement} */ (
    document.getElementById('transformSelector'));
  /**
   * Updates the pipeline based on the current settings of the transformSelector
   * UI element.
   */
  function updatePipelineTransform() {
    if (!pipeline) {
      return;
    }
    const transformType =
        transformSelector.options[transformSelector.selectedIndex].value;
    console.log(`[UI] Selected transform: ${transformType}`);
    switch (transformType) {
      case 'webgpu':
        pipeline.updateTransform(new WebGPUTransform());
        break;
      default:
        alert(`unknown transform ${transformType}`);
        break;
    }
  }
  transformSelector.oninput = updatePipelineTransform;
  transformSelector.disabled = false;

  const sinkSelector = (/** @type {!HTMLSelectElement} */ (
    document.getElementById('sinkSelector')));
  /**
   * Updates the pipeline based on the current settings of the sinkSelector UI
   * element.
   */
  function updatePipelineSink() {
    const sinkType = sinkSelector.options[sinkSelector.selectedIndex].value;
    console.log(`[UI] Selected sink: ${sinkType}`);
    switch (sinkType) {
      case 'video':
        pipeline.updateSink(new VideoSink());
        break;
      case 'pc':
        pipeline.updateSink(new PeerConnectionSink());
        break;
      default:
        alert(`unknown sink ${sinkType}`);
        break;
    }
  }
  sinkSelector.oninput = updatePipelineSink;
  sinkSelector.disabled = false;

  /**
   * Initializes/reinitializes the pipeline. Called on page load and after the
   * user chooses to stop the video source.
   */
  function initPipeline() {
    if (pipeline) pipeline.destroy();
    pipeline = new Pipeline();
    debug = {pipeline};
    updatePipelineSourceIfSet();
    updatePipelineTransform();
    updatePipelineSink();
    console.log(
        '[initPipeline] Created new Pipeline.', 'debug.pipeline =', pipeline);
  }
}

window.onload = initUI;
