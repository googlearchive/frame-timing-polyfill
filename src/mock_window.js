// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

(function() {
  function MockPerformanceFrameTiming() {
  };

  function MockPerformance(mockWindow) {
    this.mockWindow = mockWindow;
  }
  MockPerformance.prototype = {
    now: function() {
      return this.realWindow.performance.now();
    },

    getEntriesByName: function(type, name) {
    },

    webkitClearFrameTimings: function() {
      if (!this.mockWindow.windowCaps.frameTiming)
        throw new Error('Not supported');
    }
  };


  function MockWindow(realWindow, opt_caps) {
    var caps = opt_caps || {
    };
    this.windowCaps = caps;
    this.realWindow = window;
    this.performance = new MockPerformance(this);
    this.PerformanceFrameTiming = caps.frameTiming ? MockPerformanceFrameTiming : undefined;
  }

  MockWindow.prototype = {
    requestAnimationFrame: function() {
    },

    setTimeout: function() {

    },
    clearTimeout: function() {

    },

    postMessage: function(a, b) {
    },

    addEventListener: function(name, cb) {
    },

    removeEventListener: function(name, cb) {
    },
  };

  function MockDocument(realDocument) {
    this.realDocument = realDocument;
  }

  MockDocument.prototype = {
    get visibilityState() {
      return 'visible'; // or, hidden, unloaded or prerender
    },

    addEventListener: function(name, cb) {
    },

    removeEventListener: function(name, cb) {

    }
  };

  window.MockWindow = MockWindow;
  window.MockDocument = MockDocument;
})();
