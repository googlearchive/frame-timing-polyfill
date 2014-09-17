// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
'use strict';

document.addEventListener('run-tests', function(runner) {
  runner.test('rbdc-basic', function() {
    var monitor = new web_smoothness.RAFBasedDataCollector(window);
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
    var monitor = new web_smoothness.SmoothnessDataCollector();
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
        web_smoothness.SmoothnessDataCollector.destroyInstance();
        new web_smoothness.SmoothnessDataCollector(mw, md);
        cb(mw, md);
      } finally {
        web_smoothness.SmoothnessDataCollector.destroyInstance();
      }
    });
  }

  testWithMockWorld('fully-mocked', {smoothnessTiming: true}, function(mw, md) {
    var sdc = web_smoothness.SmoothnessDataCollector.getInstance();
    /*
     * TODO(mpb, nduca): Make some tests here, filling out mock_window as
     * needed.
     */
  });

  function toRafEvent(e) {
    return { startTime: e[0], duration: e[1] };
  }

  function toSmoothnessEvent(e) {
    return { startTime: e[0], duration: 0, sourceFrame: e[1] };
  }

  function toInterval(e) {
    return { time: e[0], intervalMs: e[1] };
  }

  function assertSIFR(a, b) {
    assertEquals(a.startTime, b.startTime);
    assertEquals(a.endTime, b.endTime);
    assertEquals(a.measuredTimeRange, b.measuredTimeRange);
    assertEquals(a.frameIntervalMs, b.frameIntervalMs);
    assertEquals(a.rafIntervalMs, b.rafIntervalMs);
    assertEquals(a.commitIntervalMs, b.commitIntervalMs);
    assertEquals(a.drawIntervalMs, b.drawIntervalMs);
    assertEquals(a.drawsPerCommit, b.drawsPerCommit);
    assertEquals(a.frameIntervalsForRange,
                 b.frameIntervalsForRange.map(toInterval));
  }

  runner.test('SmoothnessInfoForRangeDefaultValues', function() {
    var sifr = new web_smoothness.SmoothnessInfoForRange();
    assertSIFR(sifr, {frameIntervalsForRange: []});
  });

  testRunner(runner, 'SmoothnessInfoForRangeWithRafEvents',
    [
      [[[1,2],[3,4]],
       {startTime:1, endTime:7, measuredTimeRange:6, frameIntervalMs:3,
        rafIntervalMs:3, frameIntervalsForRange:[[3,2]]}],
      [[[1,0],[3,0],[4,0]],
       {startTime:1, endTime:4, measuredTimeRange:3, frameIntervalMs:1,
        rafIntervalMs:1, frameIntervalsForRange:[[3,2],[4,1]]}],
      [[[0,1],[0,2]],
       {startTime:0, endTime:2, measuredTimeRange:2, frameIntervalMs:1,
        rafIntervalMs:1, frameIntervalsForRange:[]}],
      [[[1,2]],
       {startTime:1, endTime:3, measuredTimeRange:2, frameIntervalMs:2,
        rafIntervalMs:2, frameIntervalsForRange:[]}],
      [[[1,2],[3,4],[5,6],[7,8]],
       {startTime:1, endTime:15, measuredTimeRange:14, frameIntervalMs:3.5,
        rafIntervalMs:3.5, frameIntervalsForRange:[[3,2],[5,2],[7,2]]}]
    ],
    function(testCase) {
      var rafEvents = testCase[0].map(toRafEvent);
      var targetSIFR = testCase[1];
      var sifr = new web_smoothness.SmoothnessInfoForRange(rafEvents);
      assertSIFR(sifr, targetSIFR);
    });

  testRunner(runner, 'SmoothnessInfoForRangeWithSmoothnessEvents',
    [
      [[], [[1,0]],
       {startTime:1, endTime:1, measuredTimeRange:0, frameIntervalMs:0,
        commitIntervalMs:0, drawIntervalMs:0,frameIntervalsForRange:[]}],
      [[], [[1,0],[2,0]],
       {startTime:1, endTime:2, measuredTimeRange:1, frameIntervalMs:0.5,
        commitIntervalMs:0, drawIntervalMs:0.5,
        frameIntervalsForRange:[[2,1]]}],
      [[[1,0],[2,1]], [],
       {startTime:1, endTime:2, measuredTimeRange:1, frameIntervalMs:0,
        commitIntervalMs:0.5, drawIntervalMs:0, drawsPerCommit:0,
        frameIntervalsForRange:[]}],
      [[[1,0],[2,1]], [[2,0],[3,0],[4,0]],
       {startTime:1, endTime:4, measuredTimeRange:3, frameIntervalMs:1,
        commitIntervalMs:1.5, drawIntervalMs:1, drawsPerCommit:1.5,
        frameIntervalsForRange:[[3,1],[4,1]]}],
      [[[1,0],[2,1],[3,2]], [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]],
       {startTime:1, endTime:10, measuredTimeRange:9, frameIntervalMs:1.5,
        commitIntervalMs:3, drawIntervalMs:1.5, drawsPerCommit:2,
        frameIntervalsForRange:[[3,1],[4,1],[8,4],[9,1],[10,1]]}]
    ],
    function(testCase) {
      var commitEvents = testCase[0].map(toSmoothnessEvent);
      var compositeEvents = testCase[1].map(toSmoothnessEvent);
      var targetSIFR = testCase[2];
      var sifr = new web_smoothness.SmoothnessInfoForRange(
          [], commitEvents, compositeEvents);
      assertSIFR(sifr, targetSIFR);
    });

  testRunner(runner, 'SmoothnessInfoForRange.addMoreInfoWithRaf',
    [
      [
        [],
        {frameIntervalsForRange: []},
        [[1,2],[3,4],[5,6],[7,8]],
        {startTime:1, endTime:15, measuredTimeRange:14, frameIntervalMs:3.5,
         rafIntervalMs:3.5, frameIntervalsForRange:[[3,2],[5,2],[7,2]]}
      ],
      [
        [[1,2],[3,4],[5,6],[7,8]],
        {startTime:1, endTime:15, measuredTimeRange:14, frameIntervalMs:3.5,
         rafIntervalMs:3.5, frameIntervalsForRange:[[3,2],[5,2],[7,2]]},
        [[9,10],[13,12]],
        {startTime:1, endTime:25, measuredTimeRange:24, frameIntervalMs:4,
         rafIntervalMs:4,
         frameIntervalsForRange:[[3,2],[5,2],[7,2],[9,2],[13,4]]}
      ]
    ],
    function(testCase) {
      var rafEvents1 = testCase[0].map(toRafEvent);
      var targetSIFR1 = testCase[1];
      var rafEvents2 = testCase[2].map(toRafEvent);
      var targetSIFR2 = testCase[3];

      var sifr = new web_smoothness.SmoothnessInfoForRange(rafEvents1);
      assertSIFR(sifr, targetSIFR1);

      var sifr2 = new web_smoothness.SmoothnessInfoForRange(rafEvents2);
      sifr.addMoreInfo(sifr2);
      assertSIFR(sifr, targetSIFR2);
    });

  testRunner(runner, 'SmoothnessInfoForRange.addMoreInfoWithSmoothness',
    [
      [
        [], [],
        {frameIntervalsForRange: []},
        [[1,0],[2,1],[3,2]], [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]],
        {startTime:1, endTime:10, measuredTimeRange:9, frameIntervalMs:1.5,
         commitIntervalMs:3, drawIntervalMs:1.5, drawsPerCommit:2,
         frameIntervalsForRange:[[3,1],[4,1],[8,4],[9,1],[10,1]]}
      ],
      [
        [[1,0],[2,1],[3,2]], [[2,0],[3,0],[4,0],[8,1],[9,1],[10,1]],
        {startTime:1, endTime:10, measuredTimeRange:9, frameIntervalMs:1.5,
         commitIntervalMs:3, drawIntervalMs:1.5, drawsPerCommit:2,
         frameIntervalsForRange:[[3,1],[4,1],[8,4],[9,1],[10,1]]},
        [[4,3]], [[12,3],[13,3],[14,3],[15,3]],
        {startTime:1, endTime:15, measuredTimeRange:14, frameIntervalMs:1.4,
         commitIntervalMs:3.5, drawIntervalMs:1.4, drawsPerCommit:2.5,
         frameIntervalsForRange:[[3,1],[4,1],[8,4],[9,1],[10,1],[12,2],[13,1],
                                 [14,1],[15,1]]}
      ]
    ],
    function(testCase) {
      var commitEvents1 = testCase[0].map(toSmoothnessEvent);
      var compositeEvents1 = testCase[1].map(toSmoothnessEvent);
      var targetSIFR1 = testCase[2];
      var commitEvents2 = testCase[3].map(toSmoothnessEvent);
      var compositeEvents2 = testCase[4].map(toSmoothnessEvent);
      var targetSIFR2 = testCase[5];

      var sifr = new web_smoothness.SmoothnessInfoForRange(
          [], commitEvents1, compositeEvents1);
      assertSIFR(sifr, targetSIFR1);

      var sifr2 = new web_smoothness.SmoothnessInfoForRange(
          [], commitEvents2, compositeEvents2);
      sifr.addMoreInfo(sifr2);
      assertSIFR(sifr, targetSIFR2);
    });


});
