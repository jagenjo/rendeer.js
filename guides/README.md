# Rendeer

Rendeer is a javascript library to render 3D Scenes in WebGL that provides a scene graph and a simple renderer.

It doesn't force any rendering pipeline to the developer but this means that the user is in charge of creating the shaders and the behaviour for every element. This allow to have more freedom but also implies that the user knows about coding shaders in GLSL.

Use Rendeer as a helper environment for most of the common scene graph actions, like positioning on the world, creating hierarchies, crawling the scene graph and rendering to the screen. And you don't need to use all the features, for instance, you can use just the scene graph and create your own renderer.

It relies totally on [LiteGL.js](https://github.com/jagenjo/litegl.js) for the low-level actions (compile shaders, upload textures, create meshes and get the user input), so it is mandatory to know the basic components of LiteGL in order to use Rendeer.js (although it is very simple).

## How to Start

There is a [boilerplate folder](https://github.com/jagenjo/rendeer.js/tree/master/boilerplate) in the repository to help creating a basic full-website WebGL application and some basic examples in the [examples folder](https://github.com/jagenjo/rendeer.js/tree/master/examples).
It comes with some shaders and an example of how to use LiteGL and Rendeer together to get some nice effects.

But remember that there is a documentation folder (you can check it [online here](http://tamats.com/projects/rendeer/doc) )

### Libraries

You must include gl-matrix.js, litegl.js and rendeer.js, although there is a rendeer.full.min.js that includes all three libraries, I recommend to use the separated ones so you can debug easily. I havent test if there is any performance gain in using the minified version.

All the dependencies are included in the external folder.

About the libraries it uses, some remarks:

* **gl-matrix** has an specific way of working that some people could feel is not very user-friendly but it was made to have the best performance possible in Javascript, just check some examples to understand it better.
* **litegl.js** is a very low-level API, it wraps some actions common to WebGL, but if you want to do anything manually feel free to call the WebGL API directly, the only problem will be that Rendeer expects some basic classes to handle the render (like ```GL.Shader```, ```GL.Texture``` and ```GL.Mesh```) but if you bypasss the rendering stage there is no problem.

Although not mandatory I recommend to also include Canvas2DToWebGL.js, a library that helps using the Canvas2D API inside WebGL, something useful if you want to skip using the DOM.

I recommend checking the [vectors and matrices guide](vectors_and_matrices.md) to learn how to  use gl-matrix propertly.

Also check [litegl guides](https://github.com/jagenjo/litegl.js/tree/master/guides) to learn how to access controls, meshes, textures, etc.

### The WebGL context

Rendeer requires that you pass an existing WebGL Context when creating the renderer (```RD.Renderer```), to create the context you must use LiteGL, you cannot pass another WebGL Context created by another library as Rendeer relies on functions of LiteGL.

To create the GL context follow [the LiteGL.js guide](https://github.com/jagenjo/litegl.js/blob/master/guides/context.md), but here is an example:

```javascript
var context = GL.create({width:800,height:600});
document.body.appendChild( context.canvas );
```

You can also pass an existing HTMLCanvas element instead of the size, or any parameter from WebGL like alpha or stencil flags.

Remember that the context created with LiteGL is also assigned as a global var (```window.gl```) so you can call the WebGL API from anywhere:

```javascript
gl.enable( gl.DEPTH_TEST );
```

### The Scene 

There are two classes to keep in mind when using the scene graph, the ```RD.Scene``` class that contains all the scene info and the nodes, and the ```RD.SceneNode``` that represents every node in the scene.

We must create a ```RD.Scene``` to contain our scene:

```javascript
var scene = new RD.Scene();
```

And we can create nodes using the RD.SceneNode:

```javascript
var node = new RD.SceneNode();
```

The root node of the scene is not the scene itself but another node inside the scene called root. So to add a node to the root of the scene we must do this:

```javascript
scene.root.addChild( node );
```

### The SceneNode properties

We use SceneNodes to represent objects in the scene, so the three main properties of a ```RD.SceneNode``` to keep in mind are ```node.mesh```, ```node.shader``` and ```node.textures``` (although depending on the renderer it also could be ```node.material```.
All three store strings, although textures is an object where you can store different textures for different channels (color, specular, etc).

```javascript
node.mesh = "mymesh.obj";
node.texture = "mytexture.png"; //is the same as node.textures.color = "..."
```

The strings are the name of the assets that will be fetched when rendering. These assets must be stored in the ```RD.Renderer```'s containers (```renderer.meshes```, ```renderer.shaders``` and ```renderer.textures```), which are the same containers as in the gl context (```gl.meshes[...]```,...), you can use them indistinguishable.

But user is in charge of loading the assets manually, by default Rendeer does not perform asset loading automatically unless you set the ```renderer.autoload_assets = true;```, so add your resources to those containers before using them.

So here is an example of how to create a mesh and assign it to a node:

```js
	var node = new RD.SceneNode();
	node.mesh = "foo";
	scene.root.addChild(node);
	
	//now we must have that mesh
	var mesh = new GL.Mesh({vertices:[0,1,0, 1,0,0, 1,1,0]});
	gl.meshes["foo"] = mesh;
```

### The SceneNode transformations

To perform transformations in the SceneNode there are three main properties in every SceneNode, which are position, rotation and scaling. 

```javascript
node.position = [10,10,10]; //relative to parent node
node.rotation = quat.create(); //rotations are in quaternion format
node.scaling = 10; //it also accepts a vec3 in which case the scaling will be non-uniform
```

To perform a translation
```javascript
node.translate(10,10,10); //it accepts a vector
```

To rotate
```javascript
axis = RD.UP; // RD.UP is a constant with the value [0,1,0], there are many other constants
node.rotate( angle_in_deg, axis ); //it accepts a vector
```

If you want to move a node according to where it is pointint at, you can use moveLocal:

```js
node.moveLocal( RD.FRONT ); //moves in Z according to its orientation
```

You can  access the local matrix in ```_local_matrix``` or the global matrix in ```_global_matrix``` but be careful as they could be not updated (as they use lazy update to save resources). If you are not sure that the matrix is updated, called the appropiate functions:

```js
//to update the local matrix
node.updateLocalMatrix();

//to recompute the global matrix
node.updateGloalMatrix();
```

### The SceneNode hierarchy

Every node could contain children nodes that will inherit its transformation, useful to nest items.

Children are stored in an array called ```children``` similar to how DOM nodes work.

To access a children of a node:

```js
var num_child = node.children.length;
var first_child = node.children[0];
node.addChild( another_node );
node.removeChild( another_node );
```

Or if you want to find a node by its given name:
```js
var child_node = node.findNode( id ); //search by node.id
var child_node = node.findNodeByName( id ); //search by node.name
```

### The Camera

Cameras help define the view point and the view settings. They are not part of the scene and cannot be attached directly to the Scene (although they can be stored in a node if you want).

```javascript
var camera = new RD.Camera();
camera.perspective(fov,aspect,near,far); //to render in perspective mode
camera.lookAt([100,100,100],[0,0,0],[0,1,0]); //to set eye,center and up
```

When rendering the scene you must supply which camera you want to use.

You have all the matrices in  ```_view_matrix```,```_projection_matrix``` and ```_viewprojection_matrix``` plus a ```_model_matrix``` with the inverse of the view. Matrices use a lazy update, so remember to change the ```_must_update_matrix``` when changing the matrices manually.

Cameras have all the common properties of cameras, keep in mind that instead of eye and center it uses position and target.
Check the API for some useful functions like move, orbit or rotate

Cameras do not perform frustum culling but they provide methods so you can do it.

To know more about ```RD.Camera```, check the [camera guide](camera.md).

### The Renderer 

To render the scene we need a ```RD.Renderer```, to create one we must supply an existing WebGLContext created with LiteGL.

```javascript
var renderer = new RD.Renderer( context );
```

The ```RD.Renderer``` is in charge of allocating resources in the GPU and of performing the rendering of one frame.

So if we want to be able to see the scene we need to render one frame by calling the render function:

```javascript
renderer.render( scene, camera );
```

### The resources

Remember that SceneNodes don't contain the assets, they use strings to reference the assets, which must be stored inside the Renderer's containers, this way we can use the same scene in several Canvas in the DOM.

By default resources like textures and meshes will be loaded automatically (you can disable it with ```renderer.autoload_assets = false``` ), but if you want to preload resources or add resources generated by yourself, fill the containers manually.

To add a texture you must use the LiteGL functions manually and store the result in renderer.textures or call the renderer method loadTexture;

```javascript
renderer.loadTexture( "data/sky.png", { format: GL.RGB, name: "sky"}, callback );
```

The same with loadMesh:

```javascript
renderer.loadMesh( "data/sky.obj", callback ); //callback in case we want to execute  a function when the mesh is loaded
```


## Materials

Rendeer objects are rendered based on the properties of the node (mesh, transform) and its material (shader, textures and uniforms).

You can assign a material name to the node.material, and have a material registered in RD.Materials that will handle the rendering.

Materials should have a material.render method in charge of the rendering.

Check ```Material.prototype.render = function( renderer, model, mesh, indices_name, group_index )``` to know more.


### Using GLTF

You can easily load a GLTF scene. First be sure to include the rendeer-gltf.js library or use the bundled one found in rendeer.js.

```js
var node = new RD.SceneNode();
node.loadGLTF("myfile.gltf");
scene.root.addChild(node);
```

### The input

To get the user input you must use LiteGL input build-in system to catch the events.

To get the mouse actions:

```javascript
context.onmousedown = function(e){ ... }
context.onmousemove = function(e){ ... }
context.onmouseup = function(e){ ... }
context.onmouswheel = function(e){ ... }
context.captureMouse(true);
```

The mouse event will have some useful extra properties like 'canvasx' and 'canvasy' with the local canvas mouse coordiantes, the property 'dragging' to tell you if the use is dragging the mouse (holding one button), and the 'wheel' to know the mouse wheel offset. 

This properties are unified among browsers.

To get the keyboard input:

```javascript
context.onkeydown = function(e){ ... }
context.onkeyup = function(e){ ... }
context.captureKeyboard(true);
```

You can also read which keys are pressed using the context.keys container:

```javascript
if( context.keys["UP"] ) ...
```

Here is an example of an orbital camera:
```js
//input
renderer.context.captureMouse(true);
renderer.context.onmousemove = function(e)
{
	if(e.dragging)
	{
		if(e.buttons & 4 ) //middle mouse
		{
			camera.moveLocal( [-e.deltax, e.deltay, 0], 0.1 );
		}
		else
		{
			camera.orbit( e.deltax * -0.01, [0,1,0] );
			camera.orbit( e.deltay * -0.01, [1,0,0], null, true );
		}
	}
}

renderer.context.onmousewheel = function(e)
{
	camera.orbitDistanceFactor( 1 + (e.wheel / 100) * -0.1 );
}
```

## Ray Picking
In case you want to know which node is below the mouse, Rendeer contains a basic picking system:

First you need the ray:
```js
var ray = camera.getRay( e.canvasx, e.canvasy );
```

Then you must pass it to the scene:

```js
var node = scene.testRay( ray );
``` 

But keep in mind this method is slow as it must test agains all object in the scene.

Check [the picking guide](picking.md) in the repo to know more about this.

## Overwritting the rendering methods

The SceneNode have lots of properties to tweak the rendering like to change the WebGL flags, they are at node.flags
* *node.flags.two_sided*: use cull face or not
* *node.flags.flip_normals*: CCW or CW
* *node.flags.depth_test*: for depth testing
* *node.flags.depth_write*: for gl.depthMask

Also to tweak the blending mode, using the node.blend_mode:

* *RD.BLEND_NONE*: no blending
* *RD.BLEND_ALPHA*: src_alpha, one_minis_src_alpha
* *RD.BLEND_ADD*: src_alpha, one

And to change the rendering order using the node.render_priority:

* *RD.PRIORITY_BACKGROUND*: first rendering stage
* *RD.PRIORITY_OPAQUE*: second rendering stage
* *RD.PRIORITY_ALPHA*: thirth rendering stage
* *RD.PRIORITY_HUD*: last rendering stage

But if you still want to create your own render function, you can create a node.render function like this one:

```javascript
node.render = function( renderer, camera )
{
   //your rendering code
}
```

## Extending Rendeer

Sometimes you want to create your own Rendeer Node class because maybe it generates several render passes or requires some special flags.

You can create the class following the next steps. Keep in mind that you do not have to overwrite the ```render``` method, you can keep the render method but set up ```mesh```, ```shader```, ```uniforms``` and ```textures``` with the propper value for your special rendering algorithm. Whatever works for you.

Here is an example:

```js
class MyNodeClass extends RD.SceneNode
{
	constructor(){
		super();
		if(o)
			this.configure(o);
	}
}
```


### Improving performance

Rendeer does not generate any garbage for the Garbage Collector, this way we ensure that the application won't freeze when the GC kicks in. Try to keep it that way. You can use RD.UP, RD.LEFT, RD.FRONT, etc, when you need constant vectors.

### Final thoughts

Remember that LiteGL provides with lots of useful methods and classes like the class geo to do collision testing against spheres, bounding boxes, etc, or the Octree class to do accurate ray-mesh collision testing.

I suggest to give a look to the Renderer class to see all the interesting things that supports.
