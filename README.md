# Web Smoothness API

Hitting a smooth 60 frames per second on sites and apps relies on extensive manual testing with developer tools and device labs, and there’s no corresponding APIs available to conduct Real User Measurement (RUM) out in the wild on all your users’ devices.

Imagine you want to track scrolling performance of a listview, or you want to track the frames per second of an important CSS animation in your app, and you want to do so across a whole range of devices and browsers. Today you can’t do that in a reliable way, because every browser has a different architecture, and even if you (ab)use requestAnimationFrame to get a number, it’s only going to give you the bird’s eye view of when the main thread responded to vsync. It may well be that your bottleneck might be in the compositor thread, which means you’re simply looking in the wrong place. Using requestAnimationFrame for timing is also not going to yield CPU time spent, so you have no idea whether you comfortably hit 60fps, or if you were burning a load of CPU time (read: battery draining) and were close to missing frames.

The Smoothness API is the first step towards fixing our need to track frames per second more reliably, comprehensively, and in a cross-browser way. It provides data on main thread CPU usage, commits by the main thread to the compositor, and draws made by the compositor to the screen, all of which allow you to build up a comprehensive and custom picture of how well your sites and apps run, both in your device lab, and out on real user devices.

**Read more:**

* [Explainer Doc](https://github.com/GoogleChrome/websmoothness/wiki/Explainer)
* [Specification](https://rawgit.com/GoogleChrome/websmoothness/master/spec/index.html)
