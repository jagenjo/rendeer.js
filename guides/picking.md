# Picking

Picking is the action of detecting which object is below the mouse in case you want to select or interact.

## Getting the Ray

In most picking actions you will need to specify the camera ray (the ray that starts at the eye position and crosses through the mouse position).

The mouse parameters should be in webgl coordinates, thats 0,0 is lower-left and not top-left as mouse coords are usually received.

If you are using the onMouse method from LiteGL, then the mouse event will contain the mouse coords in the right form system:

```javascript
var ray = camera.getRay( e.canvasx, e.canvasy );
```

If you have mouse coords only then you can flip them easily:

```javascript
var ray = camera.getRay( e.mousex, gl.canvas.height - e.mousey );
```

Also camera.getRay allows to specify the viewport in case your camera is not using the full viewport.

## Testing the ray with primitives

Testing the ray agains meshes is slow, thats why it is always more useful to test rays against primitive shapes like sphere, plane or box.

The Ray class contains some basic methods to test agains primitives.

These functions return true if there was a collision, and store the collision point inside the ray.

You can test the ray agains an sphere:

```javascript
  if( ray.testSphere( center, radius ) )
  {
    var coll = ray.collision_point;
  }
```

You can test the ray agains a plane:

```javascript
  if( ray.testPlane( point, normal ) )
  {
    var coll = ray.collision_point;
  }
```

## Ray-Mesh collision

But sometimes you want to test ray agains the objects in the scene, in that case the system will generate an octree 
for every mesh to speed up ray mesh collision but still it will test the collision agains all nodes in the scene (no broadphase).

The syntax to test a ray agains the scene is:

```js
  var node = scene.testRay( ray );
  if(node)
  {
  }
```

The scene.testRay method supports many parameters, to filter to which nodes to test, etc.


