rendeer.js
=========

Rendeer.js is a lightweight scene graph library, meant to be used in web games. It is meant to be flexible and easy to tweak.

Usage
-----

Include the library and dependencies
```html
<script src="js/gl-matrix-min.js"></script>
<script src="js/litegl.js"></script>
<script src="js/rendeer.js"></script>
```

Create the Scene
```js
var scene = new RD.Stage();
```


Create the renderer
```js
var renderer = new RD.Renderer(window.innerWidth, window.innerHeight);
```

Attach to DOM
```js
document.body.appendChild(renderer.canvas);
```

Get user input
```js
gl.captureMouse();
renderer.context.onmousedown = function(e) { ... }
renderer.context.onmousemove = function(e) { ... }

gl.captureKeys();
renderer.context.onkey = function(e) { ... }
```

Set camera
```js
var camera = new RD.Camera();
camera.perspective( 45, gl.canvas.width / gl.canvas.height, 1, 1000 );
camera.lookAt( [100,100,100],[0,0,0],[0,1,0] );
```

Add mesh
```js
var box = new RD.SceneNode();
box.color = [1,0,0,1];
box.mesh = "cube";
box.position = [0,0,0];
box.scale([10,10,10]);
stage.addChild(box);
```

Create main loop
```js
requestAnimationFrame(animate);
function animate() {
	requestAnimationFrame( animate );

	last = now;
	now = getTime();
	var dt = (now - last) * 0.001;
	renderer.render(stage, camera);
	stage.update(dt);
}
```

Documentation
-------------
The doc folder contains the documentation. For info about [http://glmatrix.com](glMatrix) check the documentation in its website.

Utils
-----

It includes several commands in the utils folder to generate doc, check errors and build minifyed version.


Feedback
--------

You can write any feedback to javi.agenjo@gmail.com
