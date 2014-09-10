// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

document.addEventListener('run-tests', function(runner) {
  runner.test('rbdc-basic', function() {
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

  runner.test('SmoothnessInfoForRangeDefaultValues', function() {
    var sifr = new SmoothnessInfoForRange();
    assertEquals(sifr.measuredTimeRange, -Infinity);
    assertEquals(sifr.frameIntervalMs, 0);
    assertEquals(sifr.rafIntervalMs, 0);
    assertEquals(sifr.commitIntervalMs, undefined);
    assertEquals(sifr.drawIntervalMs, undefined);
    assertEquals(sifr.drawsPerCommit, undefined);
  });

  testRunner(runner, 'SmoothnessInfoForRangeWithRafEvents',
    [
      [6, 3, [[1,2],[3,4]]],
      [3, 1, [[1,0],[3,0],[4,0]]],
      [2, 1, [[0,1],[0,2]]],
      [2, 2, [[1,2]]],
      [14, 3.5, [[1,2],[3,4],[5,6],[7,8]]]
    ],
    function(testCase) {
      var measuredTimeRange = testCase[0];
      var frameIntervalMs = testCase[1];
      var rafEvents = testCase[2].map(function(e) {
        return { startTime: e[0],
                 duration: e[1] };
      });
      var sifr = new SmoothnessInfoForRange(rafEvents);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange);
      assertEquals(sifr.frameIntervalMs, frameIntervalMs);
      assertEquals(sifr.rafIntervalMs, frameIntervalMs);
      assertEquals(sifr.commitIntervalMs, undefined);
      assertEquals(sifr.drawIntervalMs, undefined);
      assertEquals(sifr.drawsPerCommit, undefined);
    });

  testRunner(runner, 'SmoothnessInfoForRangeWithSmoothnessEvents',
    [
      [0, 0, 0, undefined, [], [[1,0]]],
      [1, 0.5, 0, undefined, [], [[1,0],[2,0]]],
      [1, 0, 0.5, 0, [[1,0],[2,1]], []],
      [3, 1, 1.5, 1.5, [[1,0],[2,1]], [[2,0],[3,0],[4,0]]],
      [9, 1.5, 3, 2, [[1,0],[2,1],[3,2]],
       [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]]
      ],
    ],
    function(testCase) {
      var measuredTimeRange = testCase[0];
      var drawIntervalMs = testCase[1];
      var commitIntervalMs = testCase[2];
      var drawsPerCommit = testCase[3];
      var toSmoothnessEvent = function(e) {
        return { startTime: e[0], duration: 0, sourceFrame: e[1] };
      };
      var commitEvents = testCase[4].map(toSmoothnessEvent);
      var compositeEvents = testCase[5].map(toSmoothnessEvent);
      var sifr = new SmoothnessInfoForRange([], commitEvents, compositeEvents);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange);
      assertEquals(sifr.frameIntervalMs, drawIntervalMs);
      assertEquals(sifr.rafIntervalMs, 0);
      assertEquals(sifr.commitIntervalMs, commitIntervalMs);
      assertEquals(sifr.drawIntervalMs, drawIntervalMs);
      assertEquals(sifr.drawsPerCommit, drawsPerCommit);
    });

  testRunner(runner, 'SmoothnessInfoForRange.addMoreInfoWithRaf',
    [
      [-Infinity, 0, [],
       14, 3.5, [[1,2],[3,4],[5,6],[7,8]]
      ],
      [14, 3.5, [[1,2],[3,4],[5,6],[7,8]],
       24, 4, [[9,10],[13,12]]
      ]
    ],
    function(testCase) {
      var measuredTimeRange1 = testCase[0];
      var frameIntervalMs1 = testCase[1];
      var toRafEvent = function(e) {
        return { startTime: e[0], duration: e[1]};
      };
      var rafEvents1 = testCase[2].map(toRafEvent);
      var measuredTimeRange2 = testCase[3];
      var frameIntervalMs2 = testCase[4];
      var rafEvents2 = testCase[5].map(toRafEvent);

      var sifr = new SmoothnessInfoForRange(rafEvents1);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange1);
      assertEquals(sifr.frameIntervalMs, frameIntervalMs1);
      assertEquals(sifr.rafIntervalMs, frameIntervalMs1);

      var sifr2 = new SmoothnessInfoForRange(rafEvents2);
      sifr.addMoreInfo(sifr2);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange2);
      assertEquals(sifr.frameIntervalMs, frameIntervalMs2);
      assertEquals(sifr.rafIntervalMs, frameIntervalMs2);
      assertEquals(sifr.commitIntervalMs, undefined);
      assertEquals(sifr.drawIntervalMs, undefined);
      assertEquals(sifr.drawsPerCommit, undefined);
    });

  testRunner(runner, 'SmoothnessInfoForRange.addMoreInfoWithSmoothness',
    [
      [-Infinity, 0, undefined, undefined, [], [],
       9, 1.5, 3, 2, [[1,0],[2,1],[3,2]], [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]]
      ],
      [9, 1.5, 3, 2, [[1,0],[2,1],[3,2]], [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]],
       14, 1.4, 3.5, 2.5, [[4,3]], [[12,3],[13,3],[14,3],[15,3]]
      ],
    ],
    function(testCase) {
      var measuredTimeRange1 = testCase[0];
      var drawIntervalMs1 = testCase[1];
      var commitIntervalMs1 = testCase[2];
      var drawsPerCommit1 = testCase[3];
      var toSmoothnessEvent = function(e) {
        return { startTime: e[0], duration: 0, sourceFrame: e[1] };
      };
      var commitEvents1 = testCase[4].map(toSmoothnessEvent);
      var compositeEvents1 = testCase[5].map(toSmoothnessEvent);
      var measuredTimeRange2 = testCase[6];
      var drawIntervalMs2 = testCase[7];
      var commitIntervalMs2 = testCase[8];
      var drawsPerCommit2 = testCase[9];
      var commitEvents2 = testCase[10].map(toSmoothnessEvent);
      var compositeEvents2 = testCase[11].map(toSmoothnessEvent);
      var sifr = new SmoothnessInfoForRange([], commitEvents1,
                                            compositeEvents1);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange1);
      assertEquals(sifr.frameIntervalMs, drawIntervalMs1);
      assertEquals(sifr.commitIntervalMs, commitIntervalMs1);
      assertEquals(sifr.drawIntervalMs,
                   drawIntervalMs1 ? drawIntervalMs1 : undefined);
      assertEquals(sifr.drawsPerCommit, drawsPerCommit1);

      var sifr2 = new SmoothnessInfoForRange([], commitEvents2,
                                             compositeEvents2);
      sifr.addMoreInfo(sifr2);
      assertEquals(sifr.measuredTimeRange, measuredTimeRange2);
      assertEquals(sifr.frameIntervalMs, drawIntervalMs2);
      assertEquals(sifr.rafIntervalMs, 0);
      assertEquals(sifr.commitIntervalMs, commitIntervalMs2);
      assertEquals(sifr.drawIntervalMs, drawIntervalMs2);
      assertEquals(sifr.drawsPerCommit, drawsPerCommit2);
    });


});
