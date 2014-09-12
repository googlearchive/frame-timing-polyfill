// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.web_smoothness && window.web_smoothness.Monitor)
    return;
  if (!window.web_smoothness)
    window.web_smoothness = {};

  /*
   * Does this environment support PerformanceSmoothnessTiming events?
   * If not, fall back to using requestAnimationFrame to approximate.
   */
  function supportsSmoothnessEvents() {
    return web_smoothness.SmoothnessDataCollector.getInstance().
        supportsSmoothnessEvents;
  }

  /* Invoke 'cb' when a Smoothness event appears on the performance timeline,
   * or requestAnimationFrame monitoring fills the buffer.
   */
  function requestGotDataNotification(cb) {
    var cb_ = function() {
      web_smoothness.SmoothnessDataCollector.getInstance().
          removeEventListener('got-data', cb_);
      web_smoothness.SmoothnessDataCollector.getInstance().enabled = false;
      cb();
    };
    web_smoothness.SmoothnessDataCollector.getInstance().
        addEventListener('got-data', cb_);
    web_smoothness.SmoothnessDataCollector.getInstance().enabled = true;
  }

  /* Returns promise that, when resolved, will tell time of the draw of the
   * first frame, as measured by requestAnimationFrame or smoothness if
   * present.
   * E.g.:
   *   element.addEventListener('click', function() {
   *     web_smoothness.requestFirstFramePromise().then(function(elapsedTime) {
   *       console.log("TTFF: ", elapsedTime);
   *     })
   *   });
   *
   * Note: this promise really can fail. When the page goes invisible,
   * for instance.
   */
  function requestFirstFramePromise() {
    return web_smoothness.SmoothnessDataCollector.getInstance().
        requestFirstFramePromise();
  }

  /* Starts monitoring FPS for a specific range. Create one of these
   * when you start an animation, then call endAndGetData when you're done.
   * This lets you have per-animation monitoring of your application, useful
   * when one team member is working on a drawer system, while another team
   * member is working on the scrolling system.
   */
  function Monitor(opt_collector, opt_dataCallback) {
    this.monitor_ = new web_smoothness.SmoothnessMonitor(opt_collector,
                                                         opt_dataCallback);
  }

  Monitor.prototype = {

    /*
     * Set the data callback to be used when Monitor.end() is
     * called.
     */
    set dataCallback(dataCallback) {
      this.monitor_.dataCallback = dataCallback;
    },

    /*
     * Returns the current smoothness information up to this point
     */
    get smoothnessInfo() {
      return this.monitor_.smoothnessInfo;
    },

    /*
     * Stop monitoring and if Monitor was created with an
     * opt_dataCallback, or one was set via a call to set dataCallback,
     * invoke that callback with the collected data.
     */
    end: function() {
      this.monitor_.end();
    },

    /*
     * Stop monitoring. Do not call any callback with data.
     */
    abort: function() {
      this.monitor_.abort();
    },

    /*
     * Stop monitoring and invoke gotDataCallback with the collected data.
     */
    endAndGetData: function(gotDataCallback) {
      this.monitor_.endAndGetData(gotDataCallback);
    }
  };

  window.web_smoothness.Monitor = Monitor;
  window.web_smoothness.__defineGetter__('supportsSmoothnessEvents',
                                         supportsSmoothnessEvents);
  window.web_smoothness.requestGotDataNotification = requestGotDataNotification;
  window.web_smoothness.requestFirstFramePromise = requestFirstFramePromise;
})();
