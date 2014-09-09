// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

document.addEventListener('run-tests', function(runner) {
  runner.test('rbcm-basic', function() {
    var monitor = new RAFBasedDataCollector(window);
    monitor.enabled = true;

    function cleanup() {
      monitor.enabled = false;
    }

    var p = new Promise(function(resolve, reject) {
      // Spin a raf loop that keeps the main thread busy for >= 5ms/frame
      var keepGoing = true;
      function raf(frameBeginTime) {
        while(window.performance.now() < frameBeginTime + 5);
        if (keepGoing)
          requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Wait for full.
      monitor.addEventListener('full', function() {
        keepGoing = false;
        var events = monitor.getEvents();
        assertTrue(events.length > 1);
        monitor.clearEvents();
        assertEquals(0, monitor.getEvents().length);
        resolve();
      });
    });
    p.then(cleanup, cleanup);
    return p;
  });

  runner.test('fps-mon-basic', function() {
    var monitor = new SmoothnessDataCollector();
    monitor.enabled = true;

    function cleanup() {
      monitor.enabled = false;
    }

    var p = new Promise(function(resolve, reject) {
      // Spin a raf loop that keeps the main thread busy for >= 5ms/frame
      var keepGoing = true;
      function raf(frameBeginTime) {
        while(window.performance.now() < frameBeginTime + 5);
        if (keepGoing)
          requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Wait for fps-changed
      monitor.addEventListener('got-data', function() {
        keepGoing = false;
        var stats = monitor.overallSmoothnessInfo;
        assertTrue(stats.frameIntervalMs !== undefined);
        resolve();
      });
    });
    p.then(cleanup, cleanup);
    return p;
  });

  function testWithMockWorld(name, caps, cb) {
    runner.test(name, function() {
      try {
        var mw = new MockWindow(window, caps);
        var md = new MockDocument(document);
        SmoothnessDataCollector.destroyInstance();
        new SmoothnessDataCollector(mw, md);
        cb(mw, md);
      } finally {
        SmoothnessDataCollector.destroyInstance();
      }
    });
  }

  testWithMockWorld('fully-mocked', {smoothnessTiming: true}, function(mw, md) {
    var sdc = SmoothnessDataCollector.getInstance();
    /*
     * TODO(mpb, nduca): Make some tests here, filling out mock_window as
     * needed.
     */
  });
});
