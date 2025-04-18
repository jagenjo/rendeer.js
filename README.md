rendeer.js
=========

Rendeer.js is a lightweight 3D scene graph library, meant to be used in 3D web apps and games. It is meant to be flexible and easy to tweak.
It used the library [litegl.js](https://github.com/jagenjo/litegl.js) as a low level layer for WebGL.

It comes with some common useful classes like:

* Scene and SceneNode
* Camera
* Renderer
* Light with shadowmaps
* SkeletalAnimation
* Animation tracks
* Morph Targets
* Ray picking

And because it uses litegl you have all the basic ones (Mesh, Shader and Texture).

Demo
-----

Check the examples folder to see the examples, or visit [this website](http://tamats.com/projects/rendeer2/examples).

There is a boilerplate to create an application in the folder boilerlate/

Usage
-----

Here is a brief example of how to use it, but I totally encourage to read the more detailed [starter guide](https://github.com/jagenjo/rendeer.js/blob/master/guides/README.md) stored in the guides folder, or to check the boilerplate provided, and finally check the documentation for better understanding of the API.

First include the library and dependencies
```html
<script src="js/gl-matrix-min.js"></script>
<script src="js/litegl.js"></script>
<script src="js/rendeer.js"></script>
```

Create the scene
```js
var scene = new RD.Scene();
```


Create the renderer
```js
var context = GL.create({width: window.innerWidth, height:window.innerHeight});
var renderer = new RD.Renderer(context);
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

Create and register mesh
```js
var mesh = GL.Mesh.fromURL("data/mesh.obj");
renderer.meshes["mymesh"] = mesh;
```

Create a material and register it
```js
var mat = new RD.Material();
mat.textures.albedo = "mytexture.png";
mat.register("mymaterial");
```

Add a node to the scene
```js
var node = new RD.SceneNode();
node.color = [1,0,0,1];
node.mesh = "mymesh";
node.position = [0,0,0];
node.scale([10,10,10]);
node.material = mat.name;
scene.root.addChild(node);
```

Create main loop
```js
requestAnimationFrame(animate);
function animate() {
	requestAnimationFrame( animate );

	last = now;
	now = getTime();
	var dt = (now - last) * 0.001;
	renderer.render(scene, camera);
	scene.update(dt);
}
```

Documentation
-------------
The doc folder contains the documentation. For info about [glMatrix](http://glmatrix.com) check the documentation in its website.

Utils
-----

It includes several commands in the utils folder to generate doc, check errors and build minifyed version.


Feedback
--------

You can write any feedback to javi.agenjo@gmail.com
