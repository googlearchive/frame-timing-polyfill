// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.web_smoothness && window.web_smoothness.Monitor)
    return;
  if (!window.web_smoothness)
    window.web_smoothness = {};

   var HISTORY_LENGTH_MS = 15000;

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
  function requestGotDataNotification(cb, opt_win) {
    var cb_ = function() {
      web_smoothness.SmoothnessDataCollector.getInstance(opt_win).
          removeEventListener('got-data', cb_);
      web_smoothness.SmoothnessDataCollector.getInstance(opt_win).
          decEnabledCount();
      cb();
    };
    web_smoothness.SmoothnessDataCollector.getInstance(opt_win).
        addEventListener('got-data', cb_);
    web_smoothness.SmoothnessDataCollector.getInstance(opt_win).
        incEnabledCount();
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
  function requestFirstFramePromise(opt_win) {
    return web_smoothness.SmoothnessDataCollector.getInstance(opt_win).
        requestFirstFramePromise();
  }

  /* Starts monitoring FPS for a specific range. Create one of these
   * when you start an animation, then call end() when you're done.
   * This lets you have per-animation monitoring of your application, useful
   * when one team member is working on a drawer system, while another team
   * member is working on the scrolling system.
   */
  function Monitor(opt_collector, opt_dataCallback, opt_historyLengthMs) {
    /* register with monitor for events */
    this.collector_ = opt_collector ||
        web_smoothness.SmoothnessDataCollector.getInstance();
    this.dataCallback_ = opt_dataCallback;
    this.historyLengthMs_ = opt_historyLengthMs || HISTORY_LENGTH_MS;

    this.dataHandler_ = this.dataHandler_.bind(this);
    this.quiesceHandler_ = this.quiesceHandler_.bind(this);
    this.endAndGetData_ = this.endAndGetData_.bind(this);

    this.currentSmoothnessInfo_ = new web_smoothness.SmoothnessInfoForRange();
    this.collector_.addEventListener('got-data', this.dataHandler_);
    this.collector_.addEventListener('did-quiesce', this.quiesceHandler_);
    this.collector_.incEnabledCount();
  }

  Monitor.prototype = {

    /*
     * Set the data callback to be used when Monitor.end() is
     * called.
     */
    set dataCallback(dataCallback) {
      this.dataCallback_ = dataCallback;
    },

    /*
     * Returns the current smoothness information up to this point
     */
    get smoothnessInfo() {
      if (this.collector_) {
        this.collector_.forceCollectEvents();
      }
      return this.currentSmoothnessInfo_;
    },

    /*
     * Stop monitoring and if Monitor was created with an
     * opt_dataCallback, or one was set via a call to set dataCallback,
     * invoke that callback with the collected data.
     */
    end: function() {
      this.endAndGetData_(this.dataCallback_);
    },

    /*
     * Stop monitoring. Do not call any callback with data.
     */
    abort: function() {
      this.endAndGetData_(function() {});
    },

    /*
     * Stop monitoring and invoke gotDataCallback with the collected data.
     */
    endAndGetData_: function(gotDataCallback) {
      if (!this.collector_){
        return;
      }
      /* wait until we see the current frame number make it up onscreen,
       * handling case where maybe when we call end() another frame isn't
       * necessarily coming.
       *
       * Then unregister with collector, and create SmoothnessInfoForRange for
       * the intervening time period, and pass to gotDataCallback.
       */
      if (gotDataCallback)
        gotDataCallback(this.smoothnessInfo);

      this.collector_.decEnabledCount();
      this.collector_.removeEventListener('got-data', this.dataHandler_);
      this.collector_.removeEventListener('did-quiesce', this.quiesceHandler_);
      this.collector_ = undefined;
    },

    dataHandler_: function() {
      var stats = this.currentSmoothnessInfo_.endTime ?
           this.collector_.getOverallSmoothnessInfoSinceTime(
               this.currentSmoothnessInfo_.endTime) :
           this.collector_.overallSmoothnessInfo;
      if (stats)
        this.currentSmoothnessInfo_.addMoreInfo(stats, this.historyLengthMs_);
    },

    quiesceHandler_: function() {
      this.end();
    }
  };

  window.web_smoothness.Monitor = Monitor;
  window.web_smoothness.__defineGetter__('supportsSmoothnessEvents',
                                         supportsSmoothnessEvents);
  window.web_smoothness.requestGotDataNotification = requestGotDataNotification;
  window.web_smoothness.requestFirstFramePromise = requestFirstFramePromise;
})();
