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

Remember that you can convert from local node coordinates to global using localToGlobal:
```js
  var worldpos = mynode.localToGlobal([0,10,0]);
```


## Ray-Mesh collision

But sometimes you want to test ray agains the objects in the scene, in that case the system will generate an octree 
for every mesh to speed up ray mesh collision but still it will test the collision agains all nodes in the scene (no broadphase so it is slow).

The syntax to test a ray against the scene is:

```js
  var node = scene.testRay( ray );
  if(node)
  {
  }
```

If you do not want to test against all the nodes, you can filter to which ones by using the layers system:

By default every node is in layers one and two (layer is 0x3 in hexadecimal, as it has first and second bit).
You can change it:

```js
  //to change one bit
  mynode.setLayerBit( 0x4, 1 );
  
  //to change all bits at once
  mynode.layers = 7; (bit 1, 2 and 4)
  mynode.layers = 0x1 | 0x2 | 0x4; //using ORs
  mynode.layers = (1<<0) | (1<<1) | (1<<2); //using bit shifting
```

And then when testing ray collision we pass the layers we want to test

```js
  var collided_node = scene.testRay( ray, collision_point, max_dist, 0x4 );
```




