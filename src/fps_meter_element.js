// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';


(function() {
  if (window.web_smoothness && window.web_smoothness.FPSMeter)
    return;
  if (!window.web_smoothness)
    window.web_smoothness = {};

  function FPSMeter() {
    var iframe = document.createElement('iframe');
    iframe.classList.add('fps-meter');
    iframe.__proto__ = FPSMeter.prototype;
    iframe.constuctor = FPSMeter;
    iframe.decorate();
    requestAnimationFrame(function(){
      iframe.onAttach();
    });
    return iframe;
  }

  FPSMeter.initWhenReady = function() {
    var search = window.location.search.substring(1);
    if (search.indexOf('fps') == -1)
      return;
    document.addEventListener('DOMContentLoaded', function() {
      if (document.body.querySelector('fps-meter'))
        return;
      document.body.appendChild(new FPSMeter());
    });
  }

  FPSMeter.prototype = {
    __proto__: HTMLDivElement.prototype,

    decorate: function() {
      this.classList.add('fps-meter');
    },

    onAttach: function() {
      var linkEl = this.contentDocument.createElement('link');
      linkEl.setAttribute('rel', 'stylesheet');
      linkEl.setAttribute('href', '../src/fps_meter_element.css');
      this.contentDocument.head.appendChild(linkEl);

      this.contentDocument.body.style.margin = '0px';
      this.contentDocument.body.appendChild(new FPSMeterElement(this.contentWindow));
    }
  }


  /**
   * @constructor
   */
  function FPSMeterElement(win) {
    var div = document.createElement('div');
    div.iframe_win = win;
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
      this.smoothnessDataCollector_ = web_smoothness.SmoothnessDataCollector.
          getInstance();
      this.smoothnessDataCollector_.enabled = true;
      this.smoothnessDataCollector_.addEventListener(
          'got-data', this.updateContents_.bind(this));

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

      this.setupGoogleChart_(this, this.chartOpts);
      this.updateContents_();
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
      if (this.smoothnessDataCollector_.supportsDrawEvents) {
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
      var stats = this.smoothnessDataCollector_.overallSmoothnessInfo;
      if (!stats)
        return;
      var fps;
      if (stats.frameIntervalMs !== 0)
        fps = 1000 / stats.frameIntervalMs;
      else
        fps = 0;

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
      if (this.smoothnessDataCollector_.supportsSmoothnessEvents) {
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

      // Google Charts API wasn't happy with trying to plot 900 points into
      // a 200 pixel window for some reason. Lets try and collapse it down
      // a little.
      while (this.chartData_.length > 200) {
        var newChartData = [["Date","FPS","CPSF"]];
        for (var i = 1; i < (this.chartData_.length-1); i+=2) {
          var elem = [];
          for (var j = 0; j < 3; ++j) {
            elem.push((this.chartData_[i][j] + this.chartData_[i+1][j])/2);
          }
          newChartData.push(elem);
        }
        if (this.chartData_.length % 1) {
          newChartData.push(this.chartData_[this.chartData_.length-1]);
        }
        this.chartData_ = newChartData;
      }

      // Limit moving graph window to 15 seconds
      while ((this.chartData_[1][0] + 15000) < now)
        this.chartData_.splice(1,1);


      if (this.chart_) {
        this.updateChartOptions_();
        var data = google.visualization.arrayToDataTable(this.chartData_);
        this.chart_.draw(data, this.chartOptions_);
      }
    }
  };

  window.web_smoothness.FPSMeter = FPSMeter;
})();
