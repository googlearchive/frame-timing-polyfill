// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.WebSmoothnessCollector)
    return;

  function WebSmoothnessCollector() {
    this.smoothnessDataCollector_ = SmoothnessDataCollector.getInstance();
  }

  WebSmoothnessCollector.prototype = {
    destroy: function() {
      this.smoothnessDataCollector_.destroy();
    },

    get enabled() {
      return this.smoothnessDataCollector_.enabled;
    },

    set enabled(enabled) {
      this.smoothnessDataCollector_.enabled = enabled;
    },

    /**
     * Does this environment support PerformanceSmoothnessTiming events?
     * If not, fall back to using requestAnimationFrame to approximate.
     */
    get supportsSmoothnessEvents() {
      return this.smoothnessDataCollector_.supportsSmoothnessEvents;
    },

    /**
     * Valid events are:
     *  got-data: A PerformanceSmoothnessEvent occurred.
     *  did-quiesce: No PerformanceSmoothnessEvents occurred in the last 500ms.
     */
    addEventListener: function(name, cb) {
      this.smoothnessDataCollector_.addEventListener(name, cb);
    },

    removeEventListener: function(name, cb) {
      this.smoothnessDataCollector_.removeEventListener(name, cb);
    },

    dispatchEvent: function(name) {
      this.smoothnessDataCollector_.dispatchEvent(name);
    },

    forceCollectEvents: function() {
      this.smoothnessDataCollector_.forceCollectEvents();
    },

    /**
     * Gets a SmoothnessInfoForRange for the currently recorded amount of time
     */
    get overallSmoothnessInfo() {
      return this.smoothnessDataCollector_.overallSmoothnessInfo;
    },

    /* Returns promise that, when resolved, will tell time of the draw of the
     * first frame, as measured by requestAnimationFrame or smoothness if
     * present.
     * E.g.:
     *   element.addEventListener('click', function() {
     *     montior.requestFirstFramePromise().then(function(elapsedTime) {
     *       console.log("TTFF: ", elapsedTime);
     *     })
     *   });
     *
     * Note: this promise really can fail. When the page goes invisible,
     * for instance.
     */
    requestFirstFramePromise: function() {
      return this.smoothnessDataCollector_.requestFirstFramePromise();
    },

  };


  /* Starts monitoring FPS for a specific range. Create one of these
   * when you start an animation, then call endAndGetData when you're done.
   * This lets you have per-animation monitoring of your application, useful
   * when one team member is working on a drawer system, while another team
   * member is working on the scrolling system.
   */
  function WebSmoothnessMonitor(opt_collector, opt_dataCallback) {
    this.monitor_ = new SmoothnessMonitor(opt_collector, opt_dataCallback);
  }

  WebSmoothnessMonitor.prototype = {

    /*
     * Set the data callback to be used when WebSmoothnessMonitor.end() is
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
     * Stop monitoring and if WebSmoothnessMonitor was created with an
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

  window.WebSmoothnessCollector = WebSmoothnessCollector;
  window.WebSmoothnessMonitor = WebSmoothnessMonitor;
})();
