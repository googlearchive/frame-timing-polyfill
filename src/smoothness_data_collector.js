// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.SmoothnessDataCollector)
    return;

  var QUIESENCE_TIMEOUT_MS = 500;


  /*
   * We need setImmediate in order to schedule a task right after the
   * commit yields. setTimeout(,0) has a 1-2ms gap, and mutation observers
   * actually push out rendering.
   */
  function createSetImmediateFunction(window) {
    var queue = [];
    window.addEventListener('message', function(m) {
      if (!m.data.drainPlease)
        return;

      var toProcess = queue.slice();
      queue = [];
      toProcess.forEach(function(tuple) {
        tuple[0].call(tuple[1], tuple[2], tuple[3]);
      });
    })

    function setImmediate(callback, binding, arg0, arg1) {
      queue.push([callback, binding, arg0, arg1]);
      if (queue.length == 1)
        window.postMessage({drainPlease: true}, '*');
    }
    return setImmediate;
  }


  /**
   * @constructor
   */
  function CompositorCommitPerformanceEntry() {
    this.name = 'requestAnimationFrame';
    this.entryType = 'smoothness';
    this.startTime = 0;
    this.duration = 0;
    this.sourceFrame = 0;
  }


  var nextRAFNumber = 0;


  /**
   * Simple rAF-based perf monitoring used when window.performance doesn't
   * support draw and commit timings.
   *
   * @constructor
   */
  function RAFBasedDataCollector(window, opt_bufferSize) {
    this.maxBufferSize_ = opt_bufferSize || 60;

    this.listeners_ = {'full' : [],
                       'called': []};

    this.enabled_ = false;
    this.events_ = [];
    this.raf_ = this.raf_.bind(this);
    this.window_ = window;
    this.setImmediate_ = createSetImmediateFunction(this.window_);
  }

  RAFBasedDataCollector.prototype = {
    get enabled() {
      return this.enabled_;
    },

    set enabled(enabled) {
      enabled = !!enabled;
      if (this.enabled_ == enabled)
        return;
      this.enabled_ = enabled;
      if (this.enabled_)
        this.window_.requestAnimationFrame(this.raf_);
    },

    raf_: function(frameBeginTime) {
      if (!this.enabled_)
        return;

      this.dispatchEvent('called');

      var sourceFrame = nextRAFNumber++;

      // The mostly-correct time to measure the commit in Chrome is right
      // after the main thread regains control after committing to the
      // compositor thread.
      //
      // TODO(nduca): See how it behaves on other browsers.
      //
      // Note: setTimeout doesn't work --- there's a ~1ms gap between the post
      // and the task firing.

      //setTimeout(this.measure_.bind(this, sourceFrame, frameBeginTime), 0);
      this.setImmediate_(this.measure_, this, sourceFrame, frameBeginTime);

      if (this.enabled_)
        this.window_.requestAnimationFrame(this.raf_);
    },

    measure_: function(sourceFrame, frameBeginTime) {
      var now = this.window_.performance.now();
      if (this.events_.length < this.maxBufferSize_) {
        var e = new CompositorCommitPerformanceEntry();
        e.sourceFrame = sourceFrame;
        e.startTime = frameBeginTime;
        e.duration = now - frameBeginTime;
        this.events_.push(e);
      }

      if (this.events_.length >= this.maxBufferSize_)
        this.dispatchEvent('full');
    },

    clearEvents: function() {
      this.events_ = [];
    },

    getEvents: function() {
      return this.events_;
    },

    addEventListener: function(name, cb) {
      if (!this.listeners_[name])
        throw new Error('Unsupported: ' + name);
      this.listeners_[name].push(cb);
    },

    removeEventListener: function(name, cb) {
      if (!this.listeners_[name])
        throw new Error('Unsupported: ' + name);
      var i = this.listeners_[name].indexOf(cb);
      if (i == -1)
        throw new Error('Not found');
      this.listeners_[name].splice(i, 1);
    },

    dispatchEvent: function(name) {
      this.listeners_[name].forEach(function(listener) {
        listener.call(this.window_);
      }, this);
    }
  };

  function SmoothnessInfoForRange(
      opt_rafEvents,
      opt_commitEvents, opt_compositeEvents) {
    /* Baic information: we report frame intervals instead of frame rate because
     * of how human minds perceive log scales.
     *
     * Think miles-per-gallon vs gallons-per-mile.
     *
     * When we see 14ms vs 16.66ms frame times, we think hmm
     * thats a little bit bigger. But when you see 60fps to 71fps, people
     * almost always get confused and think the change is bigger.
     */
    this.measuredTimeRange = undefined;

    // frameIntervalMs is commit rate without the smoothness api, but is
    // draw rate with it present.
    this.frameIntervalMs = undefined;

    // Details on main thread commit rate. Always available but noisy
    // without smoothness api.
    this.rafIntervalMs = undefined;

    // Details on actual true screen fps. Undefined when smoothness api is not
    // available.
    this.commitIntervalMs = undefined;
    this.drawIntervalMs = undefined;
    this.drawsPerCommit = undefined;

    // The raw event stream for applications which require more precision.
    this.rafEvents_ = opt_rafEvents || [];
    this.commitEvents_ = opt_commitEvents || [];
    this.compositeEvents_ = opt_compositeEvents || [];

    //Private
    this.calculate_();
  }
  SmoothnessInfoForRange.prototype = {
    addMoreInfo: function(info) {
      if (!(info instanceof SmoothnessInfoForRange))
        throw new Error('Must be info');
      Array.prototype.push.apply(this.rafEvents_, info.rafEvents_);
      Array.prototype.push.apply(this.commitEvents_, info.commitEvents_);
      Array.prototype.push.apply(this.compositeEvents_, info.compositeEvents_);
      this.calculate_();
    },

    getBounds_: function() {
      var min = Number.MAX_VALUE;
      var max = -Number.MAX_VALUE;
      for (var i = 0; i < this.rafEvents_.length; i++) {
        var e = this.rafEvents_[i];
        if (e.startTime < min) min = e.startTime;
        if (e.startTime + e.duration > max) max = e.startTime + e.duration;
      }
      for (var i = 0; i < this.commitEvents_.length; i++) {
        var e = this.commitEvents_[i];
        if (e.startTime < min) min = e.startTime;
        if (e.startTime + e.duration > max) max = e.startTime + e.duration;
      }
      for (var i = 0; i < this.compositeEvents_.length; i++) {
        var e = this.compositeEvents_[i];
        if (e.startTime < min) min = e.startTime;
        if (e.startTime + e.duration > max) max = e.startTime + e.duration;
      }
      return {
        min: min,
        max: max,
        range: max - min
      };
    },

    computeCurrentFramesFromCurrentData_: function() {
      function Frame(commitEvent) {
        this.commitEvent = commitEvent;
        this.drawEvents = [];
      }
      var framesBySourceFrame = {};
      this.commitEvents_.forEach(function(e) {
        if (framesBySourceFrame[e.sourceFrame]){
          return;
        }
        framesBySourceFrame[e.sourceFrame] = new Frame(e);
      });

      this.compositeEvents_.forEach(function(e) {
        // The compositor may be drawing a frame whose commit event we long-ago
        // threw away.
        if (!framesBySourceFrame[e.sourceFrame])
          return;
        framesBySourceFrame[e.sourceFrame].drawEvents.push(e);
      });

      var frames = [];
      for (var sourceFrame in framesBySourceFrame)
        frames.push(framesBySourceFrame[sourceFrame]);
      return frames;
    },

    calculate_:function() {
      var bounds = this.getBounds_();
      this.measuredTimeRange = bounds.range;
      // rafIntervalMs.
      if (this.rafEvents_.length) {
        this.rafIntervalMs = bounds.range / this.rafEvents_.length;
      } else {
        this.rafIntervalMs = 0;
      }

      if (!this.commitEvents_.length && !this.compositeEvents_.length) {
        this.frameIntervalMs = this.rafIntervalMs;
        return;
      }

      // commitIntervalMs.
      if (this.commitEvents_.length) {
        this.commitIntervalMs = bounds.range / this.commitEvents_.length;
      } else {
        this.commitIntervalMs = 0;
      }

      // drawIntervalMs.
      if (this.compositeEvents_.length) {
        this.drawIntervalMs = bounds.range / this.compositeEvents_.length;
      } else {
        this.drawIntervalMs = 0;
      }

      // drawsPerCommit.
      var numDraws = 0;
      var frames = this.computeCurrentFramesFromCurrentData_();
      if (frames.length) {
        frames.forEach(function(f) {
          numDraws += f.drawEvents.length;
        });
        this.drawsPerCommit = numDraws / frames.length;
      }

      this.frameIntervalMs = this.drawIntervalMs;
    }

  };

  var instance_ = undefined;

  /**
   * Infrastructure for monitoring smoothness related statistics, both
   * overall and for specific interactions.
   *
   * @constructor
   */
  function SmoothnessDataCollector (opt_window, opt_document) {
    this.window_ = opt_window || window;
    this.document_ = opt_document || document;

    if (instance_)
      throw new Error('Get SmoothnessDataCollector via SmoothnessDataCollector.getInstance()');

    this.pageVisibilityChanged_ = this.onPageVisibilityChanged_.bind(this);
    this.onQuiesenceTimeout_ = this.onQuiesenceTimeout_.bind(this);
    this.onRafBufferFull_ = this.onRafBufferFull_.bind(this);
    this.onSmoothnessBufferFull_ = this.onSmoothnessBufferFull_.bind(this);
    this.handleEventTrigger_ = this.handleEventTrigger_.bind(this);

    this.hasSmoothnessApi_ = this.window_.PerformanceSmoothnessTiming !== undefined;

    if (!this.hasSmoothnessApi_) {
      this.rafCommitMonitor_ = new RAFBasedDataCollector(this.window_);
      this.rafCommitMonitor_.addEventListener('full', this.onRafBufferFull_);
    } else {
      this.rafCommitMonitor_ = undefined;
    }

    // Listeners, etc.
    this.listeners_ = {'got-data' : [],
                       'did-quiesce' : [],
                       'cancel-promises' : [] };

    // Raw data.
    this.enabled_ = 0;
    this.historyLengthMs_ = 15000;
    this.currentQuiesenceTimeout_ = undefined;
    this.rafCommitEvents_ = [];
    this.compositorCommitEvents_ = [];
    this.compositorDrawEvents_ = [];
  }

  SmoothnessDataCollector.getInstance = function() {
    if (!instance_)
      instance_ = new SmoothnessDataCollector();
    return instance_;
  };

  SmoothnessDataCollector.destroyInstance = function() {
    if (instance_)
      instance_.destroy();
  };

  SmoothnessDataCollector.prototype = {
    destroy: function() {
      if (this.enabled_)
        this.enabled = false;
      instance_ = undefined;
    },

    get enabled() {
      return this.enabled_ > 0;
    },

    set enabled(enabled) {
      if (!enabled && this.enabled_ == 0)
        throw new Error('Error disabling monitor: not enabled');

      this.enabled_ += (enabled ? 1 : -1);
      if ((enabled && this.enabled_ != 1) || (!enabled && this.enabled_ != 0))
        return;

      if (enabled) {
        this.rafCommitEvents_ = [];
        this.compositorCommitEvents_ = [];
        this.compositorDrawEvents_ = [];

        if (!this.hasSmoothnessApi_) {
          this.rafCommitMonitor_.enabled = true;
        } else {
          this.window_.performance.addEventListener(
            'webkitsmoothnesstimingbufferfull', this.onSmoothnessBufferFull_);
          this.window_.performance.webkitSetSmoothnessTimingBufferSize(1);
        }
        this.document_.addEventListener('visibilitychange',
                                        this.pageVisibilityChanged_);
      } else {

        this.document_.removeEventListener('visibilitychange',
                                           this.pageVisibilityChanged_);

        if (!this.hasSmoothnessApi_) {
          this.rafCommitMonitor_.enabled = false;
        } else {
          this.window_.performance.removeEventListener(
            'webkitsmoothnesstimingbufferfull', this.onSmoothnessBufferFull_);
        }

        if (this.currentQuiesenceTimeout_) {
          this.window_.clearTimeout(this.currentQuiesenceTimeout_);
          this.currentQuiesenceTimeout_ = undefined;
        }
      }
    },

    get supportsSmoothnessEvents() {
      return this.hasSmoothnessApi_;
    },

    addEventListener: function(name, cb) {
      if (!this.listeners_[name])
        throw new Error('Unsupported: ' + name);
      this.listeners_[name].push(cb);
    },

    removeEventListener: function(name, cb) {
      if (!this.listeners_[name])
        throw new Error('Unsupported: ' + name);
      var i = this.listeners_[name].indexOf(cb);
      if (i == -1)
        throw new Error('Not found');
      this.listeners_[name].splice(i, 1);
    },

    dispatchEvent: function(name) {
      this.listeners_[name].forEach(function(listener) {
        listener.call(this.window_);
      }, this);
    },

    forceCollectEvents: function() {
      this.handleEventTrigger_();
    },

    onRafBufferFull_: function() {
      this.handleEventTrigger_();
    },

    onSmoothnessBufferFull_: function() {
      var didGetEvents = this.handleEventTrigger_();
      if (didGetEvents) {
        this.window_.performance.webkitSetSmoothnessTimingBufferSize(150);
      }
    },

    handleEventTrigger_: function() {
      var didGetEvents = this.collectEvents_();
      if (didGetEvents) {
        this.renewQuiescenceTimeout_();
        this.dispatchEvent('got-data');
      }
      return didGetEvents;
    },

    collectEvents_: function() {
      var didGetEvents = false;

      if (this.rafCommitMonitor_ && this.rafCommitMonitor_.enabled) {
        var events = this.rafCommitMonitor_.getEvents();
        this.rafCommitEvents_.push.apply(this.rafCommitEvents_, events);

        this.rafCommitMonitor_.clearEvents();

        didGetEvents = events.length > 0;
      }

      if(this.hasSmoothnessApi_) {
        var commitEvents = this.window_.performance.getEntriesByName(
            "commit", "smoothness");
        var drawEvents = this.window_.performance.getEntriesByName(
            "composite", "smoothness");

        this.compositorCommitEvents_.push.apply(
            this.compositorCommitEvents_, commitEvents);
        this.compositorDrawEvents_.push.apply(
            this.compositorDrawEvents_, drawEvents);

        this.window_.performance.webkitClearSmoothnessTimings();

        didGetEvents = didGetEvents || commitEvents.length > 0
            || drawEvents.length > 0;
      }

      this.purgeOldEvents_();
      return didGetEvents;
    },

    renewQuiescenceTimeout_: function() {
      // Quiesence based on timeouts isn't supported in raf mode. The issue is
      // we can't tell apart rAFs that do nothing from rAFs that do real work.
      if (!this.hasSmoothnessApi_)
        return;

      if (this.currentQuiesenceTimeout_) {
        this.window_.clearTimeout(this.currentQuiesenceTimeout_);
      }
      this.currentQuiesenceTimeout_ = this.window_.setTimeout(
          this.onQuiesenceTimeout_, QUIESENCE_TIMEOUT_MS);
    },

    onQuiesenceTimeout_: function() {
      this.currentQuiesenceTimeout_ = undefined;
      this.onQuiesence_();
    },

    onPageVisibilityChanged_: function() {
      if (document.visibilityState === 'hidden' ||
          document.visibilityState === 'unloaded') {
        this.dispatchEvent('cancel-promises');
        if (this.currentQuiesenceTimeout_) {
          this.window_.clearTimeout(this.currentQuiesenceTimeout_);
          this.currentQuiesenceTimeout_ = undefined;
        }
        this.onQuiesence_();
      }
    },

    onQuiesence_: function() {
      var didGetEvents = this.handleEventTrigger_();
      if (didGetEvents)
        return;
      console.log('did quiesce');
      this.dispatchEvent('did-quiesce');
      if (this.hasSmoothnessApi_) {
        // Wait for the next event
        this.window_.performance.webkitSetSmoothnessTimingBufferSize(1);
        this.window_.performance.webkitClearSmoothnessTimings();
      }
      /* TODO(nduca): It seems right that we clear the saved events, but
       * its not 100% clear to me that this is the case. */
      this.compositorCommitEvents_ = [];
      this.compositorDrawEvents_ = [];
    },

    purgeOldEvents_: function(opt_now) {
      var now = opt_now !== undefined ? opt_now : this.window_.performance.now();
      var retirementTimestamp = now - this.historyLengthMs_;

      function isStillCurrent(e) {
        return e.startTime + e.duration >= retirementTimestamp;
      }
      this.rafCommitEvents_ = this.rafCommitEvents_.filter(
          isStillCurrent);
      this.compositorCommitEvents_ = this.compositorCommitEvents_.filter(
          isStillCurrent);
      this.compositorDrawEvents_ = this.compositorDrawEvents_.filter(
          isStillCurrent);
    },

    /**
     * Gets a SmoothnessInfoForRange for the currently recorded amount of time
     */
    get overallSmoothnessInfo() {
      return new SmoothnessInfoForRange(this.rafCommitEvents_,
                                        this.compositorCommitEvents_,
                                        this.compositorDrawEvents_);
    },

    /* Returns promise that, when resolved, will tell time of the draw of the
     * first frame, as measured by requestAnimationFrame or smoothness if
     * present.
     * E.g.:
     *   element.addEventListener('click', function() {
     *     montior.requestFirstFramePromise().then(function(elapsedTime) {
     *       console.log("TTFS: ", elapsedTime);
     *     })
     *   });
     *
     * Note: this promise really can fail. When the page goes invisible,
     * for instance.
     */
    requestFirstFramePromise: function() {
      return this.hasSmoothnessApi_ ?
          this.requestFirstFramePromiseUsingSmoothness_() :
          this.requestFirstFramePromiseUsingRAF_();
    },

    requestFirstFramePromiseUsingRAF_: function () {
      return new Promise(function(resolve, reject) {
        var startTime = this.window_.performance.now();

        var cancelRafPromise = function() {
          this.removeEventListener('cancel-promises', cancelRafPromise);
          reject(new Error("Page visibility changed"));
        }.bind(this);
        this.addEventListener('cancel-promises', cancelRafPromise);

        this.window_.requestAnimationFrame(function() {
          this.window_.requestAnimationFrame(function() {
            this.removeEventListener('cancel-promises', cancelRafPromise);
            resolve(this.window_.performance.now() - startTime);
          }.bind(this));
        }.bind(this));
      }.bind(this));
    },

    requestFirstFramePromiseUsingSmoothness_: function () {
      return new Promise(function(resolve, reject) {
        var previousEnabledState = this.enabled;
        var targetCommitEvent;
        var startTime = this.window_.performance.now();
        var smoothnessCallback;
        this.enabled = true;

        var cancelSmoothnessPromise = function() {
          this.removeEventListener('cancel-promises', cancelSmoothnessPromise);
          this.removeEventListener('got-data', smoothnessCallback);
          this.enabled = previousEnabledState;
          reject(new Error("Page visibility changed"));
        }.bind(this);
        this.addEventListener('cancel-promises', cancelSmoothnessPromise);

        smoothnessCallback = function() {
          if (!targetCommitEvent) {
            for(var i = 0; i < this.compositorCommitEvents_.length; ++i) {
              if (this.compositorCommitEvents_[i].startTime > startTime) {
                targetCommitEvent = this.compositorCommitEvents_[i];
                break;
              }
            }
          }
          if (!targetCommitEvent) {
            return;
          }
          var targetFrame = targetCommitEvent.sourceFrame;
          for (var j = 0; j < this.compositorDrawEvents_.length; ++j) {
            if (this.compositorDrawEvents_[j].sourceFrame >= targetFrame) {
              this.removeEventListener('cancel-promises',
                                       cancelSmoothnessPromise);
              this.removeEventListener('got-data', smoothnessCallback);
              this.enabled = previousEnabledState;
              resolve(this.compositorDrawEvents_[j].startTime - startTime);
            }
          }
        }.bind(this);

        this.addEventListener('got-data', smoothnessCallback);
        this.renewQuiescenceTimeout_();
      }.bind(this));
    }
  };

  /* Starts monitoring FPS for a specific range. Create one of these
   * when you start an animation, then call endAndGetData when you're done.
   * This lets you have per-animation monitoring of your application, useful
   * when one team member is working on a drawer system, while another team
   * member is working on the scrolling system.
   */
  function SmoothnessMonitor(opt_monitor, opt_dataCallback) {
    /* register with monitor for events */
    this.monitor_ = monitor || SmoothnessDataCollector.getInstance();
    this.dataCallback_ = opt_dataCallback;

    this.dataHandler_ = this.dataHandler_.bind(this);
    this.quiesceHandler_ = this.quiesceHandler_.bind(this);
    this.endAndGetData = this.endAndGetData.bind(this);

    this.currentSmoothnessInfo_ = new SmoothnessInfoForRange();

    this.monitor_.addEventListener('got-data', this.dataHandler_);
    this.monitor_.addEventListener('did-quiesce', this.quiesceHandler_);
    this.monitor_.enabled = true;
  }
  SmoothnessMonitor.prototype = {
    set dataCallback(dataCallback) {
      this.dataCallback_ = dataCallback;
    },

    /*
     * Returns the current smoothness information up to this point
     */
    get smoothnessInfo() {
      if (this.monitor_) {
        this.monitor_.forceCollectEvents();
      }
      return this.currentSmoothnessInfo_;
    },

    dataHandler_: function() {
      var stats = this.monitor_.overallSmoothnessInfo;
      if (stats)
        this.currentSmoothnessInfo_.addMoreInfo(stats);
    },

    quiesceHandler_: function() {
      this.end();
    },

    end: function() {
      this.endAndGetData(this.dataCallback_);
    },

    abort: function() {
      this.endAndGetData(function() {});
    },

    endAndGetData: function(gotDataCallback) {
      if (!this.monitor_){
        return;
      }
      /* wait until we see the current frame number make it up onscreen,
       * handling case where maybe when we call end() another frame isn't
       * necessarily coming.
       *
       * Then unregister with monitor, and create SmoothnessInfoForRange for
       * the intervening time period, and pass to gotDataCallback.
       */
      if (gotDataCallback)
        gotDataCallback(this.smoothnessInfo);

      this.monitor_.enabled = false;
      this.monitor_.removeEventListener('got-data', this.dataHandler_);
      this.monitor_.removeEventListener('did-quiesce', this.quiesceHandler_);
      this.monitor_ = undefined;
    }
  };

  window.RAFBasedDataCollector = RAFBasedDataCollector;
  window.SmoothnessDataCollector = SmoothnessDataCollector;
  window.SmoothnessMonitor = SmoothnessMonitor;
  window.SmoothnessInfoForRange = SmoothnessInfoForRange;
})();
