# Rendeer

Rendeer is a javascript library to render 3D Scenes in WebGL that provides a scene graph and a simple renderer.

It doesnt forces any rendering pipeline and the user is in charge of creating the shaders and the behaviour for every element.

Rendeer is a helper environment for most of the common scene graph actions, like positioning on the world, creating hierarchies, crawling the scene graph and rendering to the screen, but the programmer has total freedom to use only parts of it.

It relies on LiteGL.js for the low-level actions (compile shaders, upload textures, create meshes and get the user input), so it is mandatory to know the basic components of LiteGL in order to use Rendeer.js (although it is very simple).


## How to Start

There is boilerplate folder in the repository to help creating a basic full-website WebGL application.
It comes with some shaders and an example of how to use LiteGL and Rendeer together to get some nice effects.

### Libraries

You must include gl-matrix.js, litegl.js and rendeer.js, although there is a rendeer.full.min.js that includes all three libraries, I recommend to use the separated ones so you can debug easily. I havent test if there is any performance gain in using the minified version.

About the libraries it uses, some remarks:

* gl-matrix has an specific way of working that some people could feel is not very user-friendly but it was made to have the best performance possible in Javascript, just check some examples to understand it better.
* litegl.js is a very low-level API, it wraps some actions common to WebGL, but if you want to do anything manually feel free to call the WebGL API directly, the only problem will be that Rendeer expects some basic classes to handle the render *like GL.Shader, GL.Texture and GL.Mesh) but if you bypasss the rendering stage there is no problem.

Although not mandatory I recommend to also include Canvas2DToWebGL.js, a library that helps using the Canvas2D API inside WebGL, something useful if you want to skip using the DOM.

### The WebGL context

Rendeers requires that you pass an existing WebGL Context when creating the renderer (RD.Renderer), to create the context you must use LiteGL, you cannot pass another WebGL Context created by another library.

To create the GL context follow the LiteGL.js guide, but here is an example:

```javascript
var context = GL.create({width:800,height:600});
```

You can also pass an existing HTMLCanvas element instead of the size, or any parameter from WebGL like alpha or stencil flags.

Remember that the context created with LiteGL is also assigned as a global var (window.gl) so you can call the WebGL API from anywhere:

```javascript
gl.enable( gl.DEPTH_TEST );
```

### The Scene 

There are two classes to keep in mind when using the scene graph, the Scene class that contains all the scene info and the nodes, and the SceneNode that represents every node in the scene.

We must create a RD.Scene to contain our scene:

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

We use SceneNodes to render meshes on the screen, so the three main properties to keep in mind are node.mesh, node.shader and node.textures.
All three store strings, although textures is an object where you can store different textures for different channels (color, specular, etc).

The strings are the name of the assets that will be fetched when rendering, those assets must be stored in the Renderer's containers (meshes, shaders and textures), which are the sames in the gl context (you can use them indistinguishable).

But user is in charge of loading the assets manually, Rendeer does not perform loading automatically, so add your resources to those containers before using them.

### The SceneNode transformations

To perform transformations in the SceneNode there are three main properties in every SceneNode, which are position, rotation and scaling. You can also access the local matrix in ```_local_matrix``` or the global matrix in ```_global_matrix```.

### The Camera

Cameras are not part of the scene and cannot be attached directly to the Scene (although they can be stored in a node if you want).

```javascript
var camera = new RD.Camera();
camera.perspective(fov,aspect,near,far);
camera.lookAt([100,100,100],[0,0,0],[0,1,0]);
```

When rendering the scene you must supply which camera you want to use.

You have all the matrices in  ```_view_matrix```,```_projection_matrix``` and ```_viewprojection_matrix``` plus a ```_model_matrix``` with the inverse of the view. Matrices use a lazy update, so remember to change the ```_must_update_matrix``` when changing the matrices manually.

Cameras have all the common properties of cameras, keep in mind that instead of eye and center it uses position and target.
Check the API for some useful functions like move, orbit or rotate

Cameras do not perform frustum culling but they provide methods so you can do it.

### The Renderer 

To render the scene we need a Renderer, to create one we must supply an existing WebGLContext created with LiteGL.

```javascript
var renderer = new RD.Renderer( context );
```

The Renderer is in charge of allocating resources in the GPU and of performing the rendering of one frame.

So if we want to be able to see the scene we need to render one frame by calling the render function:

```javascript
renderer.render( scene, camera );
```

### The resources

Remember that SceneNodes don't contain the assets, they use strings to reference the assets, which must be stored inside the Renderer, this way we can use the same scene in several Canvas in the DOM.

To load a texture you can use the LiteGL functions manually and store the result in renderer.textures or call the renderer method loadTexture;

```javascript
renderer.loadTexture( "data/sky.jpg", {name: "sky"}, callback );
```

The same with loadMesh.

### The shaders

For shaders you can use the old approach of compiling your own shaders and storing them in renderer.shaders or use our build-in system to compile several shaders that come from a single text file.

To do so you must create what we call an Files Atlas (every back-slash creates a new virtual file with the given name).
Here is an example of a file atlas and its syntax:

```
\shaders
flat flat.vs flat.fs
phong phong.vs phong.fs

\flat.vs
//your vertex shader...

\flat.fs
//your fragment shader...

\phong.vs
//your vertex shader...

\phong.fs
//your fragment shader...
```

To load it just call loadShaders from the renderer:

```javascript
renderer.loadShaders( atlas_url );
```

This function will fetch for the virtual file called 'shaders' and for every line the first word is the name of the shader, the second the name of the vertex shader and the thirth is the name of the fragment shader.

It also allows to pass a fourth parameter with some given macros in this format: {"USE_ALPHA":""}

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

### Overwritting the rendering methods

The SceneNode have lots of properties to tweak the rendering like to change the WebGL flags, they are at node.flags
* node.flags.two_sided: use cull face or not
* node.flags.flip_normals: CCW or CW
* node.flags.depth_test: for depth testing
* node.flags.depth_write: for gl.depthMask

Also to tweak the blending mode, using the node.blend_mode:

* RD.BLEND_NONE: no blending
* RD.BLEND_ALPHA: src_alpha, one_minis_src_alpha
* RD.BLEND_ADD: src_alpha, one

And to change the rendering order using the node.render_priority:

* RD.PRIORITY_BACKGROUND: first rendering stage
* RD.PRIORITY_OPAQUE: second rendering stage
* RD.PRIORITY_ALPHA: thirth rendering stage
* RD.PRIORITY_HUD: last rendering stage

But if you still want to create your own render function, you can create a node.render function like this one:

```javascript
node.render = function( renderer, camera )
{
   //your rendering code
}
```

### Final thoughts

Remember that LiteGL provides with lots of useful methods and classes like the class geo to do collision testing against spheres, bounding boxes, etc, or the Octree class to do accurate ray-mesh collision testing.

I suggest to give a look to the Renderer class to see all the interesting things that supports.
