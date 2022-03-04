# Matrices and Vectors

When working with 3D spaces it is common to need to do vector and matrix operations, for actions like translating object, rotating, projecting, etc.

Most of the common actions are already available as methods in the class RD.SceneNode or RD.Camera, but if you want to operate, here is a list of tips.

## gl-matrix.js

Rendeer relies in gl-matrix for all maths operations. This library is a very powerful library that comes with all common methods to do 3D maths, like:

- **vec2**, **vec3** and **vec4** for vectors
- **mat3** and **mat4** for matrices
- **quat** for quaternions.

Besides that, it contains methods for all kind of mathematical operations, like adding vectors, multiply vector with matrix, dot products, cross products, distance, etc.

To check all available methods I recommend to read the [documentation](https://glmatrix.net/) or to use the console to see the methods available for vec3 and mat4.

One important thing to consider is that gl-matrix uses typed arrays to store vectors and matrices. That means that when you create a vec3 using vec3.create,
internally it is the same as using ```new Float32Array(3)```, it is just more convenient.
```js
  //creating a vector 3
  var delta = vec3.create(); //using gl-matrix method
  var delta = new Float32Array(3); //the same
  var delta = [0,0,0]; //it will work the same, although a little bit slower as it uses dynamic arrays
```

Also remember that typed arrays are not well stringified when using JSON.stringify, so it is always better to convert them to regular arrays.
```js
  var delta = vec3.toArray(delta); //converts to regular array
```

When using any of the gl-matrix methods to do vector or matrices operations, remember that the syntax of any function that returns a vector or matrix requires to pass
as first parameter where the result will be stored.

```js
var C = vec3.create();
vec3.add( C, A, B ); //C = A + B
```

The reason to use this syntax is to allow to reuse containers instead of creating new ones constantly, which will produce garbage for the GC.

## Transform

Every RD.SceneNode constains information of its transform separated as:
- position: the translation relative to its parent
- rotation: the orientation relative to its parent
- scaling: the size relative to its parent

All this properties will be used to define the transform matrix (model matrix) of the object.
- node._local_matrix: contains the mat4 matrix transform relative to its parent.
- node._global_matrix: contains the mat4 matrix transform relative to the world.

## Lazy update

One problem is that updating the matrix is slow, so we only update it when the position, rotation or scaling changes (lazy update).

This is usually done automatically when assigning a new value to node.position, node.rotation or node.scaling or calling any of the move, rotate, scale methods.

But you can ensure the matrix will be updated calling:

```js
node.updateMatrices();
```

This is required when we modify position, rotation or scaling accesing the values of the container instead of using the assign operator.
```js
node.position = A; //this will call the setter which will update the matrix automatically
node.position[1] = 10; //this wont call the setter so the matrix wont be updated automatically.
```

## Avoiding GC

One problem when using a Garbage Collected language like Javascript is that every now and then the Garbage Collector needs to clean up unreferenced objects from memory.
This process could slow down your application so to avoid that I recommend to reuse the same temporal variables when doing operations.

