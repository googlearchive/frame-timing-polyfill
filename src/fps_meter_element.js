// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.web_smoothness && window.web_smoothness.FPSMeter)
    return;
  if (!window.web_smoothness)
    window.web_smoothness = {};

  function FPSMeter(opt_window) {
    var iframe = document.createElement('iframe');
    iframe.classList.add('fps-meter');
    iframe.__proto__ = FPSMeter.prototype;
    iframe.constuctor = FPSMeter;
    iframe.decorate();
    requestAnimationFrame(function(){
      iframe.onAttach(opt_window);
    });
    return iframe;
  }

  FPSMeter.initWhenReady = function(opt_window) {
    var search = window.location.search.substring(1);
    if (search.indexOf('fps') == -1)
      return;
    document.addEventListener('DOMContentLoaded', function() {
      if (document.body.querySelector('fps-meter'))
        return;
      document.body.appendChild(new FPSMeter(opt_window));
    });
  }

  FPSMeter.prototype = {
    __proto__: HTMLDivElement.prototype,

    decorate: function() {
      this.classList.add('fps-meter');
    },

    onAttach: function(win) {
      var linkEl = this.contentDocument.createElement('link');
      linkEl.setAttribute('rel', 'stylesheet');
      linkEl.setAttribute('href', '../css/fps_meter_element.css');
      this.contentDocument.head.appendChild(linkEl);

      this.contentDocument.body.style.margin = '0px';
      this.contentDocument.body.appendChild(new FPSMeterElement(win));
    }
  }


  /**
   * @constructor
   */
  function FPSMeterElement(win) {
    var div = document.createElement('div');
    div.window_ = win;
    div.classList.add('fps-meter-element');
    div.__proto__ = FPSMeterElement.prototype;
    div.constuctor = FPSMeterElement;
    div.decorate();
    return div;
  }

  FPSMeterElement.prototype = {
    __proto__: HTMLDivElement.prototype,

    decorate: function() {
      this.classList.add('fps-meter-element');
      this.updateContents_ = this.updateContents_.bind(this);
      this.restartMonitor_ = this.restartMonitor_.bind(this);

      this.textBox_ = document.createElement('div');
      this.textBox_.className = 'text-box';
      this.textBox_.fpsLabel_ = document.createElement('span');
      this.textBox_.fpsLabel_.title='Frames per second';
      this.textBox_.fpsLabel_.style.color='blue';
      this.textBox_.appendChild(this.textBox_.fpsLabel_);
      this.textBox_.appendChild(document.createElement('br'));
      this.textBox_.cpsfLabel_ = document.createElement('span');
      this.textBox_.cpsfLabel_.title='Composites per source frame';
      this.textBox_.cpsfLabel_.style.color='red';
      this.textBox_.appendChild(this.textBox_.cpsfLabel_);
      this.textBox_.appendChild(document.createElement('br'));
      this.appendChild(this.textBox_);


      this.chartBox_ = document.createElement('div');
      this.chartBox_.className = 'chart-box';
      this.appendChild(this.chartBox_);

      this.chartData_ = [];
      this.restartMonitor_();
      web_smoothness.requestGotDataNotification(this.updateContents_, this.window_);
      this.setupGoogleChart_(this, this.chartOpts);
    },

    restartMonitor_: function() {
      var collector = web_smoothness.SmoothnessDataCollector.getInstance(this.window_);
      this.monitor_ = new web_smoothness.Monitor(collector, this.restartMonitor_);
    },

    updateChartOptions_: function() {
      var rect = this.chartBox_.getBoundingClientRect();
      this.chartOptions_.width = rect.width - 1;
      this.chartOptions_.height = rect.height;
    },

    setupGoogleChart_: function() {
      this.chartOptions_ = {
        title:null,
        legend: {position:"none"},
        backgroundColor:"white",
        vAxes: {0: {title: null, ticks: [0,60,120]},
                1: {title: null, ticks: [0,100]}},
        hAxis: {title: null, ticks: []}
      };
      if (web_smoothness.supportsSmoothnessEvents) {
        this.chartOptions_.series = {
          0: {targetAxisIndex: 0, color:'blue'},
          1: {targetAxisIndex: 1, color:'orange'}
        }
      } else {
        this.chartOptions_.series = {
          0: {targetAxisIndex: 0, color:'blue'}
        }
      }
      this.updateChartOptions_();

      var gscript = document.createElement('script');
      gscript.setAttribute("type", "application/javascript");
      gscript.setAttribute("id", "XX-GMPlusGoogle-XX");
      document.head.appendChild(gscript);

      // event listener setup
      gscript.addEventListener("load",
          function changeCB(params) {
              gscript.removeEventListener("load", changeCB);
              google.load("visualization", "1", {packages:["corechart"],
                  "callback": function drawChart() {
                    this.chart_ = new google.visualization.LineChart(
                        this.chartBox_);
                  }.bind(this)
              });
          }.bind(this)
      );
      gscript.src = "http://www.google.com/jsapi";
    },

    updateContents_: function() {
      web_smoothness.requestGotDataNotification(this.updateContents_,
                                                this.window_);
      var stats = this.monitor_.smoothnessInfo;
      if (!stats)
        return;

      var fps;
      if (stats.frameIntervalMs !== 0)
        fps = 1000 / stats.frameIntervalMs;
      else
        fps = 0;

      this.chartData_ = [];

      this.textBox_.fpsLabel_.innerText = "FPS: " + fps.toFixed(2);

      if (stats.drawsPerCommit) {
        this.textBox_.cpsfLabel_.innerText = "CPSF: " +
            stats.drawsPerCommit.toFixed(2);
        this.textBox_.cpsfLabel_.style.visibility = 'visible';
      } else {
        this.textBox_.cpsfLabel_.style.visibility = 'hidden';
      }

      // TODO(nduca): Compute this from the actual stored frame data, instead of
      // once a second.
      var now = window.performance.now();
      if (web_smoothness.supportsSmoothnessEvents) {
        if (this.chartData_.length == 0)
          this.chartData_.push(['Date', 'FPS', 'CPSF']);
        stats.frameIntervalsForRange.forEach(function(e) {
          this.chartData_.push([e.time, (e.intervalMs? 1000/e.intervalMs : 0),
                                stats.drawsPerCommit]);
        }.bind(this));
      } else {
        if (this.chartData_.length == 0)
          this.chartData_.push(['Date', 'FPS']);
        stats.frameIntervalsForRange.forEach(function(e) {
          this.chartData_.push([e.time, (e.intervalMs? 1000/e.intervalMs : 0)]);
        }.bind(this));
      }

      if (this.chartData_.length <= 1)
        return;

      this.chartData_.sort(function(a,b) { return a[0] - b[0]; });

      // Limit moving graph window to 15 seconds
      while ((this.chartData_[1] && this.chartData_[1][0] + 15000) < now)
        this.chartData_.splice(1,1);
      if(this.chartData_.length <= 1)
        return;

      if (this.chart_) {
        this.updateChartOptions_();
        var data = google.visualization.arrayToDataTable(this.chartData_);
        this.chart_.draw(data, this.chartOptions_);
      }
    }
  };

  window.web_smoothness.FPSMeter = FPSMeter;
})();
